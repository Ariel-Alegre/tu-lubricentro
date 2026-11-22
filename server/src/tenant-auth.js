const jwt = require('jsonwebtoken');
const { scrypt, timingSafeEqual, randomBytes } = require('crypto');
const { promisify } = require('util');
const store = require('./lubricentros-store');
const derive = promisify(scrypt);

function secret() {
  if (!process.env.ADMIN_JWT_SECRET) throw new Error('Falta ADMIN_JWT_SECRET');
  return process.env.ADMIN_JWT_SECRET;
}

function signAccount(account, socket = false) {
  // La sesión no vence por tiempo. Solo la credencial de conexión al socket
  // dura 60 segundos y el cliente solicita otra automáticamente al reconectar.
  return jwt.sign({ role: 'lubricentro', version: account.auth_version, purpose: socket ? 'socket' : 'session' }, secret(), {
    algorithm: 'HS256', issuer: 'tu-lubricentro', audience: 'panel-lubricentro', subject: account.id,
    ...(socket ? { expiresIn: '60s' } : {}),
  });
}

async function authenticate(token, purpose = 'session') {
  let payload;
  try {
    payload = jwt.verify(token, secret(), { algorithms: ['HS256'], issuer: 'tu-lubricentro', audience: 'panel-lubricentro' });
    if (payload.role !== 'lubricentro' || payload.purpose !== purpose || !/^[0-9a-f-]{36}$/i.test(payload.sub || '')) throw new Error();
  } catch { const error = new Error('Sesión inválida'); error.status = 401; throw error; }
  const account = await store.findAccountById(payload.sub);
  if (!account || account.estado !== 'Activo' || account.auth_version !== payload.version) {
    const error = new Error('El acceso fue desactivado o la sesión cambió'); error.status = 403; throw error;
  }
  return account;
}

async function verifyPassword(password, stored) {
  const [algorithm, salt, expected] = String(stored || '').split(':');
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
  const actual = await derive(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}

function publicAccount(account) {
  const { password_hash, auth_version, ...data } = account;
  return data;
}

async function requireTenant(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    req.tenant = await authenticate(header.startsWith('Bearer ') ? header.slice(7) : '');
    if (req.tenant.slug !== req.params.slug) return res.status(403).json({ message: 'Este acceso pertenece a otro lubricentro' });
    next();
  } catch (error) {
    res.status(error.status || 503).json({ message: error.status ? error.message : 'No se pudo verificar el acceso' });
  }
}

module.exports = { signAccount, authenticate, verifyPassword, hashPassword, publicAccount, requireTenant };
