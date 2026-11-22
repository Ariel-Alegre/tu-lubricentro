const { Pool } = require('pg');
let pool;
let ready;

async function database() {
  if (!pool) {
    if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
      const error = new Error('Configurá DATABASE_URL en el servidor para registrar lubricentros');
      error.status = 503;
      throw error;
    }
    const connection = process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
      host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
    };
    pool = new Pool({ ...connection, connectionTimeoutMillis: 10000 });
  }
  if (!ready) {
    ready = pool.query(`CREATE TABLE IF NOT EXISTS panel_lubricentros (
      id UUID PRIMARY KEY,
      nombre TEXT NOT NULL,
      slug TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      telefono TEXT NOT NULL,
      direccion TEXT NOT NULL,
      ciudad TEXT NOT NULL,
      provincia TEXT NOT NULL,
      responsable TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
      fecha_alta TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE panel_lubricentros ADD COLUMN IF NOT EXISTS slug TEXT;
    UPDATE panel_lubricentros SET slug = 'lubricentro-' || id::text WHERE slug IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS panel_lubricentros_slug_unique ON panel_lubricentros(slug);
    ALTER TABLE panel_lubricentros ALTER COLUMN slug SET NOT NULL;
    ALTER TABLE panel_lubricentros ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
    `).catch((error) => { ready = null; throw error; });
  }
  await ready;
  return pool;
}

const PUBLIC_COLUMNS = 'id, nombre, slug, email, telefono, direccion, ciudad, provincia, responsable, estado, fecha_alta AS "fechaAlta"';

module.exports = {
  initialize: database,
  async close() {
    if (pool) await pool.end();
    pool = null;
    ready = null;
  },
  async list() {
    return (await (await database()).query(`SELECT ${PUBLIC_COLUMNS} FROM panel_lubricentros ORDER BY fecha_alta DESC`)).rows;
  },
  async findBySlug(slug) {
    return (await (await database()).query(`SELECT nombre, slug, telefono, direccion, ciudad, provincia FROM panel_lubricentros WHERE slug=$1 AND estado='Activo'`, [slug])).rows[0];
  },
  async findAccountBySlug(slug) {
    return (await (await database()).query(`SELECT ${PUBLIC_COLUMNS}, password_hash, auth_version FROM panel_lubricentros WHERE slug=$1`, [slug])).rows[0];
  },
  async findAccountById(id) {
    return (await (await database()).query(`SELECT ${PUBLIC_COLUMNS}, password_hash, auth_version FROM panel_lubricentros WHERE id=$1`, [id])).rows[0];
  },
  async create(data, passwordHash) {
    const { randomUUID } = require('crypto');
    const values = [randomUUID(), data.nombre, data.email, data.telefono, data.direccion, data.ciudad, data.provincia, data.responsable, passwordHash, data.slug];
    return (await (await database()).query(`INSERT INTO panel_lubricentros
      (id, nombre, email, telefono, direccion, ciudad, provincia, responsable, password_hash, slug)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${PUBLIC_COLUMNS}`, values)).rows[0];
  },
  async updateStatus(id, estado) {
    return (await (await database()).query(`UPDATE panel_lubricentros SET estado=$1,
      auth_version=auth_version + CASE WHEN estado<>$1 THEN 1 ELSE 0 END
      WHERE id=$2 RETURNING ${PUBLIC_COLUMNS}`, [estado, id])).rows[0];
  },
  async update(id, data, passwordHash) {
    const values = [data.nombre, data.slug, data.email, data.telefono, data.direccion, data.ciudad, data.provincia, data.responsable, passwordHash, id];
    return (await (await database()).query(`UPDATE panel_lubricentros SET
      nombre=$1, slug=$2, email=$3, telefono=$4, direccion=$5, ciudad=$6, provincia=$7, responsable=$8,
      password_hash=COALESCE($9, password_hash), auth_version=auth_version+1
      WHERE id=$10 RETURNING ${PUBLIC_COLUMNS}`, values)).rows[0];
  },
};
