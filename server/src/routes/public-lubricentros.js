const { Router } = require('express');
const store = require('../lubricentros-store');
const { validSlug } = require('../slug');
const router = Router();
const { readImage } = require('../image-upload');
router.get('/:slug/images/:kind', async (req, res) => {
  if (!validSlug(req.params.slug) || !['cover', 'profile'].includes(req.params.kind)) return res.sendStatus(404);
  try {
    const image = await readImage(await store.getImage(req.params.slug, req.params.kind));
    if (!image) return res.sendStatus(404);
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).send(image);
  } catch { res.sendStatus(503); }
});
router.get('/:slug/products/:id/image', async (req, res) => {
  if (!validSlug(req.params.slug) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) return res.sendStatus(404);
  try {
    const image = await readImage(await store.getProductImage(req.params.slug, req.params.id));
    if (!image) return res.sendStatus(404);
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).send(image);
  } catch { res.sendStatus(503); }
});

router.get('/:slug', async (req, res) => {
  if (!validSlug(req.params.slug)) return res.status(404).json({ message: 'Lubricentro no encontrado' });
  try {
    const record = await store.findBySlug(req.params.slug);
    if (!record) return res.status(404).json({ message: 'Lubricentro no encontrado' });
    const [services, products] = await Promise.all([store.publicServices(req.params.slug), store.publicProducts(req.params.slug)]);
    res.set('Cache-Control', 'no-store').json({ ...record, services, products });
  } catch {
    res.status(503).json({ message: 'No se pudo consultar el lubricentro' });
  }
});
module.exports = router;
