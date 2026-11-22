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
store.updateStatus = async (id, estado) => {
  const account = await store.findAccountById(id);
  if (account.estado !== estado) account.auth_version += 1;
  account.estado = estado;
  return publicAccount(account);
};
const server = createServer(app);
attachRealtime(server);
server.listen(3101, '127.0.0.1', () => console.log('Servidor de prueba: http://127.0.0.1:3101'));
