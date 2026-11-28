const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const validTime = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

function normalizeHours(value) {
  if (!Array.isArray(value) || value.length !== 7) throw new Error('Completá los siete días de la semana');
  return days.map((day) => {
    const matches = value.filter((item) => item && item.day === day);
    if (matches.length !== 1 || typeof matches[0].closed !== 'boolean' || !Array.isArray(matches[0].ranges) || matches[0].ranges.length > 3) throw new Error('Revisá los días y horarios de atención');
    const item = matches[0];
    if (item.closed) return { day, closed: true, ranges: [] };
    if (!item.ranges.length) throw new Error('Indicá al menos un horario para cada día de atención');
    const ranges = item.ranges.map((range) => {
      if (!range || !validTime(range.from) || !validTime(range.to) || range.from >= range.to) throw new Error('La hora de cierre debe ser posterior a la de apertura');
      return { from: range.from, to: range.to };
    }).sort((a, b) => a.from.localeCompare(b.from));
    if (ranges.some((range, index) => index > 0 && ranges[index - 1].to > range.from)) throw new Error('Los horarios de un mismo día no pueden superponerse');
    return { day, closed: false, ranges };
  });
}
module.exports = { normalizeHours };
