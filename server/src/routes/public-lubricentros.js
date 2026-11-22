const { Router } = require('express');
const store = require('../lubricentros-store');
const { validSlug } = require('../slug');
const router = Router();

router.get('/:slug', async (req, res) => {
  if (!validSlug(req.params.slug)) return res.status(404).json({ message: 'Lubricentro no encontrado' });
  try {
    const record = await store.findBySlug(req.params.slug);
    if (!record) return res.status(404).json({ message: 'Lubricentro no encontrado' });
    res.set('Cache-Control', 'no-store').json(record);
  } catch {
    res.status(503).json({ message: 'No se pudo consultar el lubricentro' });
  }
});
module.exports = router;
