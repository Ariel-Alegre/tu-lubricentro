const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');

test('productos aislados por comercio, precios válidos y catálogo público', async () => {
  process.env.ADMIN_JWT_SECRET = 'test-only-products-secret';
  const store = require('../src/lubricentros-store');
  const { signAccount } = require('../src/tenant-auth');
  const accounts = ['el-cano', 'lorenzo'].map((slug) => ({ id: randomUUID(), nombre: slug, slug, estado: 'Activo', auth_version: 0 }));
  const records = new Map();
  const methods = ['findAccountById', 'findBySlug', 'publicServices', 'listProducts', 'publicProducts', 'createProduct', 'updateProduct', 'deleteProduct', 'findOwnedProduct', 'saveProductImage', 'getProductImage'];
  const originals = Object.fromEntries(methods.map((key) => [key, store[key]]));
  const bucket = require('../src/bucket'); const bucketOriginals = { ...bucket };
  const objects = new Map(); const imageKeys = new Map(); let rejectSave = false; let failStorage = false;
  bucket.putImage = async (owner, category, image) => { if (failStorage) throw new Error('storage unavailable'); const key = `lubricentros/${owner}/${category}/${randomUUID()}.webp`; objects.set(key, image); return key; };
  bucket.getImage = async (key) => objects.get(key);
  bucket.removeImage = async (key) => { objects.delete(key); };
  store.findOwnedProduct = async (owner, id) => records.get(id)?.owner === owner ? records.get(id) : null;
  store.saveProductImage = async (account, id, key) => {
    if (rejectSave) return null;
    const previousKey = imageKeys.get(id); imageKeys.set(id, key);
    const { owner, ...record } = records.get(id); return { record: { ...record, hasImage: true }, previousKey };
  };
  store.getProductImage = async (slug, id) => { const account = accounts.find((item) => item.slug === slug); return account?.estado === 'Activo' && records.get(id)?.owner === account.id && imageKeys.has(id) ? { key: imageKeys.get(id) } : null; };
  store.findAccountById = async (id) => accounts.find((item) => item.id === id);
  store.findBySlug = async (slug) => accounts.find((item) => item.slug === slug && item.estado === 'Activo');
  store.publicServices = async () => [];
  store.listProducts = async (id) => [...records.values()].filter((item) => item.owner === id).map(({ owner, ...data }) => data);
  store.publicProducts = async (slug) => { const account = await store.findBySlug(slug); return account ? store.listProducts(account.id) : []; };
  store.createProduct = async (account, data) => { const id = randomUUID(); records.set(id, { ...data, id, owner: account.id }); return { ...data, id }; };
  store.updateProduct = async (account, id, data) => { if (records.get(id)?.owner !== account.id) return undefined; records.set(id, { ...data, id, owner: account.id }); return { ...data, id }; };
  store.deleteProduct = async (account, id) => { if (records.get(id)?.owner !== account.id) return undefined; records.delete(id); return { id, _imageKey: imageKeys.get(id) }; };
  const server = require('../src/app').listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokens = accounts.map((account) => signAccount(account));
  const req = (slug, method = 'GET', data, id = '', token = tokens[0]) => fetch(`${base}/api/tenant/${slug}/products${id ? '/' + id : ''}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: data ? JSON.stringify(data) : undefined });
  try {
    let response = await req('el-cano', 'POST', { nombre: 'Aceite 10W-40', descripcion: 'Envase de 4 litros', precio: '18500.50' });
    assert.equal(response.status, 201); const product = await response.json(); assert.equal(product.precio, '18500.50');
    const png = await require('sharp')({ create: { width: 40, height: 40, channels: 3, background: '#155fa0' } }).png().toBuffer();
    const upload = (slug = 'el-cano', token = tokens[0], content = png) => { const body = new FormData(); body.append('image', new Blob([content], { type: 'image/png' }), 'foto.png'); return fetch(`${base}/api/tenant/${slug}/products/${product.id}/image`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body }); };
    response = await upload(); assert.equal(response.status, 200); const withImage = await response.json(); assert.equal(withImage.hasImage, true); assert.equal(withImage.key, undefined);
    response = await fetch(`${base}/api/lubricentros/el-cano/products/${product.id}/image`); assert.equal(response.status, 200);
    assert.equal((await require('sharp')(Buffer.from(await response.arrayBuffer())).metadata()).format, 'webp');
    response = await fetch(`${base}/api/lubricentros/lorenzo/products/${product.id}/image`); assert.equal(response.status, 404);
    response = await upload('lorenzo', tokens[1]); assert.equal(response.status, 404);
    const firstKey = imageKeys.get(product.id);
    response = await upload(); assert.equal(response.status, 200); assert.equal(objects.has(firstKey), false, 'elimina la foto reemplazada'); assert.equal(objects.size, 1);
    rejectSave = true; response = await upload(); assert.equal(response.status, 403); assert.equal(objects.size, 1, 'limpia el archivo nuevo si cambió el acceso'); rejectSave = false;
    failStorage = true; response = await upload(); assert.equal(response.status, 503); assert.equal(objects.size, 1, 'conserva la foto anterior si falla el bucket'); failStorage = false;
    response = await upload('el-cano', tokens[0], Buffer.from('imagen falsa')); assert.equal(response.status, 400);
    response = await upload('el-cano', tokens[0], Buffer.alloc(5 * 1024 * 1024 + 1)); assert.equal(response.status, 400);
    response = await req('el-cano'); assert.deepEqual(await response.json(), [product]);
    response = await req('lorenzo', 'GET', undefined, '', tokens[1]); assert.deepEqual(await response.json(), []);
    response = await req('lorenzo'); assert.equal(response.status, 403);
    response = await req('lorenzo', 'PUT', { nombre: 'Otro', precio: '2' }, product.id, tokens[1]); assert.equal(response.status, 404);
    response = await req('lorenzo', 'DELETE', undefined, product.id, tokens[1]); assert.equal(response.status, 404);
    for (const precio of [-1, null, '', '2.123', 'NaN', '10000000000', true]) {
      response = await req('el-cano', 'POST', { nombre: 'Inválido', precio }); assert.equal(response.status, 400);
    }
    response = await req('el-cano', 'POST', { nombre: ' ', precio: '2' }); assert.equal(response.status, 400);
    response = await req('el-cano', 'PUT', { nombre: 'Aceite sintético', descripcion: 'Actualizado', precio: '19000' }, product.id); assert.equal(response.status, 200);
    response = await fetch(`${base}/api/lubricentros/el-cano`); const profile = await response.json(); assert.equal(profile.products[0].nombre, 'Aceite sintético');
    response = await fetch(`${base}/api/lubricentros/lorenzo`); assert.deepEqual((await response.json()).products, []);
    response = await req('el-cano', 'DELETE', undefined, product.id); assert.equal(response.status, 200);
    assert.equal(objects.size, 0, 'elimina la foto al borrar el producto');
    response = await req('el-cano'); assert.deepEqual(await response.json(), []);
    accounts[0].estado = 'Inactivo'; response = await req('el-cano', 'POST', { nombre: 'No permitido', precio: '1' }); assert.equal(response.status, 403);
  } finally { server.close(); Object.assign(store, originals); Object.assign(bucket, bucketOriginals); }
});
