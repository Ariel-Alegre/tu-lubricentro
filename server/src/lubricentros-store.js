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
    pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
      host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
    });
  }
  if (!ready) {
    ready = pool.query(`CREATE TABLE IF NOT EXISTS panel_lubricentros (
      id UUID PRIMARY KEY,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      telefono TEXT NOT NULL,
      direccion TEXT NOT NULL,
      ciudad TEXT NOT NULL,
      provincia TEXT NOT NULL,
      responsable TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
      fecha_alta TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`).catch((error) => { ready = null; throw error; });
  }
  await ready;
  return pool;
}

const PUBLIC_COLUMNS = 'id, nombre, email, telefono, direccion, ciudad, provincia, responsable, estado, fecha_alta AS "fechaAlta"';

module.exports = {
  async list() {
    return (await (await database()).query(`SELECT ${PUBLIC_COLUMNS} FROM panel_lubricentros ORDER BY fecha_alta DESC`)).rows;
  },
  async create(data, passwordHash) {
    const { randomUUID } = require('crypto');
    const values = [randomUUID(), data.nombre, data.email, data.telefono, data.direccion, data.ciudad, data.provincia, data.responsable, passwordHash];
    return (await (await database()).query(`INSERT INTO panel_lubricentros
      (id, nombre, email, telefono, direccion, ciudad, provincia, responsable, password_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${PUBLIC_COLUMNS}`, values)).rows[0];
  },
  async updateStatus(id, estado) {
    return (await (await database()).query(`UPDATE panel_lubricentros SET estado=$1 WHERE id=$2 RETURNING ${PUBLIC_COLUMNS}`, [estado, id])).rows[0];
  },
};
