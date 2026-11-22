export type Customer = { id: string; nombre: string; telefono: string };
export type Vehicle = { id: string; patente: string; marca: string; modelo: string; clienteId: string; nombre: string; telefono: string; totalVisitas?: number; ultimaVisita?: string | null };
export type Visit = { id: string; fecha: string; servicio: string; productos: string[]; kilometraje: number | null; observaciones: string };
export type VehicleHistory = Vehicle & { visitas: Visit[] };
export type CustomerList = { clientes: Customer[]; vehiculos: Vehicle[] };
export function normalizePlate(value: string) { return value.toUpperCase().replace(/[\s-]/g, ''); }
export function visitDate(value: string) { const [year, month, day] = value.split('-'); return `${day}/${month}/${year}`; }
export function today() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
