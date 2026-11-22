export type Customer = { id: string; nombre: string; telefono: string };
export type Vehicle = { id: string; patente: string; marca: string; modelo: string; clienteId: string; nombre: string; telefono: string; totalVisitas?: number; ultimaVisita?: string | null };
export type PaymentMethod = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'mercado_pago' | 'otro';
export const paymentMethods: { value: PaymentMethod; label: string }[] = [{ value: 'efectivo', label: 'Efectivo' }, { value: 'transferencia', label: 'Transferencia' }, { value: 'debito', label: 'Tarjeta de débito' }, { value: 'credito', label: 'Tarjeta de crédito' }, { value: 'mercado_pago', label: 'Mercado Pago' }, { value: 'otro', label: 'Otro' }];
export const paymentLabel = (method: PaymentMethod) => paymentMethods.find((item) => item.value === method)?.label || method;
export function amountInCents(value: string) { const [whole, fraction = ''] = value.split('.'); return Number(whole) * 100 + Number(fraction.padEnd(2, '0')); }
export type Visit = { id: string; fecha: string; servicio: string; productos: string[]; kilometraje: number | null; observaciones: string; monto: string | null; metodoPago: PaymentMethod | null };
export type VehicleHistory = Vehicle & { visitas: Visit[] };
export type CustomerList = { clientes: Customer[]; vehiculos: Vehicle[] };
export function normalizePlate(value: string) { return value.toUpperCase().replace(/[\s-]/g, ''); }
export function visitDate(value: string) { const [year, month, day] = value.split('-'); return `${day}/${month}/${year}`; }
export function today() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
