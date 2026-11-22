const { Router } = require('express');
const { requireTenant } = require('../tenant-auth');
const store = require('../lubricentros-store');
const bucket = require('../bucket');
const { receiveImage, convertImage, cleanup } = require('../image-upload');
const router = Router({ mergeParams: true });
router.use(requireTenant);
const validId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

router.get('/', async (req, res) => {
  try { res.set('Cache-Control', 'no-store').json(await store.listProducts(req.tenant.id)); }
  catch { res.status(503).json({ message: 'No se pudieron cargar los productos' }); }
});

async function save(req, res) {
  const { nombre, descripcion = '', precio } = req.body || {};
  if (typeof nombre !== 'string' || !nombre.trim() || nombre.length > 120 || typeof descripcion !== 'string' || descripcion.length > 1000) return res.status(400).json({ message: 'Ingresá un nombre de hasta 120 caracteres y una descripción de hasta 1000' });
  if (!['string', 'number'].includes(typeof precio) || !/^\d{1,10}(\.\d{1,2})?$/.test(String(precio))) return res.status(400).json({ message: 'Ingresá un precio válido, sin valores negativos y con hasta dos decimales' });
  if (req.params.id && !validId(req.params.id)) return res.status(400).json({ message: 'Identificador inválido' });
  try {
    const data = { nombre: nombre.trim(), descripcion: descripcion.trim(), precio: String(precio) };
    const product = req.params.id ? await store.updateProduct(req.tenant, req.params.id, data) : await store.createProduct(req.tenant, data);
    if (!product) return res.status(404).json({ message: 'No se encontró el producto o tu acceso cambió' });
    res.status(req.params.id ? 200 : 201).json(product);
  } catch { res.status(503).json({ message: 'No se pudo guardar el producto' }); }
}
router.post('/', save);
router.put('/:id', save);
router.post('/:id/image', async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Identificador inválido' });
  try {
    if (!await store.findOwnedProduct(req.tenant.id, req.params.id)) return res.status(404).json({ message: 'Producto no encontrado' });
    next();
  } catch { res.status(503).json({ message: 'No se pudo consultar el producto' }); }
}, receiveImage, async (req, res) => {
  let key;
  try {
    const image = await convertImage(req.file.buffer, 'product');
    key = await bucket.putImage(req.tenant.id, `products/${req.params.id}`, image);
    const saved = await store.saveProductImage(req.tenant, req.params.id, key);
    if (!saved) { await cleanup(key); return res.status(403).json({ message: 'Tu acceso cambió o el producto ya no existe' }); }
    await cleanup(saved.previousKey);
    res.set('Cache-Control', 'no-store').json(saved.record);
  } catch (error) {
    await cleanup(key);
    res.status(error.status === 400 ? 400 : 503).json({ message: error.status === 400 ? error.message : 'No se pudo guardar la foto en el almacenamiento. Intentá nuevamente.' });
  }
});
router.delete('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Identificador inválido' });
  try {
    const product = await store.deleteProduct(req.tenant, req.params.id);
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });
    await cleanup(product._imageKey);
    res.json({ ok: true });
  } catch { res.status(503).json({ message: 'No se pudo eliminar el producto' }); }
});
module.exports = router;
