const multer = require('multer');
const sharp = require('sharp');
const bucket = require('./bucket');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }).single('image');

function receiveImage(req, res, next) {
  upload(req, res, (error) => {
    if (error) return res.status(400).json({ message: 'Subí una sola imagen JPG, PNG o WebP de hasta 5 MB' });
    if (!req.file) return res.status(400).json({ message: 'Seleccioná una imagen' });
    next();
  });
}

async function convertImage(buffer, kind) {
  try {
    const image = sharp(buffer, { limitInputPixels: 24000000, animated: false });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('Formato inválido');
    const size = kind === 'cover' ? { width: 1800, height: 600, fit: 'cover' } : kind === 'profile' ? { width: 512, height: 512, fit: 'cover' } : { width: 1200, height: 1200, fit: 'inside' };
    return await image.rotate().resize({ ...size, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch { const error = new Error('Usá JPG, PNG o WebP de hasta 5 MB y 24 megapíxeles'); error.status = 400; throw error; }
}

async function cleanup(key) {
  if (!key) return;
  try { await bucket.removeImage(key); }
  catch { console.warn('No se pudo limpiar una imagen reemplazada del bucket'); }
}

async function readImage(reference) {
  if (Buffer.isBuffer(reference)) return reference; // Compatibilidad con fotos guardadas anteriormente en PostgreSQL.
  return reference && reference.key ? bucket.getImage(reference.key) : null;
}

module.exports = { receiveImage, convertImage, cleanup, readImage };
