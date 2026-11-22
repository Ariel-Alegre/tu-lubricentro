require('dotenv').config();
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
const {
  DB_USER, DB_PASSWORD, DB_HOST, DB_DATABASE, DB_PORT
} = process.env;

const sequelize = new Sequelize(`postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_DATABASE}`, {
  logging: false,
  native: false,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'postgres',
});

const basename = path.basename(__filename);
const modelDefiners = [];

// Leemos todos los archivos de la carpeta Models, los requerimos y agregamos al arreglo modelDefiners
fs.readdirSync(path.join(__dirname, '/models'))
  .filter((file) => (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js'))
  .forEach((file) => {
    modelDefiners.push(require(path.join(__dirname, '/models', file)));
  });

// Injectamos la conexión (sequelize) a todos los modelos
modelDefiners.forEach(model => model(sequelize));

// Capitalizamos los nombres de los modelos ie: product => Product
let entries = Object.entries(sequelize.models);
let capsEntries = entries.map((entry) => [entry[0][0].toUpperCase() + entry[0].slice(1), entry[1]]);
sequelize.models = Object.fromEntries(capsEntries);

// En sequelize.models están todos los modelos importados como propiedades
// Para relacionarlos hacemos un destructuring




const { Usuario, Producto, Categoria, Cliente, Marca, Talle, Genero, Color, Pedido, PedidoProducto , PedidoComida, PedidoComidaProducto, ProductoComida } = sequelize.models;

// 🔗 Definir relaciones
Usuario.hasMany(Producto, { foreignKey: 'usuarioId', as: 'productos' });
Producto.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });

Producto.belongsTo(Categoria, { foreignKey: 'categoriaId' });
Categoria.hasMany(Producto, { foreignKey: 'categoriaId' });


Usuario.hasMany(Cliente, {
  foreignKey: 'usuarioId',
  as: 'clientes'
});

Cliente.belongsTo(Usuario, {
  foreignKey: 'usuarioId',
  as: 'usuario'
});


Producto.belongsTo(Marca, { foreignKey: 'marcaId' });
Marca.hasMany(Producto, { foreignKey: 'marcaId' });


// ✅ Y reemplázalas por esta relación de muchos a muchos:
Producto.belongsToMany(Talle, { through: 'ProductoTalle', as: 'talles' });
Talle.belongsToMany(Producto, { through: 'ProductoTalle', as: 'productos' });

Producto.belongsTo(Genero, { foreignKey: 'generoId' });
Genero.hasMany(Producto, { foreignKey: 'generoId' });

Producto.belongsToMany(Color, { through: 'ProductoColor', as: 'colores' });
Color.belongsToMany(Producto, { through: 'ProductoColor', as: 'productos' });
// Cliente
Cliente.hasMany(Pedido, { foreignKey: 'clienteId' });
Pedido.belongsTo(Cliente, { foreignKey: 'clienteId' });

// Pedido - Producto relación muchos a muchos
Pedido.belongsToMany(Producto, { through: PedidoProducto});
Producto.belongsToMany(Pedido, { through: PedidoProducto });



// PedidoComida
PedidoComida.belongsTo(Cliente, { foreignKey: 'clienteId' });
PedidoComida.belongsTo(Usuario, { foreignKey: 'usuarioId' });
PedidoComida.hasMany(PedidoComidaProducto, { foreignKey: 'pedidoComidaId' });

// PedidoComidaProducto
PedidoComidaProducto.belongsTo(PedidoComida, { foreignKey: 'pedidoComidaId' });
PedidoComidaProducto.belongsTo(ProductoComida, { foreignKey: 'productoComidaId' });


module.exports = {
  ...sequelize.models, // para poder importar los modelos así: const { Product, User } = require('./db.js');
  conn: sequelize,     // para importar la conexión { conn } = require('./db.js');
};
