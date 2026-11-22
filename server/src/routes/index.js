
const { Router  }= require('express');
const router = Router();

const routerUsuarios= require("./usuarios");
const routerProductos= require("./productos");
const routerCategorias= require("./categorias");
const routerClientes= require("./clientes");
const routerMarcas= require("./marcas");
const routerTalles= require("./talles");
const routerGeneros= require("./generos");
const routerColor= require("./color");
const routerPedido= require("./pedidos");
const routerComidaRapida= require("./comidaRapida");










router.use('/api', routerUsuarios, routerProductos, routerCategorias, routerClientes, routerMarcas, routerTalles, routerGeneros, routerColor, routerPedido, routerComidaRapida) 



















module.exports = router