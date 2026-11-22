const { Router } = require('express');
const store = require('../lubricentros-store');
const { validSlug } = require('../slug');
const { signAccount, verifyPassword, requireTenant, publicAccount } = require('../tenant-auth');
const router = Router();
const multer = require('multer');
const sharp = require('sharp');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }).single('image');

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

router.get('/:slug/session', requireTenant, (req, res) => res.set('Cache-Control', 'no-store').json(publicAccount(req.tenant)));
router.post('/:slug/socket', requireTenant, (req, res) => res.set('Cache-Control', 'no-store').json({ ticket: signAccount(req.tenant, true) }));
router.post('/:slug/images/:kind', requireTenant, (req, res) => {
  const kind = req.params.kind;
  if (!['cover', 'profile'].includes(kind)) return res.status(400).json({ message: 'Tipo de imagen inválido' });
  upload(req, res, async (error) => {
    if (error) return res.status(400).json({ message: 'Subí una sola imagen JPG, PNG o WebP de hasta 5 MB' });
    if (!req.file) return res.status(400).json({ message: 'Seleccioná una imagen' });
    let image;
    try {
      const pipeline = sharp(req.file.buffer, { limitInputPixels: 24000000, animated: false });
      const metadata = await pipeline.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format)) return res.status(400).json({ message: 'Usá una imagen JPG, PNG o WebP' });
      image = await pipeline.rotate().resize(kind === 'cover' ? { width: 1800, height: 600, fit: 'cover', withoutEnlargement: true } : { width: 512, height: 512, fit: 'cover', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    } catch { return res.status(400).json({ message: 'No se pudo procesar la imagen. Usá JPG, PNG o WebP de hasta 24 megapíxeles.' }); }
    try {
      const record = await store.saveImage(req.tenant.id, req.tenant.auth_version, kind, image);
      if (!record) return res.status(403).json({ message: 'Tu acceso cambió. Volvé a iniciar sesión.' });
      res.set('Cache-Control', 'no-store').json(record);
    } catch { res.status(503).json({ message: 'No se pudo guardar la imagen. Intentá nuevamente.' }); }
  });
});
module.exports = router;
