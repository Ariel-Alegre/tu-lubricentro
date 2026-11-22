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
}));
store.findAccountById = async (id) => accounts.find((item) => item.id === id);
store.findAccountBySlug = async (slug) => accounts.find((item) => item.slug === slug);
store.findAccountByEmail = async (email) => accounts.find((item) => item.email === email);
const images = new Map();
const services = new Map();
const products = new Map();
store.listProducts = async (id) => [...products.values()].filter((item) => item.owner === id).map(({ owner, ...item }) => item);
store.publicProducts = async (slug) => {
  const account = await store.findAccountBySlug(slug);
  return account && account.estado === 'Activo' ? store.listProducts(account.id) : [];
};
store.createProduct = async (account, data) => {
  const record = { ...data, id: require('node:crypto').randomUUID() };
  products.set(record.id, { ...record, owner: account.id }); return record;
};
store.updateProduct = async (account, id, data) => {
  const record = products.get(id); if (!record || record.owner !== account.id) return undefined;
  products.set(id, { ...data, id, owner: account.id }); return { ...data, id };
};
store.deleteProduct = async (account, id) => {
  const record = products.get(id); if (!record || record.owner !== account.id) return undefined;
  products.delete(id); return { id };
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
  images.set(`${account.slug}:${kind}`, image);
  account[kind === 'cover' ? 'hasCover' : 'hasProfile'] = true;
  return publicAccount(account);
};
store.getImage = async (slug, kind) => {
  const account = await store.findAccountBySlug(slug);
  return account && account.estado === 'Activo' ? images.get(`${slug}:${kind}`) : null;
};
store.updateStatus = async (id, estado) => {
  const account = await store.findAccountById(id);
  if (account.estado !== estado) account.auth_version += 1;
  account.estado = estado;
  return publicAccount(account);
};
const server = createServer(app);
attachRealtime(server);
server.listen(3101, '127.0.0.1', () => console.log('Servidor de prueba: http://127.0.0.1:3101'));
