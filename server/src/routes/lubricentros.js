const { Router } = require('express');
const { randomBytes, scrypt } = require('crypto');
const { promisify } = require('util');
const { requireAdmin } = require('./admin');
const store = require('../lubricentros-store');
const deriveKey = promisify(scrypt);
const router = Router();
router.use(requireAdmin);

function fail(res, error) {
  if (error.code === '23505') return res.status(409).json({ message: 'Ya existe un lubricentro con ese correo' });
  if (error.status === 503) return res.status(503).json({ message: error.message });
  console.error('Error de almacenamiento de lubricentros:', error.code || error.name);
  return res.status(503).json({ message: 'No se pudo guardar o consultar el lubricentro. Revisá la conexión a PostgreSQL.' });
}

router.get('/', async (req, res) => {
  try { res.json(await store.list()); } catch (error) { fail(res, error); }
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  const data = {};
  for (const field of ['nombre', 'email', 'telefono', 'direccion', 'ciudad', 'provincia', 'responsable']) {
    if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > 320) {
      return res.status(400).json({ message: 'Completá los datos del lubricentro' });
    }
    data[field] = body[field].trim();
  }
  data.email = data.email.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return res.status(400).json({ message: 'Ingresá un correo válido' });
  if (typeof body.password !== 'string' || body.password.length < 6 || body.password.length > 128) {
    return res.status(400).json({ message: 'La contraseña debe tener entre 6 y 128 caracteres' });
  }
  try {
    const salt = randomBytes(16).toString('hex');
    const hash = await deriveKey(body.password, salt, 64);
    const record = await store.create(data, `scrypt:${salt}:${hash.toString('hex')}`);
    res.status(201).json(record);
  } catch (error) { fail(res, error); }
});

router.patch('/:id/estado', async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id) || !['Activo', 'Inactivo'].includes(req.body?.estado)) {
    return res.status(400).json({ message: 'Estado o identificador inválido' });
  }
  try {
    const record = await store.updateStatus(req.params.id, req.body.estado);
    if (!record) return res.status(404).json({ message: 'Lubricentro no encontrado' });
    res.json(record);
  } catch (error) { fail(res, error); }
});

module.exports = router;
