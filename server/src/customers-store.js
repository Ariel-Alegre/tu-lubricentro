const { randomUUID, randomBytes } = require('crypto');
const schema = `
CREATE TABLE IF NOT EXISTS lubricentro_clientes (
  id UUID PRIMARY KEY, lubricentro_id UUID NOT NULL REFERENCES panel_lubricentros(id) ON DELETE CASCADE,
  nombre VARCHAR(120) NOT NULL, telefono VARCHAR(40) NOT NULL DEFAULT '',
  UNIQUE (lubricentro_id, id)
);
CREATE TABLE IF NOT EXISTS lubricentro_vehiculos (
  id UUID PRIMARY KEY, lubricentro_id UUID NOT NULL REFERENCES panel_lubricentros(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL, patente VARCHAR(10) NOT NULL, marca VARCHAR(80) NOT NULL DEFAULT '', modelo VARCHAR(80) NOT NULL DEFAULT '',
  UNIQUE (lubricentro_id, patente), UNIQUE (lubricentro_id, id),
  FOREIGN KEY (lubricentro_id, cliente_id) REFERENCES lubricentro_clientes(lubricentro_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS lubricentro_atenciones (
  id UUID PRIMARY KEY, lubricentro_id UUID NOT NULL REFERENCES panel_lubricentros(id) ON DELETE CASCADE,
  vehiculo_id UUID NOT NULL, solicitud_id UUID NOT NULL,
  fecha DATE NOT NULL, servicio VARCHAR(120) NOT NULL, productos JSONB NOT NULL DEFAULT '[]',
  kilometraje INTEGER CHECK (kilometraje >= 0), observaciones VARCHAR(1000) NOT NULL DEFAULT '',
  creada TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (lubricentro_id, solicitud_id),
  FOREIGN KEY (lubricentro_id, vehiculo_id) REFERENCES lubricentro_vehiculos(lubricentro_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS lubricentro_atenciones_historial_idx ON lubricentro_atenciones(lubricentro_id, vehiculo_id, fecha DESC, creada DESC);
ALTER TABLE lubricentro_atenciones ADD COLUMN IF NOT EXISTS monto NUMERIC(12,2) CHECK (monto >= 0);
ALTER TABLE lubricentro_atenciones ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(32) CHECK (metodo_pago IS NULL OR (metodo_pago IN ('efectivo','transferencia','debito','credito','mercado_pago','otro') AND monto IS NOT NULL));
ALTER TABLE lubricentro_vehiculos ADD COLUMN IF NOT EXISTS history_token VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS lubricentro_vehiculos_history_token_unique ON lubricentro_vehiculos(history_token) WHERE history_token IS NOT NULL;
`;

const vehicleColumns = `v.id, v.patente, v.marca, v.modelo, c.id AS "clienteId", c.nombre, c.telefono`;
const fail = (status, message) => Object.assign(new Error(message), { status });

