const test = require('node:test');
const assert = require('node:assert/strict');
const { scryptSync } = require('node:crypto');
const { createServer } = require('node:http');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { io: connect } = require('socket.io-client');

test('acceso por lubricentro y revocación por socket', async () => {
  process.env.admin_panel = 'root@example.test';
  process.env.admin_password = 'root-test-password';
  process.env.ADMIN_JWT_SECRET = 'test-only-secret-for-tenant-access-test';
  const app = require('../src/app');
  const store = require('../src/lubricentros-store');
  const { attachRealtime } = require('../src/realtime');
  const { publicAccount } = require('../src/tenant-auth');
  const password = '123456';
  const salt = 'a'.repeat(32);
  const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  const accounts = ['el-cano', 'lorenzo'].map((slug, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index + 1}`, slug, nombre: slug,
    email: `${slug}@example.test`, password_hash: hash, auth_version: 0, estado: 'Activo',
  }));
  const originals = { findAccountById: store.findAccountById, findAccountBySlug: store.findAccountBySlug, findAccountByEmail: store.findAccountByEmail, updateStatus: store.updateStatus, saveImage: store.saveImage, getImage: store.getImage };
  const images = new Map();
  store.findAccountById = async (id) => accounts.find((item) => item.id === id);
  store.findAccountBySlug = async (slug) => accounts.find((item) => item.slug === slug);
  store.findAccountByEmail = async (email) => accounts.find((item) => item.email === email);
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
  const io = attachRealtime(server);
  const sockets = [];
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', body, token) => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const tenantLogin = (slug, pass = password) => request('/api/tenant/login', 'POST', { email: `${slug}@example.test`, password: pass });
  async function socketFor(token, slug) {
    const response = await request(`/api/tenant/${slug}/socket`, 'POST', undefined, token);
    assert.equal(response.status, 200);
    const { ticket } = await response.json();
    const socket = connect(base, { transports: ['websocket'], auth: { ticket }, autoConnect: false, reconnection: false });
    sockets.push(socket);
    const ready = once(socket, 'session:ready', { signal: AbortSignal.timeout(5000) });
    socket.connect();
    const [account] = await ready;
    assert.equal(account.slug, slug);
    assert.equal(account.password_hash, undefined);
    return { socket, ticket };
  }
  try {
    let response = await tenantLogin('el-cano', 'incorrecta');
    assert.equal(response.status, 401);
    response = await tenantLogin('el-cano');
    const { token, slug: firstSlug } = await response.json();
    assert.equal(jwt.decode(token).exp, undefined, 'el token de sesión no tiene vencimiento');
    const futureSession = jwt.verify(token, process.env.ADMIN_JWT_SECRET, {
      algorithms: ['HS256'], issuer: 'tu-lubricentro', audience: 'panel-lubricentro',
      clockTimestamp: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 60 * 60,
    });
    assert.equal(futureSession.sub, accounts[0].id, 'no vence aunque transcurran diez años');
    assert.equal(firstSlug, 'el-cano', 'login general identifica el slug por correo');
    const second = await tenantLogin('lorenzo');
    const { token: token2, slug: secondSlug } = await second.json();
    assert.equal(secondSlug, 'lorenzo', 'el segundo comercio obtiene su propio destino');
    response = await request('/api/tenant/lorenzo/session', 'GET', undefined, token);
    assert.equal(response.status, 403, 'no accede a otro comercio');
    response = await request('/api/tenant/el-cano/session', 'GET', undefined, token);
    const session = await response.json();
    assert.equal(response.status, 200);
    assert.equal(session.password_hash, undefined);
    response = await request('/api/lubricentros/el-cano/images/cover');
    assert.equal(response.status, 404, 'sin foto personalizada se usa el valor por defecto del cliente');
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#155fa0' } }).png().toBuffer();
    async function upload(slug, kind, buffer, auth = token) {
      const form = new FormData(); form.append('image', new Blob([buffer], { type: 'image/png' }), 'test.png');
      return fetch(`${base}/api/tenant/${slug}/images/${kind}`, { method: 'POST', headers: { Authorization: `Bearer ${auth}` }, body: form });
    }
    for (const kind of ['cover', 'profile']) {
      response = await upload('el-cano', kind, png);
      assert.equal(response.status, 200, `sube ${kind}`);
      const record = await response.json();
      assert.equal(record.password_hash, undefined);
      assert.equal(record[kind === 'cover' ? 'hasCover' : 'hasProfile'], true);
      response = await request(`/api/lubricentros/el-cano/images/${kind}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/webp');
      const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
      assert.equal(metadata.format, 'webp', 'valida y convierte el contenido real');
    }
    response = await upload('lorenzo', 'cover', png);
    assert.equal(response.status, 403, 'no sube imágenes a otro comercio');
    response = await upload('el-cano', 'profile', Buffer.from('not an image'));
    assert.equal(response.status, 400, 'rechaza contenido falso aunque se anuncie como PNG');
    response = await upload('el-cano', 'profile', Buffer.alloc(5 * 1024 * 1024 + 1));
    assert.equal(response.status, 400, 'rechaza archivos mayores de 5 MB');
    const a = await socketFor(token, 'el-cano');
    const a2 = await socketFor(token, 'el-cano');
    const b = await socketFor(token2, 'lorenzo');
    response = await request('/api/tenant/el-cano/session', 'GET', undefined, a.ticket);
    assert.equal(response.status, 401, 'un ticket socket no sirve como sesión HTTP');
    response = await request('/api/admin/login', 'POST', { email: process.env.admin_panel, password: process.env.admin_password });
    const { token: rootToken } = await response.json();
    assert.equal(jwt.decode(rootToken).exp, undefined, 'el token del panel raíz tampoco vence');
    response = await request('/api/tenant/el-cano/session', 'GET', undefined, rootToken);
    assert.equal(response.status, 401, 'roles separados');
    const revoked = once(a.socket, 'session:revoked', { signal: AbortSignal.timeout(5000) });
    const revokedSecondTab = once(a2.socket, 'session:revoked', { signal: AbortSignal.timeout(5000) });
    response = await request(`/api/admin/lubricentros/${accounts[0].id}/estado`, 'PATCH', { estado: 'Inactivo' }, rootToken);
    assert.equal(response.status, 200);
    await revoked;
    await revokedSecondTab;
    assert.equal(b.socket.connected, true, 'no expulsa al otro comercio');
    response = await tenantLogin('el-cano');
    assert.equal(response.status, 403, 'inactivo no puede ingresar');
    response = await upload('el-cano', 'profile', png);
    assert.equal(response.status, 403, 'inactivo no puede subir imágenes');
    response = await request('/api/lubricentros/el-cano/images/cover');
    assert.equal(response.status, 404, 'no publica fotos de comercios inactivos');
    response = await request('/api/tenant/el-cano/session', 'GET', undefined, token);
    assert.equal(response.status, 403, 'sesión previa revocada');
    const rejectedSocket = connect(base, { transports: ['websocket'], auth: { ticket: a.ticket }, autoConnect: false, reconnection: false });
    sockets.push(rejectedSocket);
    const rejection = once(rejectedSocket, 'connect_error', { signal: AbortSignal.timeout(5000) });
    rejectedSocket.connect();
    const [socketError] = await rejection;
    assert.equal(socketError.data.status, 403, 'rechaza reconexión de sesión desactivada');
    await request(`/api/admin/lubricentros/${accounts[0].id}/estado`, 'PATCH', { estado: 'Activo' }, rootToken);
    response = await request('/api/tenant/el-cano/session', 'GET', undefined, token);
    assert.equal(response.status, 403, 'reactivar no rehabilita tokens anteriores');
    response = await tenantLogin('el-cano');
    assert.equal(response.status, 200, 'reactivado puede iniciar sesión nueva');
  } finally {
    sockets.forEach((socket) => socket.disconnect());
    await new Promise((resolve) => io.close(resolve));
    Object.assign(store, originals);
  }
});
