const test = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { io } = require('socket.io-client');

test('paneles sincronizados: catálogo privado, root autenticado y tickets aislados', async () => {
  const child = fork(path.join(__dirname, 'fixtures/tenant-server.cjs'), [], { env: { ...process.env, TEST_PORT: '0' }, stdio: ['ignore','ignore','inherit','ipc'] });
  const sockets = [];
  try {
    const [{ port }] = await once(child, 'message', { signal: AbortSignal.timeout(15000) }); const base = `http://127.0.0.1:${port}`;
    const req = (url, method = 'GET', body, token) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    async function socket(namespace, auth, event) { const s = io(base + namespace, { auth, transports: ['websocket'], autoConnect: false, reconnection: false, forceNew: true }); sockets.push(s); const ready = once(s, event, { signal: AbortSignal.timeout(5000) }); s.connect(); return { s, ready }; }
    const rootLogin = await (await req('/api/admin/login', 'POST', { email: 'root@example.test', password: 'root-test-password' })).json(); assert.equal(jwt.decode(rootLogin.token).exp, undefined);
    assert.equal((await req('/api/admin/socket', 'POST')).status, 401);
    const rootTicket = await (await req('/api/admin/socket', 'POST', undefined, rootLogin.token)).json(); assert.ok(jwt.decode(rootTicket.ticket).exp);
    assert.equal((await req('/api/admin/lubricentros', 'GET', undefined, rootTicket.ticket)).status, 401, 'ticket del socket no sirve para la API');
    const rootA = await socket('/root', { ticket: rootTicket.ticket }, 'root:ready'); await rootA.ready;
    const rootB = await socket('/root', { ticket: rootTicket.ticket }, 'root:ready'); await rootB.ready;
    const tenant = await (await req('/api/tenant/login', 'POST', { email: 'el-cano@example.test', password: '123456' })).json();
    const tenantTicket = await (await req('/api/tenant/el-cano/socket', 'POST', undefined, tenant.token)).json();
    const owner = await socket('', { ticket: tenantTicket.ticket }, 'session:ready'); await owner.ready;
    const second = await (await req('/api/tenant/login', 'POST', { email: 'lorenzo@example.test', password: '123456' })).json();
    const secondTicket = await (await req('/api/tenant/lorenzo/socket', 'POST', undefined, second.token)).json();
    const other = await socket('', { ticket: secondTicket.ticket }, 'session:ready'); await other.ready;
    const guest = await socket('/public', { slug: 'el-cano' }, 'profile:ready'); await guest.ready;
    let leaked = 0; other.s.on('catalog:changed', () => leaked++); other.s.on('profile:changed', () => leaked++); guest.s.on('catalog:changed', () => leaked++); guest.s.on('lubricentros:changed', () => leaked++); owner.s.on('lubricentros:changed', () => leaked++);
    for (const ticket of ['', tenantTicket.ticket, rootLogin.token]) {
      const invalid = await socket('/root', { ticket }, 'connect_error'); const [cause] = await invalid.ready; assert.equal(cause.data.status, 401);
    }
    const catalog = () => once(owner.s, 'catalog:changed', { signal: AbortSignal.timeout(5000) });
    const products = '/api/tenant/el-cano/products'; let event = catalog();
    let response = await req(products, 'POST', { nombre: 'Aceite', precio: '200' }, tenant.token); assert.equal(response.status, 201); const product = await response.json(); await event;
    event = catalog(); response = await req(`${products}/${product.id}`, 'PUT', { nombre: 'Aceite nuevo', precio: '250', stock: 25 }, tenant.token); assert.equal(response.status, 200); assert.equal((await response.json()).stock, 25); await event;
    const png = await require('sharp')({ create: { width: 32, height: 32, channels: 3, background: '#155fa0' } }).png().toBuffer();
    function form() { const body = new FormData(); body.append('image', new Blob([png], { type: 'image/png' }), 'foto.png'); return body; }
    event = catalog(); response = await fetch(`${base}${products}/${product.id}/image`, { method: 'POST', headers: { Authorization: `Bearer ${tenant.token}` }, body: form() }); assert.equal(response.status, 200); await event;
    event = catalog(); response = await req(`${products}/${product.id}`, 'DELETE', undefined, tenant.token); assert.equal(response.status, 200); await event;
    const services = '/api/tenant/el-cano/services'; event = catalog(); response = await req(services, 'POST', { nombre: 'Cambio de aceite' }, tenant.token); assert.equal(response.status, 201); const service = await response.json(); await event;
    event = catalog(); await req(`${services}/${service.id}`, 'PUT', { nombre: 'Cambio de filtros' }, tenant.token); await event;
    event = catalog(); await req(`${services}/${service.id}`, 'DELETE', undefined, tenant.token); await event;
    const profile = once(owner.s, 'profile:changed', { signal: AbortSignal.timeout(5000) }); response = await fetch(`${base}/api/tenant/el-cano/images/profile`, { method: 'POST', headers: { Authorization: `Bearer ${tenant.token}` }, body: form() }); assert.equal(response.status, 200); await profile;
    const data = { nombre: 'Nuevo comercio', slug: 'nuevo-comercio', email: 'nuevo@example.test', telefono: '1144445555', direccion: 'Calle 123', ciudad: 'Buenos Aires', provincia: 'Buenos Aires', responsable: 'Responsable', password: '123456' };
    async function rootMutation(url, method, body, status) { const a = once(rootA.s, 'lubricentros:changed', { signal: AbortSignal.timeout(5000) }); const b = once(rootB.s, 'lubricentros:changed', { signal: AbortSignal.timeout(5000) }); const r = await req(url, method, body, rootLogin.token); assert.equal(r.status, status); await Promise.all([a,b]); return r.json(); }
    const created = await rootMutation('/api/admin/lubricentros', 'POST', data, 201);
    await rootMutation(`/api/admin/lubricentros/${created.id}`, 'PUT', { ...data, nombre: 'Comercio editado' }, 200);
    await rootMutation(`/api/admin/lubricentros/${created.id}/estado`, 'PATCH', { estado: 'Inactivo' }, 200);
    assert.equal(leaked, 0, 'los eventos privados no llegan a otro negocio ni a invitados');
    assert.equal((await (await req('/api/admin/lubricentros', 'GET', undefined, rootLogin.token)).json()).find((item) => item.id === created.id).estado, 'Inactivo');
  } finally { sockets.forEach((s) => s.disconnect()); child.kill(); await once(child, 'exit'); }
});
