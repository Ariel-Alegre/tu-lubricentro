const { Router } = require('express');
const { requireTenant } = require('../tenant-auth');
const store = require('../lubricentros-store');
const { publishProfileChange } = require('../realtime');
const router = Router({ mergeParams: true });
router.use(requireTenant);

router.get('/', async (req, res) => {
  try { res.set('Cache-Control', 'no-store').json(await store.listServices(req.tenant.id)); }
  catch { res.status(503).json({ message: 'No se pudieron cargar los servicios' }); }
});

async function save(req, res) {
  const { nombre, descripcion = '' } = req.body || {};
  if (typeof nombre !== 'string' || !nombre.trim() || nombre.length > 120 || typeof descripcion !== 'string' || descripcion.length > 1000) {
    return res.status(400).json({ message: 'Ingresá un nombre de hasta 120 caracteres y una descripción de hasta 1000' });
  }
  if (req.params.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) return res.status(400).json({ message: 'Identificador inválido' });
  try {
    const data = { nombre: nombre.trim(), descripcion: descripcion.trim() };
    const record = req.params.id ? await store.updateService(req.tenant, req.params.id, data) : await store.createService(req.tenant, data);
    if (!record) return res.status(404).json({ message: 'No se encontró el servicio o tu acceso cambió' });
    publishProfileChange(req.tenant.id, req.tenant.slug);
    res.status(req.params.id ? 200 : 201).json(record);
  } catch { res.status(503).json({ message: 'No se pudo guardar el servicio' }); }
}
router.post('/', save);
router.put('/:id', save);
router.delete('/:id', async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) return res.status(400).json({ message: 'Identificador inválido' });
  try {
    const record = await store.deleteService(req.tenant, req.params.id);
    if (!record) return res.status(404).json({ message: 'Servicio no encontrado' });
    publishProfileChange(req.tenant.id, req.tenant.slug);
    res.json({ ok: true });
  } catch { res.status(503).json({ message: 'No se pudo eliminar el servicio' }); }
});
module.exports = router;
