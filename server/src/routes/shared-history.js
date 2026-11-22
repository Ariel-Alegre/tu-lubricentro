const { Router } = require('express');
const store = require('../lubricentros-store');
const router = Router();
router.get('/:token', async (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' });
  if (!/^[a-f0-9]{64}$/.test(req.params.token)) return res.status(404).json({ message: 'Historial no disponible' });
  try {
    const history = await store.publicCustomerHistory(req.params.token);
    if (!history) return res.status(404).json({ message: 'Historial no disponible' });
    res.json(history);
  } catch { res.status(503).json({ message: 'No se pudo cargar el historial. Intentá nuevamente.' }); }
});
module.exports = router;
