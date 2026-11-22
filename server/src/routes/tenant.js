const { Router } = require('express');
const store = require('../lubricentros-store');
const { validSlug } = require('../slug');
const { signAccount, verifyPassword, requireTenant, publicAccount } = require('../tenant-auth');
const router = Router();

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

router.get('/:slug/session', requireTenant, (req, res) => res.set('Cache-Control', 'no-store').json(publicAccount(req.tenant)));
router.post('/:slug/socket', requireTenant, (req, res) => res.set('Cache-Control', 'no-store').json({ ticket: signAccount(req.tenant, true) }));
module.exports = router;
