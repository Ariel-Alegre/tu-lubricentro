const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { randomUUID } = require('crypto');
let client;
let bucket;

function connection() {
  if (client) return { client, bucket };
  const endpoint = process.env.AWS_ENDPOINT_URL || process.env.ENDPOINT;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.SECRET_ACCESS_KEY;
  bucket = process.env.AWS_S3_BUCKET_NAME || process.env.BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    const error = new Error('Falta configurar el bucket de imágenes en el servidor'); error.status = 503; throw error;
  }
  const style = process.env.AWS_S3_URL_STYLE || 'virtual';
  if (!['virtual', 'path'].includes(style)) throw new Error('AWS_S3_URL_STYLE debe ser virtual o path');
  client = new S3Client({
    endpoint, region: process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || process.env.REGION || 'auto',
    credentials: { accessKeyId, secretAccessKey }, forcePathStyle: style === 'path',
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 2,
  });
  return { client, bucket };
}

function validKey(key) {
  return typeof key === 'string' && /^lubricentros\/[0-9a-f-]{36}\/(?:cover|profile|products\/[0-9a-f-]{36})\/[0-9a-f-]{36}\.webp$/i.test(key);
}

module.exports = {
  async putImage(ownerId, category, image) {
    const key = `lubricentros/${ownerId}/${category}/${randomUUID()}.webp`;
    if (!validKey(key)) throw new Error('Referencia de imagen inválida');
    const { client, bucket } = connection();
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: image, ContentType: 'image/webp', ContentLength: image.length }), { abortSignal: AbortSignal.timeout(15000) });
    return key;
  },
  async getImage(key) {
    if (!validKey(key)) return null;
    const { client, bucket } = connection();
    try {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(15000) });
      return response.Body ? Buffer.from(await response.Body.transformToByteArray()) : null;
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  },
  async removeImage(key) {
    if (!key || !validKey(key)) return;
    const { client, bucket } = connection();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(15000) });
  },
  close() { if (client) client.destroy(); client = undefined; bucket = undefined; },
};
