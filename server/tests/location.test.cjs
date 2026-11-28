const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { io: connect } = require('socket.io-client');

test('ubicación: alta sin dirección, enlaces Maps por comercio, edición root y sincronización', async () => {
  process.env.ADMIN_JWT_SECRET = 'test-only-location-secret';
  process.env.admin_panel = 'root@example.test'; process.env.admin_password = 'test-root-password';
  const db = new (require('@electric-sql/pglite').PGlite)();
  const pg = require('pg'); const descriptor = Object.getOwnPropertyDescriptor(pg, 'Pool');
  const previousHost = process.env.DB_HOST; process.env.DB_HOST = 'test-in-memory';
  const adapter = { async query(sql, values) { const result = values ? await db.query(sql, values) : (await db.exec(sql)).at(-1); return { ...result, rowCount: result.rows?.length || result.affectedRows || 0 }; } };
  Object.defineProperty(pg, 'Pool', { configurable: true, value: class { constructor() { return adapter; } } });
  const modulePath = require.resolve('../src/lubricentros-store'); delete require.cache[modulePath];
  const store = require(modulePath); const { signAccount } = require('../src/tenant-auth');
  const server = require('node:http').createServer(require('../src/app'));
  const realtime = require('../src/realtime').attachRealtime(server); const sockets = [];
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const req = (path, body, token, method = body === undefined ? 'GET' : 'POST') => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const root = await (await req('/api/admin/login', { email: 'root@example.test', password: 'test-root-password' })).json();
    const data = { nombre: 'Prueba', slug: 'el-cano', email: 'el-cano@example.test', telefono: '1144445555', responsable: 'Responsable', password: '123456' };
    let response = await req('/api/admin/lubricentros', data, root.token); assert.equal(response.status, 201); const created = await response.json(); assert.equal(created.direccion, '');
    const account = await store.findAccountById(created.id); const token = signAccount(account);
    const other = await store.create({ ...data, slug: 'lorenzo', email: 'lorenzo@example.test', direccion: 'Dirección anterior', ciudad: 'Ciudad anterior', provincia: 'Provincia anterior' }, 'test');
    const otherToken = signAccount(await store.findAccountById(other.id));
    async function socket(namespace, auth, readyEvent) {
      const s = connect(base + namespace, { auth, transports: ['websocket'], autoConnect: false, reconnection: false }); sockets.push(s);
      const ready = once(s, readyEvent, { signal: AbortSignal.timeout(5000) }); s.connect(); await ready; return s;
    }
    const profile = await socket('/public', { slug: 'el-cano' }, 'profile:ready');
    const { ticket } = await (await req('/api/admin/socket', {}, root.token)).json();
    const rootSocket = await socket('/root', { ticket }, 'root:ready');
    const path = '/api/tenant/el-cano/location';
    assert.equal((await req(path, { mapsUrl: '' })).status, 401);
    assert.equal((await req(path, { mapsUrl: '' }, otherToken)).status, 403);
    for (const invalid of [null, 42, 'javascript:alert(1)', 'http://maps.app.goo.gl/test', 'https://evil.example/maps', 'https://google.com.evil.example/maps', 'https://google.com/search?q=test', 'https://user:pass@google.com/maps', 'https://google.com:444/maps', 'x'.repeat(4097)]) assert.equal((await req(path, { mapsUrl: invalid }, token)).status, 400);
    const url = 'https://maps.app.goo.gl/test';
    const publicChange = once(profile, 'profile:changed', { signal: AbortSignal.timeout(5000) }); const rootChange = once(rootSocket, 'lubricentros:changed', { signal: AbortSignal.timeout(5000) });
    response = await req(path, { mapsUrl: ` ${url} ` }, token); assert.equal(response.status, 200); assert.equal((await response.json()).mapsUrl, url); await publicChange; await rootChange;
    assert.equal((await store.findBySlug('el-cano')).mapsUrl, url); assert.equal((await store.findBySlug('lorenzo')).mapsUrl, '');
    assert.equal((await store.findAccountById(created.id)).auth_version, account.auth_version, 'guardar ubicación mantiene las sesiones');
    response = await req('/api/admin/lubricentros/' + created.id, { ...data, password: '', nombre: 'Nombre actualizado' }, root.token, 'PUT'); assert.equal(response.status, 200); assert.equal((await response.json()).mapsUrl, url, 'editar en root conserva el enlace del comercio');
    response = await req('/api/admin/lubricentros/' + other.id, { ...data, slug: 'lorenzo', email: 'lorenzo@example.test', password: '' }, root.token, 'PUT'); assert.equal(response.status, 200); assert.equal((await response.json()).direccion, 'Dirección anterior', 'conserva datos históricos al omitir campos');
    const fresh = await store.findAccountById(created.id); const freshToken = signAccount(fresh);
    for (const valid of ['https://www.google.com/maps/place/Test', 'https://www.google.com.ar/maps?cid=123', 'https://maps.google.com/?q=test', 'https://goo.gl/maps/test']) assert.equal((await req(path, { mapsUrl: valid }, freshToken)).status, 200);
    assert.equal((await req(path, { mapsUrl: '' }, freshToken)).status, 200); assert.equal((await store.findBySlug('el-cano')).mapsUrl, '');
    await store.updateStatus(created.id, 'Inactivo'); assert.equal((await req(path, { mapsUrl: url }, freshToken)).status, 403);
  } finally {
    sockets.forEach((s) => s.disconnect()); await new Promise((resolve) => realtime.close(resolve)); Object.defineProperty(pg, 'Pool', descriptor); delete require.cache[modulePath];
    if (previousHost === undefined) delete process.env.DB_HOST; else process.env.DB_HOST = previousHost;
    await db.close();
  }
});
