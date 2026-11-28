const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { io: connect } = require('socket.io-client');
const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const week = () => days.map((day, index) => ({ day, closed: index !== 0, ranges: index ? [] : [{ from: '09:00', to: '13:00' }, { from: '16:00', to: '20:00' }] }));

test('horarios: persistencia PostgreSQL, validación semanal, sin estado manual y aislamiento por socket', async () => {
  process.env.ADMIN_JWT_SECRET = 'test-only-hours-secret';
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
    const accounts = [];
    for (const slug of ['el-cano', 'lorenzo']) {
      const business = await store.create({ nombre: slug, slug, email: `${slug}@example.test`, telefono: '1144445555', responsable: 'Responsable' }, 'test');
      accounts.push(await store.findAccountById(business.id));
    }
    assert.deepEqual(accounts[0].openingHours, []); assert.equal(accounts[0].isOpen, undefined);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const tokens = accounts.map((a) => signAccount(a));
    const req = (body, token = tokens[0]) => fetch(base + '/api/tenant/el-cano/hours', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const availability = (temporarilyClosed, token = tokens[0]) => fetch(base + '/api/tenant/el-cano/availability', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ temporarilyClosed }) });
    async function socket(namespace, auth, readyEvent) {
      const s = connect(base + namespace, { auth, transports: ['websocket'], autoConnect: false, reconnection: false }); sockets.push(s);
      const ready = once(s, readyEvent, { signal: AbortSignal.timeout(5000) }); s.connect(); await ready; return s;
    }
    const publicSocket = await socket('/public', { slug: 'el-cano' }, 'profile:ready');
    const otherSocket = await socket('/public', { slug: 'lorenzo' }, 'profile:ready');
    const privateSocket = await socket('', { ticket: signAccount(accounts[0], true) }, 'session:ready');
    let otherChanges = 0; otherSocket.on('profile:changed', () => otherChanges++);
    const body = { openingHours: week() };
    assert.equal((await req(body, null)).status, 401); assert.equal((await req(body, tokens[1])).status, 403);
    const malformed = [null, [], week().slice(0, 6), [...week().slice(0, 6), week()[0]], week().map((item, i) => i ? item : { ...item, closed: 'false' })];
    for (const ranges of [[{ from: '25:00', to: '26:00' }], [{ from: '18:00', to: '09:00' }], [{ from: '09:00', to: '09:00' }], [{ from: '09:00', to: '13:00' }, { from: '12:00', to: '18:00' }], [], Array(4).fill({ from: '09:00', to: '13:00' })]) malformed.push(week().map((item, i) => i ? item : { ...item, ranges }));
    for (const openingHours of malformed) assert.equal((await req({ ...body, openingHours })).status, 400);
    const publicChanged = once(publicSocket, 'profile:changed', { signal: AbortSignal.timeout(5000) });
    const privateChanged = once(privateSocket, 'profile:changed', { signal: AbortSignal.timeout(5000) });
    let response = await req(body); assert.equal(response.status, 200); const saved = await response.json();
    assert.deepEqual(saved.openingHours, week()); assert.equal(saved.isOpen, undefined); assert.equal(saved.password_hash, undefined); await publicChanged; await privateChanged;
    assert.equal((await store.findAccountById(accounts[0].id)).auth_version, accounts[0].auth_version);
    response = await req({ ...body, isOpen: false }); assert.equal(response.status, 200);
    assert.equal((await store.findBySlug('el-cano')).isOpen, undefined, 'no permite fijar un estado manual');
    assert.deepEqual((await store.findBySlug('el-cano')).openingHours[0].ranges, body.openingHours[0].ranges);
    assert.equal((await store.findAccountById(accounts[0].id)).estado, 'Activo', 'cerrar al público no desactiva su cuenta');
    assert.equal((await req({ ...body, isOpen: true })).status, 200);
    assert.equal((await store.findBySlug('el-cano')).isOpen, undefined);
    assert.equal((await db.query('SELECT business_open FROM panel_lubricentros WHERE id=$1', [accounts[0].id])).rows[0].business_open, null);
    assert.deepEqual((await store.findBySlug('lorenzo')).openingHours, []); assert.equal(otherChanges, 0);
    assert.equal((await availability(true, null)).status, 401);
    assert.equal((await availability(true, tokens[1])).status, 403);
    for (const value of [undefined, null, 'false', 1]) assert.equal((await availability(value)).status, 400);
    const closureChanged = once(publicSocket, 'profile:changed', { signal: AbortSignal.timeout(5000) });
    response = await availability(true); assert.equal(response.status, 200); assert.equal((await response.json()).temporarilyClosed, true); await closureChanged;
    assert.equal((await store.findBySlug('el-cano')).temporarilyClosed, true);
    assert.equal((await store.findBySlug('lorenzo')).temporarilyClosed, false);
    assert.equal((await store.findAccountById(accounts[0].id)).estado, 'Activo');
    assert.equal((await req(body)).status, 200);
    assert.equal((await store.findBySlug('el-cano')).temporarilyClosed, true, 'editar horarios no cancela el cierre excepcional');
    assert.equal((await availability(false)).status, 200);
    assert.equal((await store.findBySlug('el-cano')).temporarilyClosed, false);
    assert.deepEqual((await store.findBySlug('el-cano')).openingHours, week());
    assert.equal((await store.findAccountById(accounts[0].id)).auth_version, accounts[0].auth_version);
    await store.updateStatus(accounts[0].id, 'Inactivo'); assert.equal((await req(body)).status, 403);
    assert.equal((await availability(true)).status, 403);
    assert.equal(await store.saveOpeningHours(accounts[0], week()), undefined);
  } finally {
    sockets.forEach((s) => s.disconnect()); await new Promise((resolve) => realtime.close(resolve)); Object.defineProperty(pg, 'Pool', descriptor); delete require.cache[modulePath];
    if (previousHost === undefined) delete process.env.DB_HOST; else process.env.DB_HOST = previousHost;
    await db.close();
  }
});
