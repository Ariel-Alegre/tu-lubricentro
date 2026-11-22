// Servidor de prueba aislado. No utiliza PostgreSQL ni credenciales reales.
const { createServer } = require('node:http');
const { scryptSync } = require('node:crypto');
process.env.admin_panel = 'root@example.test';
process.env.admin_password = 'root-test-password';
process.env.ADMIN_JWT_SECRET = 'test-only-secret-for-browser-checks';
const app = require('../../src/app');
const store = require('../../src/lubricentros-store');
const { attachRealtime } = require('../../src/realtime');
const { publicAccount } = require('../../src/tenant-auth');
const salt = 'a'.repeat(32);
const accounts = ['el-cano', 'lorenzo'].map((slug, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`, slug, nombre: index ? 'Lubricentro Lorenzo' : 'Lubricentro El Cano',
  email: `${slug}@example.test`, telefono: '11 4567-8900', direccion: 'Av. San Martín 1234', ciudad: 'Buenos Aires', provincia: 'Buenos Aires', responsable: 'Responsable de prueba',
  password_hash: `scrypt:${salt}:${scryptSync('123456', salt, 64).toString('hex')}`, auth_version: 0, estado: 'Activo',
  fechaAlta: '2026-11-22T00:00:00.000Z',
}));
store.findAccountById = async (id) => accounts.find((item) => item.id === id);
store.findAccountBySlug = async (slug) => accounts.find((item) => item.slug === slug);
store.findAccountByEmail = async (email) => accounts.find((item) => item.email === email);
store.list = async () => accounts.map(publicAccount);
store.create = async (data, passwordHash) => {
  const account = { ...data, id: require('node:crypto').randomUUID(), password_hash: passwordHash, auth_version: 0, estado: 'Activo', fechaAlta: new Date().toISOString() };
  accounts.push(account); return publicAccount(account);
};
const images = new Map();
const services = new Map();
const products = new Map();
const bucket = require('../../src/bucket');
const objects = new Map();
bucket.putImage = async (id, kind, image) => { const key = `lubricentros/${id}/${kind}/${require('node:crypto').randomUUID()}.webp`; objects.set(key, image); return key; };
bucket.getImage = async (key) => objects.get(key);
bucket.removeImage = async (key) => { objects.delete(key); };
const publicProduct = ({ owner, key, ...item }) => ({ ...item, hasImage: Boolean(key) });
store.listProducts = async (id) => [...products.values()].filter((item) => item.owner === id).map(publicProduct);
store.findOwnedProduct = async (owner, id) => products.get(id)?.owner === owner ? publicProduct(products.get(id)) : null;
store.saveProductImage = async (account, id, key) => {
  const item = products.get(id); const owner = await store.findAccountById(account.id);
  if (!item || item.owner !== account.id || owner.estado !== 'Activo' || owner.auth_version !== account.auth_version) return null;
  const previousKey = item.key; item.key = key; return { record: publicProduct(item), previousKey };
};
store.getProductImage = async (slug, id) => { const account = await store.findAccountBySlug(slug); const item = products.get(id); return account?.estado === 'Activo' && item?.owner === account.id && item.key ? { key: item.key } : null; };
store.publicProducts = async (slug) => {
  const account = await store.findAccountBySlug(slug);
  return account && account.estado === 'Activo' ? store.listProducts(account.id) : [];
};
store.createProduct = async (account, data) => {
  const record = { stock: 0, ...data, id: require('node:crypto').randomUUID() };
  products.set(record.id, { ...record, owner: account.id }); return record;
};
store.updateProduct = async (account, id, data) => {
  const record = products.get(id); if (!record || record.owner !== account.id) return undefined;
  products.set(id, { ...record, ...data }); return publicProduct(products.get(id));
};
store.deleteProduct = async (account, id) => {
  const record = products.get(id); if (!record || record.owner !== account.id) return undefined;
  products.delete(id); return { id, _imageKey: record.key };
};
store.listServices = async (id) => [...services.values()].filter((item) => item.owner === id).map(({ owner, ...item }) => item);
store.publicServices = async (slug) => {
  const account = await store.findAccountBySlug(slug);
  return account && account.estado === 'Activo' ? store.listServices(account.id) : [];
};
store.createService = async (account, data) => {
  const record = { ...data, id: require('node:crypto').randomUUID() };
  services.set(record.id, { ...record, owner: account.id });
  return record;
};
store.updateService = async (account, id, data) => {
  const record = services.get(id);
  if (!record || record.owner !== account.id) return undefined;
  services.set(id, { ...data, id, owner: account.id });
  return { ...data, id };
};
store.deleteService = async (account, id) => {
  const record = services.get(id);
  if (!record || record.owner !== account.id) return undefined;
  services.delete(id); return { id };
};
store.findBySlug = async (slug) => {
  const account = await store.findAccountBySlug(slug);
  if (!account || account.estado !== 'Activo') return undefined;
  const { nombre, telefono, direccion, ciudad, provincia, hasCover, hasProfile } = account;
  return { nombre, slug, telefono, direccion, ciudad, provincia, hasCover, hasProfile };
};
store.saveImage = async (id, version, kind, image) => {
  const account = await store.findAccountById(id);
  if (!account || account.estado !== 'Activo' || account.auth_version !== version) return undefined;
  const previousKey = images.get(`${account.id}:${kind}`)?.key;
  images.set(`${account.id}:${kind}`, { key: image });
  account[kind === 'cover' ? 'hasCover' : 'hasProfile'] = true;
  return { record: publicAccount(account), previousKey };
};
store.getImage = async (slug, kind) => {
  const account = await store.findAccountBySlug(slug);
  return account && account.estado === 'Activo' ? images.get(`${account.id}:${kind}`) : null;
};
store.updateStatus = async (id, estado) => {
  const account = await store.findAccountById(id);
  if (account.estado !== estado) account.auth_version += 1;
  account.estado = estado;
  return publicAccount(account);
};
store.update = async (id, data, passwordHash) => {
  const account = await store.findAccountById(id);
  if (!account) return null;
  Object.assign(account, data, { auth_version: account.auth_version + 1 });
  if (passwordHash) account.password_hash = passwordHash;
  return publicAccount(account);
};
const server = createServer(app);
attachRealtime(server);
async function start() {
  if (process.argv.includes('--customers')) {
    const memory = await require('./customers-db.cjs')(accounts);
    Object.assign(store, memory.methods);
    const updateStatus = store.updateStatus;
    store.updateStatus = async (id, estado) => {
      const record = await updateStatus(id, estado); const account = await store.findAccountById(id);
      await memory.db.query('UPDATE panel_lubricentros SET estado=$1, auth_version=$2 WHERE id=$3', [estado, account.auth_version, id]);
      return record;
    };
  }
  server.listen(Number(process.env.TEST_PORT ?? 3101), '127.0.0.1', () => {
  console.log(`Servidor de prueba: http://127.0.0.1:${server.address().port}`);
  if (process.send) process.send({ port: server.address().port });
});
}
start().catch((cause) => { console.error(cause); process.exitCode = 1; });
