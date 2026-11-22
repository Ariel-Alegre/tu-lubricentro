const { Server } = require('socket.io');
const { authenticate, publicAccount } = require('./tenant-auth');
let io;

function attachRealtime(httpServer) {
  io = new Server(httpServer, { cors: { origin: true, methods: ['GET', 'POST'] } });
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

function revokeTenant(id) {
  if (!io) return;
  const room = `lubricentro:${id}`;
  io.to(room).emit('session:revoked');
  io.in(room).disconnectSockets(true);
}

module.exports = { attachRealtime, revokeTenant };
