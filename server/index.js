const server = require('./src/app.js');
const store = require('./src/lubricentros-store');
const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await store.initialize();
    console.log('PostgreSQL conectado. Tabla panel_lubricentros preparada.');
    server.listen(PORT, () => {
      console.log(`Servidor corriendo en el puerto ${PORT}`);
    });
  } catch (error) {
    console.error('No se pudo inicializar PostgreSQL. Revisá DATABASE_URL o DB_HOST, DB_PORT, DB_USER, DB_PASSWORD y DB_DATABASE.');
    console.error('Código de conexión:', error.code || error.name);
    await store.close();
    process.exitCode = 1;
  }
}

start();
