export const weekDays = [
  { key: 'lunes', label: 'Lunes' }, { key: 'martes', label: 'Martes' },
  { key: 'miercoles', label: 'Miércoles' }, { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' }, { key: 'sabado', label: 'Sábado' }, { key: 'domingo', label: 'Domingo' },
] as const;
export type OpeningDay = { day: string; closed: boolean; ranges: { from: string; to: string }[] };
export type BusinessHours = { openingHours?: OpeningDay[]; isOpen?: boolean | null };
