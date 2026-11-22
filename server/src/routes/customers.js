const { Router } = require('express');
const store = require('../lubricentros-store');
const { requireTenant } = require('../tenant-auth');
const { publishCustomersChange } = require('../realtime');
const { payment } = require('../visit-payment');
const router = Router({ mergeParams: true });
router.use(requireTenant);
const validId = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function plate(value) {
  if (typeof value !== 'string' || value.length > 20) return null;
  const normalized = value.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{5,10}$/.test(normalized) ? normalized : null;
}
function error(res, cause) {
  res.status(cause.status || (cause.code === '23505' ? 409 : 503)).json({ message: cause.status ? cause.message : cause.code === '23505' ? 'La patente o atención ya fue registrada' : 'No se pudieron guardar o consultar los clientes' });
}
function text(value, max, required = false) { return typeof value === 'string' && value.length <= max && (!required || Boolean(value.trim())); }
function visit(body) {
  const { fecha, servicio, productos = [], kilometraje = null, observaciones = '', solicitudId } = body;
  if (!validId(solicitudId) || typeof fecha !== 'string' || fecha.startsWith('0000') || !/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') || !Number.isFinite(Date.parse(fecha)) || new Date(fecha).toISOString().slice(0, 10) !== fecha || !text(servicio, 120, true) || !Array.isArray(productos) || productos.length > 12 || productos.some((item) => !text(item, 120, true)) || !text(observaciones, 1000) || (kilometraje !== null && (!Number.isInteger(kilometraje) || kilometraje < 0 || kilometraje > 10000000))) {
    throw Object.assign(new Error('Revisá la fecha, el servicio, los productos y el kilometraje'), { status: 400 });
  }
  return { fecha, servicio: servicio.trim(), productos: [...new Set(productos.map((item) => item.trim()))], kilometraje, observaciones: observaciones.trim(), solicitudId, ...payment(body) };
}
router.get('/', async (req, res) => {
  try { res.set('Cache-Control', 'no-store').json(await store.listCustomers(req.tenant.id)); } catch (cause) { error(res, cause); }
});
router.get('/plate/:plate', async (req, res) => {
  const value = plate(req.params.plate);
  if (!value) return res.status(400).json({ message: 'Ingresá una patente válida, por ejemplo ABC123 o AB123CD' });
  try {
    const record = await store.customerByPlate(req.tenant.id, value);
    if (!record) return res.status(404).json({ message: 'La patente todavía no está registrada en tu lubricentro' });
    res.set('Cache-Control', 'no-store').json(record);
  } catch (cause) { error(res, cause); }
});
router.get('/vehicles/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Vehículo inválido' });
  try {
    const record = await store.customerVehicle(req.tenant.id, req.params.id);
    if (!record) return res.status(404).json({ message: 'Vehículo no encontrado' });
    res.set('Cache-Control', 'no-store').json(record);
  } catch (cause) { error(res, cause); }
});
router.post('/', async (req, res) => {
  try {
    const body = req.body || {}; const data = visit(body); const patente = plate(body.patente);
    const { clienteId, nombre = '', telefono = '', marca = '', modelo = '' } = body;
    if (!patente || !text(nombre, 120, !clienteId) || (clienteId && !validId(clienteId)) || !text(telefono, 40) || !text(marca, 80) || !text(modelo, 80)) return res.status(400).json({ message: 'Completá la patente y el cliente con datos válidos' });
    const record = await store.registerCustomerVehicle(req.tenant, { ...data, patente, clienteId: clienteId || null, nombre: nombre.trim(), telefono: telefono.trim(), marca: marca.trim(), modelo: modelo.trim() });
    publishCustomersChange(req.tenant.id, record.id);
    res.status(201).set('Cache-Control', 'no-store').json(record);
  } catch (cause) { error(res, cause); }
});
router.post('/vehicles/:id/visits', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Vehículo inválido' });
  try {
    const record = await store.addCustomerVisit(req.tenant, req.params.id, visit(req.body || {}));
    publishCustomersChange(req.tenant.id, record.id);
    res.status(201).set('Cache-Control', 'no-store').json(record);
  } catch (cause) { error(res, cause); }
});
router.post('/vehicles/:id/share', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Vehículo inválido' });
  try { res.set('Cache-Control', 'no-store').json(await store.shareCustomerHistory(req.tenant, req.params.id)); }
  catch (cause) { error(res, cause); }
});
router.post('/vehicles/:id/visits/:visitId/payment', async (req, res) => {
  if (!validId(req.params.id) || !validId(req.params.visitId)) return res.status(400).json({ message: 'Atención inválida' });
  try {
    const record = await store.payCustomerVisit(req.tenant, req.params.id, req.params.visitId, payment(req.body || {}, true));
    publishCustomersChange(req.tenant.id, record.id);
    res.set('Cache-Control', 'no-store').json(record);
  } catch (cause) { error(res, cause); }
});
module.exports = router;
