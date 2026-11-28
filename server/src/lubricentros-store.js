const { Pool } = require('pg');
const customers = require('./customers-store');
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
    ALTER TABLE panel_lubricentros ADD COLUMN IF NOT EXISTS cover_image BYTEA;
    ALTER TABLE panel_lubricentros ADD COLUMN IF NOT EXISTS profile_image BYTEA;
    ALTER TABLE panel_lubricentros ADD COLUMN IF NOT EXISTS cover_image_key TEXT;
    ALTER TABLE panel_lubricentros ADD COLUMN IF NOT EXISTS profile_image_key TEXT;
    ALTER TABLE panel_lubricentros ADD COLUMN IF NOT EXISTS google_reviews_url TEXT NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS lubricentro_servicios (
      id UUID PRIMARY KEY,
      lubricentro_id UUID NOT NULL REFERENCES panel_lubricentros(id) ON DELETE CASCADE,
      nombre VARCHAR(120) NOT NULL,
      descripcion VARCHAR(1000) NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS lubricentro_servicios_comercio_idx ON lubricentro_servicios(lubricentro_id);
    CREATE TABLE IF NOT EXISTS lubricentro_productos (
      id UUID PRIMARY KEY,
      lubricentro_id UUID NOT NULL REFERENCES panel_lubricentros(id) ON DELETE CASCADE,
      nombre VARCHAR(120) NOT NULL,
      descripcion VARCHAR(1000) NOT NULL DEFAULT '',
      precio NUMERIC(12,2) NOT NULL CHECK (precio >= 0)
    );
    CREATE INDEX IF NOT EXISTS lubricentro_productos_comercio_idx ON lubricentro_productos(lubricentro_id);
    ALTER TABLE lubricentro_productos ADD COLUMN IF NOT EXISTS image_key TEXT;
    ALTER TABLE lubricentro_productos ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0);
    ${customers.schema}
    `).catch((error) => { ready = null; throw error; });
  }
  await ready;
  return pool;
}

const PUBLIC_COLUMNS = 'id, nombre, slug, email, telefono, direccion, ciudad, provincia, responsable, estado, google_reviews_url AS "reviewsUrl", fecha_alta AS "fechaAlta", (cover_image_key IS NOT NULL OR cover_image IS NOT NULL) AS "hasCover", (profile_image_key IS NOT NULL OR profile_image IS NOT NULL) AS "hasProfile"';
const PRODUCT_COLUMNS = 'id, nombre, descripcion, precio, stock, image_key IS NOT NULL AS "hasImage"';

async function transaction(work) {
  const client = await (await database()).connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

module.exports = {
  async saveReviewsUrl(account, url) {
    return (await (await database()).query(`UPDATE panel_lubricentros SET google_reviews_url=$1
      WHERE id=$2 AND estado='Activo' AND auth_version=$3 RETURNING ${PUBLIC_COLUMNS}`, [url, account.id, account.auth_version])).rows[0];
  },
  async changePassword(account, passwordHash) {
    return (await (await database()).query(`UPDATE panel_lubricentros SET password_hash=$1, auth_version=auth_version+1
      WHERE id=$2 AND estado='Activo' AND auth_version=$3 AND password_hash=$4 RETURNING id`,
    [passwordHash, account.id, account.auth_version, account.password_hash])).rows[0];
  },
  ...customers.methods({ database, transaction }),
  async listProducts(id) {
    return (await (await database()).query(`SELECT ${PRODUCT_COLUMNS} FROM lubricentro_productos WHERE lubricentro_id=$1 ORDER BY nombre, id`, [id])).rows;
  },
  async publicProducts(slug) {
    return (await (await database()).query(`SELECT p.id, p.nombre, p.descripcion, p.precio, p.image_key IS NOT NULL AS "hasImage" FROM lubricentro_productos p JOIN panel_lubricentros l ON l.id=p.lubricentro_id WHERE l.slug=$1 AND l.estado='Activo' ORDER BY p.nombre, p.id`, [slug])).rows;
  },
  async createProduct(account, data) {
    const { randomUUID } = require('crypto');
    return (await (await database()).query(`INSERT INTO lubricentro_productos (id, lubricentro_id, nombre, descripcion, precio, stock)
      SELECT $1, id, $2, $3, $4, $7 FROM panel_lubricentros WHERE id=$5 AND estado='Activo' AND auth_version=$6
      RETURNING ${PRODUCT_COLUMNS}`, [randomUUID(), data.nombre, data.descripcion, data.precio, account.id, account.auth_version, data.stock ?? 0])).rows[0];
  },
  async updateProduct(account, id, data) {
    return (await (await database()).query(`UPDATE lubricentro_productos p SET nombre=$1, descripcion=$2, precio=$3, stock=COALESCE($7, p.stock) FROM panel_lubricentros l
      WHERE p.id=$4 AND p.lubricentro_id=$5 AND l.id=p.lubricentro_id AND l.estado='Activo' AND l.auth_version=$6
      RETURNING p.id, p.nombre, p.descripcion, p.precio, p.stock, p.image_key IS NOT NULL AS "hasImage"`, [data.nombre, data.descripcion, data.precio, id, account.id, account.auth_version, data.stock ?? null])).rows[0];
  },
  async deleteProduct(account, id) {
    return (await (await database()).query(`DELETE FROM lubricentro_productos p USING panel_lubricentros l
      WHERE p.id=$1 AND p.lubricentro_id=$2 AND l.id=p.lubricentro_id AND l.estado='Activo' AND l.auth_version=$3 RETURNING p.id, p.image_key AS "_imageKey"`, [id, account.id, account.auth_version])).rows[0];
  },
  async findOwnedProduct(ownerId, id) {
    return (await (await database()).query(`SELECT ${PRODUCT_COLUMNS} FROM lubricentro_productos WHERE id=$1 AND lubricentro_id=$2`, [id, ownerId])).rows[0];
  },
  async saveProductImage(account, id, key) {
    return transaction(async (client) => {
      const current = (await client.query(`SELECT p.image_key AS "previousKey" FROM lubricentro_productos p JOIN panel_lubricentros l ON l.id=p.lubricentro_id
        WHERE p.id=$1 AND p.lubricentro_id=$2 AND l.estado='Activo' AND l.auth_version=$3 FOR UPDATE OF l, p`, [id, account.id, account.auth_version])).rows[0];
      if (!current) return null;
      const record = (await client.query(`UPDATE lubricentro_productos SET image_key=$1 WHERE id=$2 RETURNING ${PRODUCT_COLUMNS}`, [key, id])).rows[0];
      return { record, previousKey: current.previousKey };
    });
  },
  async getProductImage(slug, id) {
    const record = (await (await database()).query(`SELECT p.image_key AS key FROM lubricentro_productos p JOIN panel_lubricentros l ON l.id=p.lubricentro_id WHERE p.id=$1 AND l.slug=$2 AND l.estado='Activo'`, [id, slug])).rows[0];
    return record && record.key ? record : null;
  },
  async listServices(id) {
    return (await (await database()).query('SELECT id, nombre, descripcion FROM lubricentro_servicios WHERE lubricentro_id=$1 ORDER BY nombre, id', [id])).rows;
  },
  async publicServices(slug) {
    return (await (await database()).query(`SELECT s.id, s.nombre, s.descripcion FROM lubricentro_servicios s JOIN panel_lubricentros l ON l.id=s.lubricentro_id WHERE l.slug=$1 AND l.estado='Activo' ORDER BY s.nombre, s.id`, [slug])).rows;
  },
  async createService(account, data) {
    const { randomUUID } = require('crypto');
    return (await (await database()).query(`INSERT INTO lubricentro_servicios (id, lubricentro_id, nombre, descripcion)
      SELECT $1, id, $2, $3 FROM panel_lubricentros WHERE id=$4 AND estado='Activo' AND auth_version=$5
      RETURNING id, nombre, descripcion`, [randomUUID(), data.nombre, data.descripcion, account.id, account.auth_version])).rows[0];
  },
  async updateService(account, serviceId, data) {
    return (await (await database()).query(`UPDATE lubricentro_servicios s SET nombre=$1, descripcion=$2 FROM panel_lubricentros l
      WHERE s.id=$3 AND s.lubricentro_id=$4 AND l.id=s.lubricentro_id AND l.estado='Activo' AND l.auth_version=$5
      RETURNING s.id, s.nombre, s.descripcion`, [data.nombre, data.descripcion, serviceId, account.id, account.auth_version])).rows[0];
  },
  async deleteService(account, serviceId) {
    return (await (await database()).query(`DELETE FROM lubricentro_servicios s USING panel_lubricentros l
      WHERE s.id=$1 AND s.lubricentro_id=$2 AND l.id=s.lubricentro_id AND l.estado='Activo' AND l.auth_version=$3 RETURNING s.id`, [serviceId, account.id, account.auth_version])).rows[0];
  },
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
    return (await (await database()).query(`SELECT nombre, slug, telefono, direccion, ciudad, provincia, google_reviews_url AS "reviewsUrl", (cover_image_key IS NOT NULL OR cover_image IS NOT NULL) AS "hasCover", (profile_image_key IS NOT NULL OR profile_image IS NOT NULL) AS "hasProfile" FROM panel_lubricentros WHERE slug=$1 AND estado='Activo'`, [slug])).rows[0];
  },
  async findAccountBySlug(slug) {
    return (await (await database()).query(`SELECT ${PUBLIC_COLUMNS}, password_hash, auth_version FROM panel_lubricentros WHERE slug=$1`, [slug])).rows[0];
  },
  async findAccountByEmail(email) {
    return (await (await database()).query(`SELECT ${PUBLIC_COLUMNS}, password_hash, auth_version FROM panel_lubricentros WHERE email=$1`, [email])).rows[0];
  },
  async findAccountById(id) {
    return (await (await database()).query(`SELECT ${PUBLIC_COLUMNS}, password_hash, auth_version FROM panel_lubricentros WHERE id=$1`, [id])).rows[0];
  },
  async saveImage(id, version, kind, key) {
    const column = { cover: 'cover_image', profile: 'profile_image' }[kind];
    if (!column) throw new Error('Tipo de imagen inválido');
    return transaction(async (client) => {
      const current = (await client.query(`SELECT ${column}_key AS "previousKey" FROM panel_lubricentros WHERE id=$1 AND estado='Activo' AND auth_version=$2 FOR UPDATE`, [id, version])).rows[0];
      if (!current) return null;
      const record = (await client.query(`UPDATE panel_lubricentros SET ${column}_key=$1, ${column}=NULL WHERE id=$2 RETURNING ${PUBLIC_COLUMNS}`, [key, id])).rows[0];
      return { record, previousKey: current.previousKey };
    });
  },
  async getImage(slug, kind) {
    const column = { cover: 'cover_image', profile: 'profile_image' }[kind];
    if (!column) return null;
    const row = (await (await database()).query(`SELECT ${column}_key AS key, ${column} AS image FROM panel_lubricentros WHERE slug=$1 AND estado='Activo'`, [slug])).rows[0];
    return row && row.key ? { key: row.key } : row && row.image;
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
