const { PGlite } = require('@electric-sql/pglite');
const customers = require('../../src/customers-store');

// Motor PostgreSQL en memoria: ejecuta el esquema y las consultas reales sin Railway.
module.exports = async function customersDatabase(accounts) {
  const db = new PGlite();
  await db.exec(`CREATE TABLE panel_lubricentros (id UUID PRIMARY KEY, estado TEXT NOT NULL, auth_version INTEGER NOT NULL, nombre TEXT, slug TEXT); ${customers.schema}`);
  await db.exec("ALTER TABLE panel_lubricentros ADD COLUMN google_reviews_url TEXT NOT NULL DEFAULT ''");
  for (const account of accounts) await db.query('INSERT INTO panel_lubricentros (id,estado,auth_version,nombre,slug) VALUES ($1,$2,$3,$4,$5)', [account.id, account.estado, account.auth_version, account.nombre, account.slug]);
  function adapter(connection) {
    return { async query(sql, values) { const result = await connection.query(sql, values); return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 }; } };
  }
  const methods = customers.methods({ database: async () => adapter(db), transaction: (work) => db.transaction((tx) => work(adapter(tx))) });
  return { db, methods };
};
