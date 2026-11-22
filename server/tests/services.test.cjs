const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');

test('servicios privados por comercio y catálogo público', async () => {
  process.env.ADMIN_JWT_SECRET = 'test-only-services-secret';
  const store = require('../src/lubricentros-store');
  const { signAccount } = require('../src/tenant-auth');
  const accounts = ['el-cano', 'lorenzo'].map((slug) => ({ id: randomUUID(), slug, nombre: slug, auth_version: 0, estado: 'Activo' }));
  const records = new Map();
  const methods = ['findAccountById', 'findBySlug', 'listServices', 'publicServices', 'publicProducts', 'createService', 'updateService', 'deleteService'];
  const originals = Object.fromEntries(methods.map((key) => [key, store[key]]));
  store.findAccountById = async (id) => accounts.find((item) => item.id === id);
  store.findBySlug = async (slug) => accounts.find((item) => item.slug === slug && item.estado === 'Activo');
  store.publicProducts = async () => [];
  store.listServices = async (id) => [...records.values()].filter((item) => item.owner === id).map(({ owner, ...data }) => data);
  store.publicServices = async (slug) => {
    const account = await store.findBySlug(slug);
    return account ? store.listServices(account.id) : [];
  };
  store.createService = async (account, data) => {
    const id = randomUUID(); records.set(id, { ...data, id, owner: account.id }); return { ...data, id };
  };
  store.updateService = async (account, id, data) => {
    if (records.get(id)?.owner !== account.id) return undefined;
    records.set(id, { ...data, id, owner: account.id }); return { ...data, id };
  };
  store.deleteService = async (account, id) => {
    if (records.get(id)?.owner !== account.id) return undefined;
    records.delete(id); return { id };
  };
  const app = require('../src/app');
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokens = accounts.map((account) => signAccount(account));
  const req = (slug, method = 'GET', data, id = '', token = tokens[0]) => fetch(`${base}/api/tenant/${slug}/services${id ? '/' + id : ''}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: data ? JSON.stringify(data) : undefined,
  });
  try {
    let response = await req('el-cano', 'POST', { nombre: 'Cambio de aceite', descripcion: 'Aceite y filtros' });
    assert.equal(response.status, 201); const service = await response.json();
    response = await req('el-cano'); assert.deepEqual(await response.json(), [service]);
    response = await req('lorenzo', 'GET', undefined, '', tokens[1]); assert.deepEqual(await response.json(), []);
    response = await req('lorenzo', 'POST', { nombre: 'Falso' }); assert.equal(response.status, 403);
    response = await req('lorenzo', 'PUT', { nombre: 'Falso' }, service.id, tokens[1]); assert.equal(response.status, 404);
    response = await req('lorenzo', 'DELETE', undefined, service.id, tokens[1]); assert.equal(response.status, 404);
    response = await req('el-cano', 'PUT', { nombre: 'Cambio de filtros', descripcion: '' }, service.id); assert.equal(response.status, 200);
    response = await fetch(`${base}/api/lubricentros/el-cano`); const profile = await response.json(); assert.equal(profile.services[0].nombre, 'Cambio de filtros');
    response = await fetch(`${base}/api/lubricentros/lorenzo`); assert.deepEqual((await response.json()).services, []);
    response = await req('el-cano', 'POST', { nombre: '   ' }); assert.equal(response.status, 400);
    response = await req('el-cano', 'POST', { nombre: 'Servicio', descripcion: 'x'.repeat(1001) }); assert.equal(response.status, 400);
    response = await req('el-cano', 'DELETE', undefined, service.id); assert.equal(response.status, 200);
    response = await req('el-cano'); assert.deepEqual(await response.json(), []);
    accounts[0].estado = 'Inactivo';
    response = await req('el-cano', 'POST', { nombre: 'Servicio' }); assert.equal(response.status, 403);
    response = await fetch(`${base}/api/lubricentros/el-cano`); assert.equal(response.status, 404);
  } finally { server.close(); Object.assign(store, originals); }
});
