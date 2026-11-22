const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { io: connect } = require('socket.io-client');

test('clientes e historial por patente: PostgreSQL real en memoria, aislamiento, duplicados y socket privado', async () => {
  process.env.ADMIN_JWT_SECRET = 'test-customers-only-secret';
  const store = require('../src/lubricentros-store');
  const { signAccount } = require('../src/tenant-auth');
  const accounts = ['el-cano', 'lorenzo'].map((slug) => ({ id: randomUUID(), slug, nombre: slug, estado: 'Activo', auth_version: 0 }));
  const memory = await require('./fixtures/customers-db.cjs')(accounts);
  const mocked = { ...memory.methods, findAccountById: async (id) => accounts.find((item) => item.id === id), findAccountBySlug: async (slug) => accounts.find((item) => item.slug === slug), findBySlug: async (slug) => ({ slug, nombre: slug }), publicProducts: async () => [], publicServices: async () => [] };
  const originals = Object.fromEntries(Object.keys(mocked).map((key) => [key, store[key]])); Object.assign(store, mocked);
  const server = require('node:http').createServer(require('../src/app'));
  const realtime = require('../src/realtime').attachRealtime(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokens = accounts.map((account) => signAccount(account));
  const sockets = [];
  async function socketFor(index, guest = false) {
    const socket = connect(base + (guest ? '/public' : ''), { auth: guest ? { slug: accounts[index].slug } : { ticket: signAccount(accounts[index], true) }, transports: ['websocket'], autoConnect: false, reconnection: false }); sockets.push(socket);
    const ready = once(socket, guest ? 'profile:ready' : 'session:ready', { signal: AbortSignal.timeout(5000) }); socket.connect(); await ready; return socket;
  }
  const req = (suffix = '', method = 'GET', body, owner = 0, token = tokens[owner]) => fetch(`${base}/api/tenant/${accounts[owner].slug}/customers${suffix}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const visit = (overrides = {}) => ({ solicitudId: randomUUID(), fecha: '2026-11-22', servicio: 'Cambio de aceite', productos: ['Aceite 10W-40', 'Filtro'], kilometraje: 120000, observaciones: 'Próximo control a los 130000 km', ...overrides });
  const registration = (overrides = {}) => ({ ...visit(), patente: 'ab 123-cd', nombre: 'Ana Cliente Privado', telefono: '1145678900', marca: 'Ford', modelo: 'Fiesta', ...overrides });
  try {
    const own = await socketFor(0); const other = await socketFor(1); const guest = await socketFor(0, true);
    let ownChanges = 0; let otherChanges = 0; let publicChanges = 0;
    own.on('customers:changed', (...args) => { assert.equal(args.length, 0); ownChanges++; });
    other.on('customers:changed', () => otherChanges++); guest.on('customers:changed', () => publicChanges++); guest.on('profile:changed', () => publicChanges++);
    const body = registration();
    let response = await req('', 'POST', body); assert.equal(response.status, 201); const first = await response.json(); assert.equal(first.patente, 'AB123CD'); assert.equal(first.visitas.length, 1); assert.equal(first.nombre, body.nombre);
    response = await req('', 'POST', body); assert.equal(response.status, 201); assert.equal((await response.json()).visitas.length, 1, 'reintentar no duplica la atención');
    response = await req('', 'POST', registration()); assert.equal(response.status, 409, 'patente única en el lubricentro');
    response = await req('/plate/ab-123-cd'); assert.equal((await response.json()).id, first.id);
    response = await req('/plate/AB123CD', 'GET', undefined, 1); assert.equal(response.status, 404);
    response = await req(`/vehicles/${first.id}`, 'GET', undefined, 1); assert.equal(response.status, 404);
    response = await req(`/vehicles/${first.id}/visits`, 'POST', visit(), 1); assert.equal(response.status, 404);
    response = await req('', 'POST', registration({ clienteId: first.clienteId, patente: 'AA111BB' }), 1); assert.equal(response.status, 404, 'no puede usar un cliente de otro comercio');
    const second = visit({ fecha: '2026-11-23', servicio: 'Cambio de filtros', productos: ['Filtro nuevo'] });
    response = await req(`/vehicles/${first.id}/visits`, 'POST', second); assert.equal(response.status, 201); assert.equal((await response.json()).visitas.length, 2);
    response = await req(`/vehicles/${first.id}/visits`, 'POST', second); assert.equal((await response.json()).visitas.length, 2);
    response = await req('/plate/AB123CD'); const history = await response.json(); assert.equal(history.visitas[0].servicio, 'Cambio de filtros'); assert.deepEqual(history.visitas[1].productos, body.productos, 'conserva los productos de cada trabajo');
    response = await req('', 'POST', registration({ clienteId: first.clienteId, patente: 'ABC123' })); assert.equal(response.status, 201);
    response = await req(); const list = await response.json(); assert.equal(list.clientes.length, 1); assert.equal(list.vehiculos.length, 2, 'reutiliza el cliente con otro vehículo'); assert.equal(list.vehiculos.find((item) => item.id === first.id).totalVisitas, 2);
    response = await req('', 'POST', registration({ patente: 'AB123CD', nombre: 'Otro cliente' }), 1); assert.equal(response.status, 201, 'la misma patente puede atenderse en otro lubricentro');
    response = await req('', 'GET', undefined, 1); assert.equal((await response.json()).clientes[0].nombre, 'Otro cliente');
    const concurrent = await Promise.all([req('', 'POST', registration({ patente: 'XYZ789' })), req('', 'POST', registration({ patente: 'xyz-789' }))]); assert.deepEqual(concurrent.map((item) => item.status).sort(), [201, 409]);
    for (const invalid of [{ fecha: '2026-02-30' }, { fecha: null }, { fecha: '0000-01-01' }, { servicio: ' ' }, { productos: ['x'.repeat(121)] }, { productos: 'Aceite' }, { kilometraje: -1 }, { kilometraje: 1.5 }, { solicitudId: 'fake' }]) { response = await req(`/vehicles/${first.id}/visits`, 'POST', visit(invalid)); assert.equal(response.status, 400); }
    response = await req('', 'POST', registration({ patente: '../secret' })); assert.equal(response.status, 400);
    response = await req('', 'POST', registration({ clienteId: first.clienteId, nombre: 25, patente: 'AA222BB' })); assert.equal(response.status, 400);
    response = await req('', 'GET', undefined, 0, tokens[1]); assert.equal(response.status, 403);
    response = await req('', 'GET', undefined, 0, null); assert.equal(response.status, 401);
    const publicProfile = await (await fetch(base + '/api/lubricentros/el-cano')).json(); assert.equal(JSON.stringify(publicProfile).includes(body.nombre), false); assert.equal(publicProfile.clientes, undefined);
    assert.ok(ownChanges > 0); assert.equal(otherChanges, 1, 'solo recibe el evento de su propio registro'); assert.equal(publicChanges, 0, 'los invitados nunca reciben eventos de clientes');
    await assert.rejects(memory.methods.registerCustomerVehicle(accounts[0], registration({ patente: 'AA777BB', observaciones: 'x'.repeat(1001) })));
    assert.equal(await memory.methods.customerByPlate(accounts[0].id, 'AA777BB'), null, 'una falla revierte el alta completa');
    // La API revalida el estado; el store también lo comprueba dentro de la transacción.
    await memory.db.query("UPDATE panel_lubricentros SET estado='Inactivo' WHERE id=$1", [accounts[0].id]);
    await assert.rejects(memory.methods.addCustomerVisit(accounts[0], first.id, visit()), (cause) => cause.status === 403);
    accounts[0].estado = 'Inactivo'; response = await req(); assert.equal(response.status, 403);
    const count = await memory.db.query('SELECT COUNT(*)::int AS total FROM lubricentro_clientes WHERE lubricentro_id=$1', [accounts[0].id]); assert.equal(count.rows[0].total, 2, 'el conflicto no deja clientes huérfanos');
  } finally {
    sockets.forEach((socket) => socket.disconnect()); await new Promise((resolve) => realtime.close(resolve)); Object.assign(store, originals); await memory.db.close();
  }
});
