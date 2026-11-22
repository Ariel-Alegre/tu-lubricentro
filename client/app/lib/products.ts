export type Product = { id: string; nombre: string; descripcion: string; precio: string };
export const formatPrice = (value: string) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value));
