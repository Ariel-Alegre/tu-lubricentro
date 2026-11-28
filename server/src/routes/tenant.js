const { Router } = require('express');
const store = require('../lubricentros-store');
const { validSlug } = require('../slug');
const { signAccount, verifyPassword, hashPassword, requireTenant, publicAccount } = require('../tenant-auth');
const router = Router();
const bucket = require('../bucket');
const { publishProfileChange, publishRootChange, revokeTenant } = require('../realtime');
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
router.post('/:slug/location', requireTenant, async (req, res) => {
  const raw = req.body?.mapsUrl;
  if (typeof raw !== 'string' || raw.length > 4096) return res.status(400).json({ message: 'Ingresá un enlace de Google Maps válido' });
  const url = raw.trim();
  if (url) {
    try {
      const parsed = new URL(url);
      const google = /^(?:[a-z0-9-]+\.)*google\.(?:com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/.test(parsed.hostname);
      const maps = (google && (parsed.hostname.startsWith('maps.google.') || /^\/maps(?:\/|$)/.test(parsed.pathname))) || parsed.hostname === 'maps.app.goo.gl' || (parsed.hostname === 'goo.gl' && parsed.pathname.startsWith('/maps/'));
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || !maps) throw new Error();
    } catch { return res.status(400).json({ message: 'Pegá el enlace HTTPS de Google Maps que obtenés desde Compartir → Copiar enlace' }); }
  }
  try {
    const account = await store.saveMapsUrl(req.tenant, url);
    if (!account) return res.status(403).json({ message: 'Tu acceso cambió. Volvé a iniciar sesión.' });
    publishProfileChange(req.tenant.id, req.tenant.slug);
    publishRootChange();
    res.set('Cache-Control', 'no-store').json(account);
  } catch { res.status(503).json({ message: 'No se pudo guardar la ubicación' }); }
});
router.post('/:slug/reviews', requireTenant, async (req, res) => {
  const raw = req.body?.reviewsUrl;
  if (typeof raw !== 'string' || raw.length > 2048) return res.status(400).json({ message: 'Ingresá un enlace de reseñas de Google válido' });
  const url = raw.trim();
  if (url) {
    try {
      const parsed = new URL(url);
      const google = /^(?:[a-z0-9-]+\.)*google\.(?:com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/.test(parsed.hostname) || ['g.page', 'maps.app.goo.gl', 'goo.gl'].includes(parsed.hostname);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || !google) throw new Error();
    } catch { return res.status(400).json({ message: 'Usá un enlace HTTPS de Google Maps, Google o g.page' }); }
  }
  try {
    const account = await store.saveReviewsUrl(req.tenant, url);
    if (!account) return res.status(403).json({ message: 'Tu acceso cambió. Volvé a iniciar sesión.' });
    publishProfileChange(req.tenant.id, req.tenant.slug);
    res.set('Cache-Control', 'no-store').json(account);
  } catch { res.status(503).json({ message: 'No se pudo guardar el enlace de reseñas' }); }
});
router.post('/:slug/password', requireTenant, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 128 || typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 128) {
    return res.status(400).json({ message: 'Ingresá tu contraseña actual y una nueva de entre 6 y 128 caracteres' });
  }
  try {
    if (!await verifyPassword(currentPassword, req.tenant.password_hash)) return res.status(400).json({ message: 'La contraseña actual es incorrecta' });
    if (currentPassword === newPassword) return res.status(400).json({ message: 'Elegí una contraseña diferente a la actual' });
    const saved = await store.changePassword(req.tenant, await hashPassword(newPassword));
    if (!saved) return res.status(403).json({ message: 'Tu acceso cambió. Volvé a iniciar sesión.' });
    revokeTenant(req.tenant.id, 'password-changed');
    res.set('Cache-Control', 'no-store').json({ ok: true });
  } catch { res.status(503).json({ message: 'No se pudo cambiar la contraseña. Intentá nuevamente.' }); }
});
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
