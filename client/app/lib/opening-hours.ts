export const weekDays = [
  { key: 'lunes', label: 'Lunes' }, { key: 'martes', label: 'Martes' },
  { key: 'miercoles', label: 'Miércoles' }, { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' }, { key: 'sabado', label: 'Sábado' }, { key: 'domingo', label: 'Domingo' },
] as const;
export type OpeningDay = { day: string; closed: boolean; ranges: { from: string; to: string }[] };
export type BusinessHours = { openingHours?: OpeningDay[]; temporarilyClosed?: boolean };

export function businessStatusAt(hours: OpeningDay[], now: Date, temporarilyClosed = false) {
  const parts = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  const day = part('weekday').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const time = `${part('hour')}:${part('minute')}`;
  const schedule = hours.find((item) => item.day === day);
  const ranges = schedule && !schedule.closed ? schedule.ranges : [];
  return { day, ranges, isOpen: temporarilyClosed ? false : hours.length ? ranges.some((range) => range.from <= time && time < range.to) : null };
}
