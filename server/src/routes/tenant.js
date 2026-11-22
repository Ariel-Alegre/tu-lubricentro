const { Router } = require('express');
const store = require('../lubricentros-store');
const { validSlug } = require('../slug');
const { signAccount, verifyPassword, requireTenant, publicAccount } = require('../tenant-auth');
const router = Router();
const bucket = require('../bucket');
const { publishProfileChange } = require('../realtime');
const { receiveImage, convertImage, cleanup } = require('../image-upload');

async function login(req, res) {
  const { email, password } = req.body || {};
  if ((req.params.slug && !validSlug(req.params.slug)) || typeof email !== 'string' || email.length > 320 || typeof password !== 'string' || password.length > 128) {
    return res.status(400).json({ message: 'Ingresá tu correo y contraseña' });
  }
  try {
    const account = req.params.slug ? await store.findAccountBySlug(req.params.slug) : await store.findAccountByEmail(email.trim().toLowerCase());
    if (!account || account.email !== email.trim().toLowerCase() || !await verifyPassword(password, account.password_hash)) {
      return res.status(401).json({ message: 'Correo o contraseña incorrectos' });
    }
    if (account.estado !== 'Activo') return res.status(403).json({ message: 'Este lubricentro está inactivo. Contactá al administrador.' });
    res.set('Cache-Control', 'no-store').json({ token: signAccount(account), slug: account.slug });
  } catch { res.status(503).json({ message: 'No se pudo conectar con el servidor' }); }
}

router.post('/login', login);
router.post('/:slug/login', login);
router.use('/:slug/services', require('./services'));
router.use('/:slug/products', require('./products'));
router.use('/:slug/customers', require('./customers'));

router.get('/:slug/session', requireTenant, (req, res) => res.set('Cache-Control', 'no-store').json(publicAccount(req.tenant)));
router.post('/:slug/socket', requireTenant, (req, res) => res.set('Cache-Control', 'no-store').json({ ticket: signAccount(req.tenant, true) }));
router.post('/:slug/images/:kind', requireTenant, (req, res, next) => {
  if (!['cover', 'profile'].includes(req.params.kind)) return res.status(400).json({ message: 'Tipo de imagen inválido' });
  next();
}, receiveImage, async (req, res) => {
  let key;
  try {
    const image = await convertImage(req.file.buffer, req.params.kind);
    key = await bucket.putImage(req.tenant.id, req.params.kind, image);
    const saved = await store.saveImage(req.tenant.id, req.tenant.auth_version, req.params.kind, key);
    if (!saved) { await cleanup(key); return res.status(403).json({ message: 'Tu acceso cambió. Volvé a iniciar sesión.' }); }
    publishProfileChange(req.tenant.id, req.tenant.slug);
    await cleanup(saved.previousKey);
    res.set('Cache-Control', 'no-store').json(saved.record);
  } catch (error) {
    await cleanup(key);
    res.status(error.status === 400 ? 400 : 503).json({ message: error.status === 400 ? error.message : 'No se pudo guardar la imagen en el almacenamiento. Contactá al administrador si el problema continúa.' });
  }
});
module.exports = router;
