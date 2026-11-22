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
  const visit = (overrides = {}) => ({ solicitudId: randomUUID(), fecha: '2026-11-22', servicio: 'Cambio de aceite', productos: ['Aceite 10W-40', 'Filtro'], kilometraje: 120000, observaciones: 'Próximo control a los 130000 km', monto: '18500.50', metodoPago: null, ...overrides });
  const registration = (overrides = {}) => ({ ...visit(), patente: 'ab 123-cd', nombre: 'Ana Cliente Privado', telefono: '1145678900', marca: 'Ford', modelo: 'Fiesta', ...overrides });
  try {
    const own = await socketFor(0); const other = await socketFor(1); const guest = await socketFor(0, true);
    let ownChanges = 0; let otherChanges = 0; let publicChanges = 0;
    own.on('customers:changed', (...args) => { assert.equal(args.length, 0); ownChanges++; });
    other.on('customers:changed', () => otherChanges++); guest.on('customers:changed', () => publicChanges++); guest.on('profile:changed', () => publicChanges++);
    const body = registration();
    let response = await req('', 'POST', body); assert.equal(response.status, 201); const first = await response.json(); assert.equal(first.patente, 'AB123CD'); assert.equal(first.visitas.length, 1); assert.equal(first.nombre, body.nombre);
    response = await req(`/vehicles/${first.id}/share`, 'POST', {}, 1); assert.equal(response.status, 404, 'solo el dueño genera el QR');
    response = await req(`/vehicles/${first.id}/share`, 'POST', {}, 0, null); assert.equal(response.status, 401);
    response = await req(`/vehicles/${first.id}/share`, 'POST', {}); assert.equal(response.status, 200); const { token: historyToken } = await response.json(); assert.match(historyToken, /^[a-f0-9]{64}$/);
    response = await req(`/vehicles/${first.id}/share`, 'POST', {}); assert.equal((await response.json()).token, historyToken, 'el QR se mantiene para próximas visitas');
    response = await req(`/vehicles/${first.id}`); assert.equal(JSON.stringify(await response.json()).includes(historyToken), false, 'el enlace no se filtra en consultas comunes');
    const sharedResponse = await fetch(`${base}/api/history/${historyToken}`); assert.equal(sharedResponse.status, 200); assert.equal(sharedResponse.headers.get('cache-control'), 'no-store');
    const shared = await sharedResponse.json(); assert.deepEqual(Object.keys(shared).sort(), ['lubricentro','slug','patente','marca','modelo','visitas'].sort());
    assert.deepEqual(Object.keys(shared.visitas[0]).sort(), ['id','fecha','servicio','productos','kilometraje'].sort()); assert.equal(shared.patente, 'AB123CD');
    assert.equal(JSON.stringify(shared).includes(body.nombre), false); assert.equal(JSON.stringify(shared).includes(body.observaciones), false);
    assert.equal((await fetch(`${base}/api/history/${'0'.repeat(64)}`)).status, 404); assert.equal((await fetch(`${base}/api/history/AB123CD`)).status, 404);
    assert.equal((await fetch(`${base}/api/history/${historyToken}`, { method: 'POST' })).status, 404, 'el acceso compartido es de solo lectura');
    const sharedSocket = connect(base + '/history', { auth: { token: historyToken }, transports: ['websocket'], autoConnect: false, reconnection: false }); sockets.push(sharedSocket);
    const sharedReady = once(sharedSocket, 'history:ready', { signal: AbortSignal.timeout(5000) }); sharedSocket.connect(); await sharedReady;
    let sharedChanges = 0; sharedSocket.on('history:changed', (...args) => { assert.equal(args.length, 0); sharedChanges++; });
    response = await req('', 'POST', body); assert.equal(response.status, 201); assert.equal((await response.json()).visitas.length, 1, 'reintentar no duplica la atención');
    response = await req('', 'POST', registration()); assert.equal(response.status, 409, 'patente única en el lubricentro');
    response = await req('/plate/ab-123-cd'); assert.equal((await response.json()).id, first.id);
    response = await req('/plate/AB123CD', 'GET', undefined, 1); assert.equal(response.status, 404);
    response = await req(`/vehicles/${first.id}`, 'GET', undefined, 1); assert.equal(response.status, 404);
    response = await req(`/vehicles/${first.id}/visits`, 'POST', visit(), 1); assert.equal(response.status, 404);
    response = await req('', 'POST', registration({ clienteId: first.clienteId, patente: 'AA111BB' }), 1); assert.equal(response.status, 404, 'no puede usar un cliente de otro comercio');
    const second = visit({ fecha: '2026-11-23', servicio: 'Cambio de filtros', productos: ['Filtro nuevo'] });
    const historyEvent = once(sharedSocket, 'history:changed', { signal: AbortSignal.timeout(5000) });
    response = await req(`/vehicles/${first.id}/visits`, 'POST', second); assert.equal(response.status, 201); assert.equal((await response.json()).visitas.length, 2); await historyEvent;
    response = await req(`/vehicles/${first.id}/visits`, 'POST', second); assert.equal((await response.json()).visitas.length, 2);
    response = await req('/plate/AB123CD'); const history = await response.json(); assert.equal(history.visitas[0].servicio, 'Cambio de filtros'); assert.deepEqual(history.visitas[1].productos, body.productos, 'conserva los productos de cada trabajo');
    assert.equal((await (await fetch(`${base}/api/history/${historyToken}`)).json()).visitas.length, 2, 'el mismo QR muestra nuevas atenciones');
    const beforeOtherVehicle = sharedChanges;
    response = await req('', 'POST', registration({ clienteId: first.clienteId, patente: 'ABC123' })); assert.equal(response.status, 201);
    response = await req(); const list = await response.json(); assert.equal(list.clientes.length, 1); assert.equal(list.vehiculos.length, 2, 'reutiliza el cliente con otro vehículo'); assert.equal(list.vehiculos.find((item) => item.id === first.id).totalVisitas, 2);
    response = await req('', 'POST', registration({ patente: 'AB123CD', nombre: 'Otro cliente' }), 1); assert.equal(response.status, 201, 'la misma patente puede atenderse en otro lubricentro');
    const otherVehicle = await response.json();
    response = await req(`/vehicles/${otherVehicle.id}/share`, 'POST', {}, 1); const otherHistoryToken = (await response.json()).token; assert.notEqual(otherHistoryToken, historyToken);
    assert.equal((await (await fetch(`${base}/api/history/${otherHistoryToken}`)).json()).visitas.length, 1, 'no mezcla los historiales de una patente atendida en dos negocios');
    assert.equal(sharedChanges, beforeOtherVehicle, 'no envía cambios de otros vehículos al QR');
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
    const paymentPath = `/vehicles/${first.id}/visits/${first.visitas[0].id}/payment`;
    response = await req(paymentPath, 'POST', { monto: '18500.50', metodoPago: 'efectivo' }, 1); assert.equal(response.status, 404, 'no cobra atenciones de otro comercio');
    response = await req(paymentPath, 'POST', { monto: '18500.51', metodoPago: 'efectivo' }); assert.equal(response.status, 409, 'el cobro respeta el monto original');
    response = await req(paymentPath, 'POST', { monto: '18500.50', metodoPago: null }); assert.equal(response.status, 400);
    const changed = once(own, 'customers:changed', { signal: AbortSignal.timeout(5000) });
    response = await req(paymentPath, 'POST', { monto: '18500.50', metodoPago: 'efectivo' }); assert.equal(response.status, 200); await changed;
    let paid = (await response.json()).visitas.find((item) => item.id === first.visitas[0].id); assert.equal(paid.monto, '18500.50'); assert.equal(paid.metodoPago, 'efectivo');
    response = await req(paymentPath, 'POST', { monto: '18500.50', metodoPago: 'efectivo' }); assert.equal(response.status, 200, 'reintentar el mismo pago es idempotente');
    response = await req(paymentPath, 'POST', { monto: '18500.50', metodoPago: 'transferencia' }); assert.equal(response.status, 409, 'no sobrescribe pagos ya registrados');
    for (const monto of [-1, '2.123', 'NaN', '1e3', null, undefined, true, '10000000000', '']) {
      response = await req(`/vehicles/${first.id}/visits`, 'POST', visit({ monto })); assert.equal(response.status, 400);
    }
    response = await req(`/vehicles/${first.id}/visits`, 'POST', visit({ metodoPago: 'desconocido' })); assert.equal(response.status, 400);
    for (const metodoPago of ['efectivo', 'transferencia', 'debito', 'credito', 'mercado_pago', 'otro']) {
      response = await req(`/vehicles/${first.id}/visits`, 'POST', visit({ monto: '0.30', metodoPago })); assert.equal(response.status, 201);
      assert.ok((await response.json()).visitas.some((item) => item.metodoPago === metodoPago && item.monto === '0.30'));
    }
    response = await req(`/vehicles/${first.id}/visits`, 'POST', visit({ monto: '23.45', servicio: 'Pendiente concurrente' })); const concurrentVisit = (await response.json()).visitas.find((item) => item.servicio === 'Pendiente concurrente');
    const concurrentPayments = await Promise.all(['efectivo','transferencia'].map((metodoPago) => req(`/vehicles/${first.id}/visits/${concurrentVisit.id}/payment`, 'POST', { monto: '23.45', metodoPago }))); assert.deepEqual(concurrentPayments.map((item) => item.status).sort(), [200,409]);
    const legacyId = randomUUID();
    await memory.db.query(`INSERT INTO lubricentro_atenciones (id,lubricentro_id,vehiculo_id,solicitud_id,fecha,servicio) VALUES ($1,$2,$3,$4,'2026-01-01','Atención anterior')`, [legacyId, accounts[0].id, first.id, randomUUID()]);
    response = await req(`/vehicles/${first.id}`); const legacy = (await response.json()).visitas.find((item) => item.id === legacyId); assert.equal(legacy.monto, null); assert.equal(legacy.metodoPago, null, 'no inventa importes ni pagos para atenciones anteriores');
    response = await req(`/vehicles/${first.id}/visits/${legacyId}/payment`, 'POST', { monto: '200', metodoPago: 'otro' }); assert.equal(response.status, 200); paid = (await response.json()).visitas.find((item) => item.id === legacyId); assert.equal(paid.monto, '200.00');
    // La API revalida el estado; el store también lo comprueba dentro de la transacción.
    await memory.db.query("UPDATE panel_lubricentros SET estado='Inactivo' WHERE id=$1", [accounts[0].id]);
    await assert.rejects(memory.methods.addCustomerVisit(accounts[0], first.id, visit()), (cause) => cause.status === 403);
    accounts[0].estado = 'Inactivo'; response = await req(); assert.equal(response.status, 403);
    require('../src/realtime').publishProfileChange(accounts[0].id, accounts[0].slug, false);
    assert.equal((await fetch(`${base}/api/history/${historyToken}`)).status, 404, 'QR inactivo si el lubricentro se desactiva');
    await memory.db.query("UPDATE panel_lubricentros SET estado='Activo', slug='el-cano-renombrado', nombre='Nuevo nombre' WHERE id=$1", [accounts[0].id]);
    const afterRename = await (await fetch(`${base}/api/history/${historyToken}`)).json(); assert.equal(afterRename.slug, 'el-cano-renombrado'); assert.equal(afterRename.lubricentro, 'Nuevo nombre', 'el QR sigue sirviendo aunque cambie el slug');
    const count = await memory.db.query('SELECT COUNT(*)::int AS total FROM lubricentro_clientes WHERE lubricentro_id=$1', [accounts[0].id]); assert.equal(count.rows[0].total, 2, 'el conflicto no deja clientes huérfanos');
  } finally {
    sockets.forEach((socket) => socket.disconnect()); await new Promise((resolve) => realtime.close(resolve)); Object.assign(store, originals); await memory.db.close();
  }
});