function methods({ database, transaction }) {
  async function authorized(client, account) {
    const result = await client.query(`SELECT id FROM panel_lubricentros WHERE id=$1 AND estado='Activo' AND auth_version=$2 FOR UPDATE`, [account.id, account.auth_version]);
    if (!result.rowCount) throw fail(403, 'Tu acceso cambió. Volvé a iniciar sesión.');
  }
  async function detail(client, owner, id) {
    const vehicle = (await client.query(`SELECT ${vehicleColumns} FROM lubricentro_vehiculos v JOIN lubricentro_clientes c ON c.id=v.cliente_id AND c.lubricentro_id=v.lubricentro_id WHERE v.lubricentro_id=$1 AND v.id=$2`, [owner, id])).rows[0];
    if (!vehicle) return null;
    vehicle.visitas = (await client.query(`SELECT id, to_char(fecha,'YYYY-MM-DD') AS fecha, servicio, productos, kilometraje, observaciones, monto, metodo_pago AS "metodoPago" FROM lubricentro_atenciones WHERE lubricentro_id=$1 AND vehiculo_id=$2 ORDER BY fecha DESC, creada DESC, id DESC`, [owner, id])).rows;
    return vehicle;
  }
  async function append(client, account, vehicleId, data) {
    await client.query(`INSERT INTO lubricentro_atenciones (id,lubricentro_id,vehiculo_id,solicitud_id,fecha,servicio,productos,kilometraje,observaciones,monto,metodo_pago) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`, [randomUUID(), account.id, vehicleId, data.solicitudId, data.fecha, data.servicio, JSON.stringify(data.productos), data.kilometraje, data.observaciones, data.monto ?? null, data.metodoPago ?? null]);
  }
  async function publicDetail(record) {
    if (!record) return null;
    const { vehicleId, ownerId, reviewsUrl, ...publicFields } = record;
    const visits = (await (await database()).query(`SELECT id, to_char(fecha,'YYYY-MM-DD') AS fecha, servicio, productos, kilometraje FROM lubricentro_atenciones WHERE lubricentro_id=$1 AND vehiculo_id=$2 ORDER BY fecha DESC, creada DESC, id DESC`, [ownerId, vehicleId])).rows;
    return { ...publicFields, ...(reviewsUrl ? { reviewsUrl } : {}), visitas: visits };
  }
  return {
    async shareCustomerHistory(account, id) {
      return transaction(async (client) => {
        await authorized(client, account);
        const record = (await client.query(`UPDATE lubricentro_vehiculos SET history_token=COALESCE(history_token,$1) WHERE lubricentro_id=$2 AND id=$3 RETURNING history_token AS token`, [randomBytes(32).toString('hex'), account.id, id])).rows[0];
        if (!record) throw fail(404, 'Vehículo no encontrado');
        return record;
      });
    },
    async sharedVehicle(token) {
      return (await (await database()).query(`SELECT v.id AS "vehicleId", v.lubricentro_id AS "ownerId", l.nombre AS lubricentro, l.slug, l.google_reviews_url AS "reviewsUrl", v.patente, v.marca, v.modelo FROM lubricentro_vehiculos v JOIN panel_lubricentros l ON l.id=v.lubricentro_id WHERE v.history_token=$1 AND l.estado='Activo'`, [token])).rows[0];
    },
    async publicCustomerHistory(token) {
      return publicDetail(await this.sharedVehicle(token));
    },
    async sharedVehicleByPlate(slug, plate) {
      return (await (await database()).query(`SELECT v.id AS "vehicleId", v.lubricentro_id AS "ownerId", l.nombre AS lubricentro, l.slug, l.google_reviews_url AS "reviewsUrl", v.patente, v.marca, v.modelo FROM lubricentro_vehiculos v JOIN panel_lubricentros l ON l.id=v.lubricentro_id WHERE l.slug=$1 AND v.patente=$2 AND l.estado='Activo'`, [slug, plate])).rows[0];
    },
    async publicCustomerHistoryByPlate(slug, plate) {
      return publicDetail(await this.sharedVehicleByPlate(slug, plate));
    },
    async payCustomerVisit(account, vehicleId, visitId, payment) {
      return transaction(async (client) => {
        await authorized(client, account);
        const current = (await client.query(`SELECT monto, metodo_pago AS "metodoPago" FROM lubricentro_atenciones WHERE lubricentro_id=$1 AND vehiculo_id=$2 AND id=$3 FOR UPDATE`, [account.id, vehicleId, visitId])).rows[0];
        if (!current) throw fail(404, 'Atención no encontrada');
        if (current.metodoPago) {
          if (current.monto !== payment.monto || current.metodoPago !== payment.metodoPago) throw fail(409, 'Esta atención ya tiene un pago registrado');
        } else {
          if (current.monto !== null && current.monto !== payment.monto) throw fail(409, 'El monto no coincide con el importe de la atención. Actualizá el historial.');
          await client.query(`UPDATE lubricentro_atenciones SET monto=$1, metodo_pago=$2 WHERE lubricentro_id=$3 AND vehiculo_id=$4 AND id=$5`, [payment.monto, payment.metodoPago, account.id, vehicleId, visitId]);
        }
        return detail(client, account.id, vehicleId);
      });
    },
    async listCustomers(owner) {
      const client = await database();
      const [vehicles, customers] = await Promise.all([
        client.query(`SELECT ${vehicleColumns}, COUNT(a.id)::int AS "totalVisitas", to_char(MAX(a.fecha),'YYYY-MM-DD') AS "ultimaVisita" FROM lubricentro_vehiculos v JOIN lubricentro_clientes c ON c.id=v.cliente_id AND c.lubricentro_id=v.lubricentro_id LEFT JOIN lubricentro_atenciones a ON a.vehiculo_id=v.id AND a.lubricentro_id=v.lubricentro_id WHERE v.lubricentro_id=$1 GROUP BY v.id,c.id ORDER BY c.nombre,v.patente`, [owner]),
        client.query(`SELECT id,nombre,telefono FROM lubricentro_clientes WHERE lubricentro_id=$1 ORDER BY nombre,id`, [owner]),
      ]);
      return { vehiculos: vehicles.rows, clientes: customers.rows };
    },
    async customerVehicle(owner, id) { return detail(await database(), owner, id); },
    async customerByPlate(owner, plate) {
      const client = await database();
      const vehicle = (await client.query(`SELECT id FROM lubricentro_vehiculos WHERE lubricentro_id=$1 AND patente=$2`, [owner, plate])).rows[0];
      return vehicle ? detail(client, owner, vehicle.id) : null;
    },
    async registerCustomerVehicle(account, data) {
      return transaction(async (client) => {
        await authorized(client, account);
        const previous = (await client.query(`SELECT vehiculo_id FROM lubricentro_atenciones WHERE lubricentro_id=$1 AND solicitud_id=$2`, [account.id, data.solicitudId])).rows[0];
        if (previous) {
          const vehicle = await detail(client, account.id, previous.vehiculo_id);
          if (vehicle.patente !== data.patente) throw fail(409, 'La solicitud ya corresponde a otro vehículo');
          return vehicle;
        }
        if ((await client.query(`SELECT id FROM lubricentro_vehiculos WHERE lubricentro_id=$1 AND patente=$2`, [account.id, data.patente])).rowCount) throw fail(409, 'Esta patente ya está registrada. Buscala para agregar una nueva atención.');
        let customerId = data.clienteId;
        if (customerId) {
          if (!(await client.query(`SELECT id FROM lubricentro_clientes WHERE lubricentro_id=$1 AND id=$2`, [account.id, customerId])).rowCount) throw fail(404, 'Cliente no encontrado');
        } else {
          customerId = randomUUID();
          await client.query(`INSERT INTO lubricentro_clientes (id,lubricentro_id,nombre,telefono) VALUES ($1,$2,$3,$4)`, [customerId, account.id, data.nombre, data.telefono]);
        }
        const id = randomUUID();
        await client.query(`INSERT INTO lubricentro_vehiculos (id,lubricentro_id,cliente_id,patente,marca,modelo) VALUES ($1,$2,$3,$4,$5,$6)`, [id, account.id, customerId, data.patente, data.marca, data.modelo]);
        await append(client, account, id, data);
        return detail(client, account.id, id);
      });
    },
    async addCustomerVisit(account, id, data) {
      return transaction(async (client) => {
        await authorized(client, account);
        if (!(await client.query(`SELECT id FROM lubricentro_vehiculos WHERE lubricentro_id=$1 AND id=$2`, [account.id, id])).rowCount) throw fail(404, 'Vehículo no encontrado');
        const previous = (await client.query(`SELECT vehiculo_id FROM lubricentro_atenciones WHERE lubricentro_id=$1 AND solicitud_id=$2`, [account.id, data.solicitudId])).rows[0];
        if (previous && previous.vehiculo_id !== id) throw fail(409, 'La solicitud ya corresponde a otro vehículo');
        if (!previous) await append(client, account, id, data);
        return detail(client, account.id, id);
      });
    },
  };
}
module.exports = { schema, methods };
