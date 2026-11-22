const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

test('stock persistente: migración de productos existentes, enteros, aislamiento y ediciones compatibles', async () => {
  const db = new PGlite();
  const pg = require('pg');
  const descriptor = Object.getOwnPropertyDescriptor(pg, 'Pool');
  const previousHost = process.env.DB_HOST;
  process.env.DB_HOST = 'test-in-memory';
  const adapter = {
    async query(sql, values) {
      if (values) return db.query(sql, values);
      const results = await db.exec(sql);
      return results.at(-1);
    },
  };
  Object.defineProperty(pg, 'Pool', { configurable: true, value: class { constructor() { return adapter; } } });
  const modulePath = require.resolve('../src/lubricentros-store');
  delete require.cache[modulePath];
  let store = require(modulePath);
  const own = { id: randomUUID(), auth_version: 0 };
  const other = { id: randomUUID(), auth_version: 0 };
  const values = { nombre: 'Aceite', descripcion: '', precio: '100' };
  try {
    await store.listProducts(own.id);
    for (const [index, account] of [own, other].entries()) {
      await db.query(`INSERT INTO panel_lubricentros (id,nombre,slug,email,telefono,direccion,ciudad,provincia,responsable,password_hash) VALUES ($1,'Comercio',$2,$2,'','','','','','test')`, [account.id, `comercio-${index}`]);
    }
    const legacy = await store.createProduct(own, values);
    await db.exec('ALTER TABLE lubricentro_productos DROP COLUMN stock');
    delete require.cache[modulePath]; store = require(modulePath);
    assert.equal((await store.listProducts(own.id))[0].stock, 0, 'migrar conserva el producto y agrega cero');
    let product = await store.updateProduct(own, legacy.id, { ...values, stock: 15 });
    assert.equal(product.stock, 15);
    product = await store.updateProduct(own, legacy.id, { ...values, precio: '150' });
    assert.equal(product.stock, 15, 'editar sin enviar stock conserva unidades');
    assert.equal((await store.findOwnedProduct(own.id, product.id)).stock, 15);
    assert.equal(await store.updateProduct(other, product.id, { ...values, stock: 999 }), undefined);
    assert.deepEqual(await store.listProducts(other.id), []);
    product = await store.updateProduct(own, legacy.id, { ...values, stock: 0 });
    assert.equal(product.stock, 0);
    assert.equal((await store.createProduct(own, { ...values, stock: 7 })).stock, 7);
    await assert.rejects(store.updateProduct(own, legacy.id, { ...values, stock: -1 }));
    const publicProducts = await store.publicProducts('comercio-0');
    assert.equal(publicProducts.length, 2); assert.equal('stock' in publicProducts[0], false);
  } finally {
    Object.defineProperty(pg, 'Pool', descriptor);
    if (previousHost === undefined) delete process.env.DB_HOST; else process.env.DB_HOST = previousHost;
    delete require.cache[modulePath];
    await db.close();
  }
});
