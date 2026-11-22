const test = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const { io } = require('socket.io-client');
const sharp = require('sharp');

test('perfil público recibe todos los cambios por socket, aislado y sin datos privados', async () => {
  const child = fork(path.join(__dirname, 'fixtures/tenant-server.cjs'), [], { env: { ...process.env, TEST_PORT: '0' }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const sockets = [];
  try {
    const [{ port }] = await once(child, 'message', { signal: AbortSignal.timeout(10000) });
    const base = `http://127.0.0.1:${port}`;
    const request = (url, method = 'GET', body, token) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const login = await request('/api/tenant/login', 'POST', { email: 'el-cano@example.test', password: '123456' });
    const { token } = await login.json();
    async function watch(slug) {
      const socket = io(`${base}/public`, { transports: ['websocket'], auth: { slug }, autoConnect: false, reconnection: false }); sockets.push(socket);
      const ready = once(socket, 'profile:ready', { signal: AbortSignal.timeout(3000) }); socket.connect(); await ready; return socket;
    }
    const cano = await watch('el-cano'); const lorenzo = await watch('lorenzo');
    let otherEvents = 0; lorenzo.on('profile:changed', () => otherEvents++);
    const nextChange = () => once(cano, 'profile:changed', { signal: AbortSignal.timeout(3000) });
    async function mutation(url, method, data, expected = 200) {
      const event = nextChange(); const response = await request(url, method, data, token); assert.equal(response.status, expected);
      const [payload] = await event; assert.deepEqual(payload, { slug: 'el-cano', available: true }); return response.json();
    }
    const products = '/api/tenant/el-cano/products'; const services = '/api/tenant/el-cano/services';
    const product = await mutation(products, 'POST', { nombre: 'Aceite', precio: '1200' }, 201);
    await mutation(`${products}/${product.id}`, 'PUT', { nombre: 'Aceite nuevo', precio: '1500' });
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#155fa0' } }).png().toBuffer();
    for (const route of [`${products}/${product.id}/image`, '/api/tenant/el-cano/images/profile', '/api/tenant/el-cano/images/cover']) {
      const body = new FormData(); body.append('image', new Blob([png], { type: 'image/png' }), 'foto.png');
      const event = nextChange(); const response = await fetch(base + route, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body }); assert.equal(response.status, 200); await event;
    }
    const service = await mutation(services, 'POST', { nombre: 'Cambio de aceite' }, 201);
    await mutation(`${services}/${service.id}`, 'PUT', { nombre: 'Cambio de filtros' });
    await mutation(`${services}/${service.id}`, 'DELETE');
    await mutation(`${products}/${product.id}`, 'DELETE');
    const profile = await (await request('/api/lubricentros/el-cano')).json(); assert.equal(profile.hasCover, true); assert.deepEqual(profile.products, []); assert.deepEqual(profile.services, []);
    assert.equal(otherEvents, 0, 'los cambios no se emiten al otro lubricentro');
    const invalid = io(`${base}/public`, { auth: { slug: '../admin' }, autoConnect: false, reconnection: false }); sockets.push(invalid);
    const rejection = once(invalid, 'connect_error', { signal: AbortSignal.timeout(3000) }); invalid.connect(); assert.equal((await rejection)[0].data.status, 404);
    const unauthorized = await request(products, 'POST', { nombre: 'Sin sesión', precio: '1' }); assert.equal(unauthorized.status, 401);
    const root = await (await request('/api/admin/login', 'POST', { email: 'root@example.test', password: 'root-test-password' })).json();
    const id = '00000000-0000-4000-8000-000000000001';
    let event = nextChange(); let response = await request(`/api/admin/lubricentros/${id}/estado`, 'PATCH', { estado: 'Inactivo' }, root.token); assert.equal(response.status, 200); assert.equal((await event)[0].available, false);
    assert.equal((await request('/api/lubricentros/el-cano')).status, 404);
    event = nextChange(); await request(`/api/admin/lubricentros/${id}/estado`, 'PATCH', { estado: 'Activo' }, root.token); assert.equal((await event)[0].available, true);
    event = nextChange();
    response = await request(`/api/admin/lubricentros/${id}`, 'PUT', { nombre: 'Nombre actualizado', slug: 'el-cano-nuevo', email: 'el-cano@example.test', telefono: '1145678900', direccion: 'Otra dirección', ciudad: 'Buenos Aires', provincia: 'Buenos Aires', responsable: 'Prueba' }, root.token);
    assert.equal(response.status, 200); assert.deepEqual((await event)[0], { slug: 'el-cano-nuevo', available: true });
    assert.equal((await request('/api/lubricentros/el-cano')).status, 404);
    assert.equal((await (await request('/api/lubricentros/el-cano-nuevo')).json()).nombre, 'Nombre actualizado');
    for (const kind of ['cover', 'profile']) assert.equal((await request(`/api/lubricentros/el-cano-nuevo/images/${kind}`)).status, 200, 'las fotos se conservan al cambiar el slug');
    cano.disconnect(); const reconnected = await watch('el-cano-nuevo'); assert.equal(reconnected.connected, true);
  } finally {
    sockets.forEach((socket) => socket.disconnect()); child.kill(); await once(child, 'exit');
  }
});
