const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');

test('bucket S3 privado: firma, carga, lectura, eliminación y claves delimitadas', async () => {
  const objects = new Map();
  const requests = [];
  const server = createServer(async (req, res) => {
    requests.push({ method: req.method, auth: req.headers.authorization, contentType: req.headers['content-type'] });
    const key = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'PUT') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      objects.set(key, Buffer.concat(chunks)); res.writeHead(200).end();
    } else if (req.method === 'GET') {
      if (objects.has(key)) res.writeHead(200, { 'Content-Type': 'image/webp' }).end(objects.get(key));
      else res.writeHead(404, { 'Content-Type': 'application/xml' }).end('<Error><Code>NoSuchKey</Code></Error>');
    } else if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204).end(); }
    else res.writeHead(405).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const vars = { AWS_ENDPOINT_URL: `http://127.0.0.1:${server.address().port}`, AWS_ACCESS_KEY_ID: 'test-access', AWS_SECRET_ACCESS_KEY: 'test-secret', AWS_S3_BUCKET_NAME: 'test-bucket', AWS_DEFAULT_REGION: 'auto', AWS_S3_URL_STYLE: 'path' };
  const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const bucket = require('../src/bucket'); bucket.close();
  try {
    const owner = randomUUID(); const content = Buffer.from('test-webp-content');
    for (const category of ['profile', 'cover', `products/${randomUUID()}`]) {
      const key = await bucket.putImage(owner, category, content);
      assert.ok(key.startsWith(`lubricentros/${owner}/${category}/`));
      assert.deepEqual(await bucket.getImage(key), content);
      await bucket.removeImage(key);
      assert.equal(await bucket.getImage(key), null);
    }
    assert.equal(objects.size, 0);
    assert.ok(requests.every((request) => request.auth.startsWith('AWS4-HMAC-SHA256 ')));
    assert.ok(requests.filter((request) => request.method === 'PUT').every((request) => request.contentType === 'image/webp'));
    const count = requests.length;
    assert.equal(await bucket.getImage('../another-tenant'), null);
    await bucket.removeImage('any-arbitrary-object');
    assert.equal(requests.length, count);
    await assert.rejects(bucket.putImage(owner, '../invalid', content), /inválida/);
  } finally {
    bucket.close();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    server.close(); await once(server, 'close');
  }
});
