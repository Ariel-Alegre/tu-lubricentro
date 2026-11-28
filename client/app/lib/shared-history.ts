export type SharedHistory = { lubricentro: string; slug: string; reviewsUrl?: string; patente: string; marca: string; modelo: string; visitas: { id: string; fecha: string; servicio: string; productos: string[]; kilometraje: number | null }[] };
export const sharedHistoryPath = (slug: string, plate: string) => `/${encodeURIComponent(slug)}/${encodeURIComponent(plate)}`;
