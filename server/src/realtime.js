const { Server } = require('socket.io');
const { authenticate, publicAccount } = require('./tenant-auth');
const store = require('./lubricentros-store');
const { validSlug } = require('./slug');
const { verifyAdminSocket } = require('./routes/admin');
let io;

function attachRealtime(httpServer) {
  io = new Server(httpServer, { cors: { origin: true, methods: ['GET', 'POST'] } });
  const root = io.of('/root');
  root.use((socket, next) => {
    try { verifyAdminSocket(socket.handshake.auth.ticket); next(); }
    catch { const error = new Error('Sesión inválida'); error.data = { status: 401 }; next(error); }
  });
  root.on('connection', async (socket) => {
    await socket.join('root-admins');
    try { verifyAdminSocket(socket.handshake.auth.ticket); socket.emit('root:ready'); }
    catch { socket.emit('root:revoked'); socket.disconnect(true); }
  });
  const histories = io.of('/history');
  histories.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const { slug, plate } = socket.handshake.auth;
      const record = typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
        ? await store.sharedVehicle(token)
        : validSlug(slug) && typeof plate === 'string' && /^[a-z0-9]{5,10}$/i.test(plate) ? await store.sharedVehicleByPlate(slug, plate.toUpperCase()) : null;
      if (!record) { const error = new Error('Historial no disponible'); error.data = { status: 404 }; return next(error); }
      socket.data.sharedVehicle = record; next();
    } catch { const error = new Error('Servicio no disponible'); error.data = { status: 503 }; next(error); }
  });
  histories.on('connection', async (socket) => {
    const { ownerId, vehicleId } = socket.data.sharedVehicle;
    await socket.join([`business:${ownerId}`, `vehicle:${vehicleId}`]);
    socket.emit('history:ready');
  });
  const profiles = io.of('/public');
  profiles.use(async (socket, next) => {
    try {
      const slug = socket.handshake.auth.slug;
      const account = validSlug(slug) ? await store.findAccountBySlug(slug) : null;
      if (!account || account.estado !== 'Activo') {
        const error = new Error('Perfil no disponible'); error.data = { status: 404 }; return next(error);
      }
      socket.data.profileId = account.id; next();
    } catch { const error = new Error('Servicio no disponible'); error.data = { status: 503 }; next(error); }
  });
  profiles.on('connection', async (socket) => {
    await socket.join(`profile:${socket.data.profileId}`);
    // Leer después de unirse también cubre cambios ocurridos durante la conexión.
    socket.emit('profile:ready');
  });
  io.use(async (socket, next) => {
    try {
      socket.data.account = await authenticate(socket.handshake.auth.ticket, 'socket');
      next();
    } catch (cause) {
      const error = new Error('No se pudo validar la sesión');
      error.data = { status: cause.status || 503 };
      next(error);
    }
  });
  io.on('connection', async (socket) => {
    const id = socket.data.account.id;
    await socket.join(`lubricentro:${id}`);
    // Revalidar después de unirse evita una carrera con la desactivación.
    try {
      const account = await authenticate(socket.handshake.auth.ticket, 'socket');
      socket.emit('session:ready', publicAccount(account));
    }
    catch { socket.emit('session:revoked'); socket.disconnect(true); }
  });
  return io;
}

function revokeTenant(id, reason) {
  if (!io) return;
  const room = `lubricentro:${id}`;
  if (reason === 'password-changed') io.to(room).emit('session:revoked', reason);
  else io.to(room).emit('session:revoked');
  io.in(room).disconnectSockets(true);
}

function publishProfileChange(id, slug, available = true, section = 'profile') {
  if (!io) return;
  // El canal público solo notifica cambios. No acepta escrituras ni difunde datos privados.
  io.of('/public').to(`profile:${id}`).emit('profile:changed', { slug, available });
  if (section === 'profile') {
    io.to(`lubricentro:${id}`).emit('profile:changed');
    io.of('/history').to(`business:${id}`).emit('history:changed');
  } else {
    io.to(`lubricentro:${id}`).emit('catalog:changed');
  }
}
function publishCustomersChange(id, vehicleId) {
  if (io) io.to(`lubricentro:${id}`).emit('customers:changed');
  if (io && vehicleId) io.of('/history').to(`vehicle:${vehicleId}`).emit('history:changed');
}
function publishRootChange() {
  if (io) io.of('/root').to('root-admins').emit('lubricentros:changed');
}
module.exports = { attachRealtime, revokeTenant, publishProfileChange, publishCustomersChange, publishRootChange };
