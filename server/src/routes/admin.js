const { Router } = require('express');
const { createHash, timingSafeEqual } = require('crypto');
const jwt = require('jsonwebtoken');
const router = Router();

function credentials() {
  const email = process.env.admin_panel;
  const password = process.env.admin_password;
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!email || !password || !secret) throw new Error('Configurá las variables de acceso del panel');
  return { email, password, key: createHash('sha256').update(JSON.stringify([secret, email, password])).digest('hex') };
}

function equal(a, b) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

router.post('/login', (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || email.length > 320 || password.length > 1024) {
      return res.status(400).json({ message: 'Ingresá tu correo y contraseña' });
    }
    const config = credentials();
    const validEmail = equal(email.trim(), config.email);
    const validPassword = equal(password, config.password);
    if (!validEmail || !validPassword) return res.status(401).json({ message: 'Correo o contraseña incorrectos' });
    // Sin expiresIn: el token no tiene fecha de vencimiento.
    const token = jwt.sign({ role: 'root' }, config.key, { algorithm: 'HS256', subject: config.email, issuer: 'tu-lubricentro', audience: 'panel-raiz' });
    return res.json({ token });
  } catch (error) { next(error); }
});

function requireAdmin(req, res, next) {
  try {
    const config = credentials();
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ')) return res.status(401).json({ message: 'Iniciá sesión' });
    const payload = jwt.verify(authorization.slice(7), config.key, { algorithms: ['HS256'], issuer: 'tu-lubricentro', audience: 'panel-raiz', subject: config.email });
    if (payload.role !== 'root') return res.status(401).json({ message: 'Acceso inválido' });
    req.admin = { email: config.email };
    next();
  } catch { return res.status(401).json({ message: 'Sesión inválida' }); }
}

router.get('/session', requireAdmin, (req, res) => res.json(req.admin));
module.exports = { router, requireAdmin };
