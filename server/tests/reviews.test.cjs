const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { io: connect } = require('socket.io-client');

test('reseñas: PostgreSQL, permisos por comercio, validación, historial y cambios públicos por socket', async () => {
  process.env.ADMIN_JWT_SECRET = 'test-only-reviews-secret';
  const db = new (require('@electric-sql/pglite').PGlite)();
  const pg = require('pg'); const descriptor = Object.getOwnPropertyDescriptor(pg, 'Pool');
  const previousHost = process.env.DB_HOST; process.env.DB_HOST = 'test-in-memory';
  const adapter = { async query(sql, values) { const result = values ? await db.query(sql, values) : (await db.exec(sql)).at(-1); return { ...result, rowCount: result.rows?.length || result.affectedRows || 0 }; }, async connect() { return { ...adapter, release() {} }; } };
  Object.defineProperty(pg, 'Pool', { configurable: true, value: class { constructor() { return adapter; } } });
  const modulePath = require.resolve('../src/lubricentros-store'); delete require.cache[modulePath];
  const store = require(modulePath);
  const { signAccount } = require('../src/tenant-auth');
  const server = require('node:http').createServer(require('../src/app'));
  const realtime = require('../src/realtime').attachRealtime(server);
  const sockets = [];
  try {
    const accounts = [];
    for (const slug of ['el-cano', 'lorenzo']) {
      const created = await store.create({ nombre: slug, slug, email: `${slug}@example.test`, telefono: '', direccion: '', ciudad: '', provincia: '', responsable: '' }, 'test');
      accounts.push(await store.findAccountById(created.id));
    }
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const tokens = accounts.map((a) => signAccount(a));
    const req = (path, body, owner = 0, token = tokens[owner]) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    let response = await req('/api/tenant/el-cano/customers', { solicitudId: randomUUID(), nombre: 'Cliente', patente: 'AB123CD', marca: 'Ford', modelo: 'Fiesta', telefono: '', fecha: '2026-11-28', servicio: 'Cambio de aceite', productos: [], kilometraje: 1000, observaciones: '', monto: '100', metodoPago: null });
    assert.equal(response.status, 201);
    const historyPath = '/api/history/vehicle/el-cano/AB123CD';
    assert.equal('reviewsUrl' in await (await req(historyPath)).json(), false);
    async function socket(namespace, auth, readyEvent) {
      const s = connect(base + namespace, { auth, transports: ['websocket'], autoConnect: false, reconnection: false }); sockets.push(s);
      const ready = once(s, readyEvent, { signal: AbortSignal.timeout(5000) }); s.connect(); await ready; return s;
    }
    const profile = await socket('/public', { slug: 'el-cano' }, 'profile:ready');
    const history = await socket('/history', { slug: 'el-cano', plate: 'AB123CD' }, 'history:ready');
    const other = await socket('/public', { slug: 'lorenzo' }, 'profile:ready');
    let otherChanges = 0; other.on('profile:changed', () => otherChanges++);
    const path = '/api/tenant/el-cano/reviews';
    assert.equal((await req(path, { reviewsUrl: '' }, 0, null)).status, 401);
    assert.equal((await req(path, { reviewsUrl: '' }, 1)).status, 403);
    for (const invalid of [null, 23, 'javascript:alert(1)', 'http://g.page/review', 'https://google.com.evil.test/review', 'https://evil.test', 'https://user:pass@google.com/maps', 'https://google.com:444/maps', 'x'.repeat(2049)]) assert.equal((await req(path, { reviewsUrl: invalid })).status, 400);
    const url = 'https://g.page/r/test/review';
    const changedProfile = once(profile, 'profile:changed', { signal: AbortSignal.timeout(5000) });
    const changedHistory = once(history, 'history:changed', { signal: AbortSignal.timeout(5000) });
    response = await req(path, { reviewsUrl: ` ${url} ` }); assert.equal(response.status, 200);
    const account = await response.json(); assert.equal(account.reviewsUrl, url); assert.equal(account.password_hash, undefined); assert.equal(account.auth_version, undefined);
    await changedProfile; await changedHistory;
    assert.equal((await store.findAccountById(accounts[0].id)).auth_version, accounts[0].auth_version);
    assert.equal((await (await req('/api/lubricentros/el-cano')).json()).reviewsUrl, url);
    assert.equal((await (await req(historyPath)).json()).reviewsUrl, url);
    assert.equal((await (await req('/api/lubricentros/lorenzo')).json()).reviewsUrl, '');
    const detail = await (await req(historyPath)).json(); assert.equal('nombre' in detail, false); assert.equal('monto' in detail.visitas[0], false);
    for (const valid of ['https://search.google.com/local/writereview?placeid=123', 'https://maps.app.goo.gl/test', 'https://www.google.com.ar/maps']) assert.equal((await req(path, { reviewsUrl: valid })).status, 200);
    assert.equal((await req(path, { reviewsUrl: '' })).status, 200);
    assert.equal('reviewsUrl' in await (await req(historyPath)).json(), false);
    assert.equal(otherChanges, 0);
    await store.updateStatus(accounts[0].id, 'Inactivo');
    assert.equal((await req(path, { reviewsUrl: url })).status, 403);
  } finally {
    sockets.forEach((s) => s.disconnect()); await new Promise((resolve) => realtime.close(resolve));
    Object.defineProperty(pg, 'Pool', descriptor); delete require.cache[modulePath];
    if (previousHost === undefined) delete process.env.DB_HOST; else process.env.DB_HOST = previousHost;
    await db.close();
  }
});
