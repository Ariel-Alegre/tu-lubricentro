const test = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { io } = require('socket.io-client');

test('cambiar contraseña exige clave actual, revoca sesiones propias por socket y conserva otros comercios', async () => {
  const child = fork(require.resolve('./fixtures/tenant-server.cjs'), [], { env: { ...process.env, TEST_PORT: '0' }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const sockets = [];
  try {
    const [{ port }] = await once(child, 'message', { signal: AbortSignal.timeout(10000) });
    const base = `http://127.0.0.1:${port}`;
    const req = (path, body, token, method = 'POST') => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const login = (slug, password = '123456') => req('/api/tenant/login', { email: `${slug}@example.test`, password });
    const first = await (await login('el-cano')).json();
    const other = await (await login('lorenzo')).json();
    async function connect(account) {
      const { ticket } = await (await req(`/api/tenant/${account.slug}/socket`, undefined, account.token)).json();
      const socket = io(base, { auth: { ticket }, transports: ['websocket'], reconnection: false, autoConnect: false }); sockets.push(socket);
      const ready = once(socket, 'session:ready', { signal: AbortSignal.timeout(5000) }); socket.connect(); await ready;
      return socket;
    }
    const own1 = await connect(first); const own2 = await connect(first); const foreign = await connect(other);
    const path = '/api/tenant/el-cano/password';
    const body = { currentPassword: '123456', newPassword: '654321' };
    assert.equal((await req(path, body)).status, 401);
    assert.equal((await req(path, body, other.token)).status, 403);
    for (const invalid of [null, 123456, '', '12345', 'a'.repeat(129)]) {
      assert.equal((await req(path, { ...body, newPassword: invalid }, first.token)).status, 400);
    }
    assert.equal((await req(path, { ...body, currentPassword: 'incorrecta' }, first.token)).status, 400);
    assert.equal((await req(path, { ...body, newPassword: '123456' }, first.token)).status, 400);
    assert.equal((await req('/api/tenant/el-cano/session', undefined, first.token, 'GET')).status, 200, 'errores de validación no cierran sesión');
    const revoked1 = once(own1, 'session:revoked', { signal: AbortSignal.timeout(5000) });
    const revoked2 = once(own2, 'session:revoked', { signal: AbortSignal.timeout(5000) });
    const response = await req(path, body, first.token);
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(await revoked1, ['password-changed']); assert.deepEqual(await revoked2, ['password-changed']);
    assert.equal((await req('/api/tenant/el-cano/session', undefined, first.token, 'GET')).status, 403);
    assert.equal((await login('el-cano')).status, 401, 'la clave anterior deja de funcionar');
    const renewed = await login('el-cano', '654321'); assert.equal(renewed.status, 200);
    const account = await renewed.json(); assert.equal(require('jsonwebtoken').decode(account.token).exp, undefined);
    assert.equal((await req('/api/tenant/el-cano/session', undefined, account.token, 'GET')).status, 200);
    assert.equal(foreign.connected, true);
    assert.equal((await req('/api/tenant/lorenzo/session', undefined, other.token, 'GET')).status, 200);
  } finally { sockets.forEach((socket) => socket.disconnect()); child.kill(); }
});

test('PostgreSQL: cambiar contraseña compara versión y hash y no modifica cuentas inactivas', async () => {
  const db = new (require('@electric-sql/pglite').PGlite)();
  const pg = require('pg'); const descriptor = Object.getOwnPropertyDescriptor(pg, 'Pool');
  const previousHost = process.env.DB_HOST; process.env.DB_HOST = 'test-in-memory';
  const adapter = { async query(sql, values) { return values ? db.query(sql, values) : (await db.exec(sql)).at(-1); } };
  Object.defineProperty(pg, 'Pool', { configurable: true, value: class { constructor() { return adapter; } } });
  const modulePath = require.resolve('../src/lubricentros-store'); delete require.cache[modulePath];
  const store = require(modulePath);
  try {
    const record = await store.create({ nombre: 'Prueba', slug: 'prueba', email: 'prueba@example.test', telefono: '', direccion: '', ciudad: '', provincia: '', responsable: '' }, 'hash-anterior');
    const before = await store.findAccountById(record.id);
    assert.equal((await store.changePassword(before, 'hash-nuevo')).id, record.id);
    const after = await store.findAccountById(record.id);
    assert.equal(after.password_hash, 'hash-nuevo'); assert.equal(after.auth_version, before.auth_version + 1);
    assert.equal(await store.changePassword(before, 'hash-obsoleto'), undefined, 'una solicitud obsoleta no sobrescribe la contraseña');
    assert.equal(await store.changePassword({ ...after, password_hash: 'incorrecto' }, 'hash-obsoleto'), undefined);
    await store.updateStatus(record.id, 'Inactivo');
    const inactive = await store.findAccountById(record.id);
    assert.equal(await store.changePassword(inactive, 'otro-hash'), undefined);
    assert.equal((await store.findAccountById(record.id)).password_hash, 'hash-nuevo');
  } finally {
    Object.defineProperty(pg, 'Pool', descriptor); delete require.cache[modulePath];
    if (previousHost === undefined) delete process.env.DB_HOST; else process.env.DB_HOST = previousHost;
    await db.close();
  }
});
