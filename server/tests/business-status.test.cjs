const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

test('estado automático: límites exactos, pausa, días cerrados y fecha en Argentina', async () => {
  const { businessStatusAt, weekDays } = await import(pathToFileURL(path.resolve(__dirname, '../../client/app/lib/opening-hours.ts')).href);
  const hours = weekDays.map(({ key }) => ({ day: key, closed: key !== 'lunes', ranges: key === 'lunes' ? [{ from: '09:00', to: '13:00' }, { from: '16:00', to: '18:00' }] : [] }));
  for (const [time, expected] of [
    ['11:59:59', false], ['12:00:00', true], ['15:59:59', true],
    ['16:00:00', false], ['18:59:59', false], ['19:00:00', true],
    ['20:59:59', true], ['21:00:00', false],
  ]) assert.equal(businessStatusAt(hours, new Date(`2026-11-23T${time}Z`)).isOpen, expected, `UTC ${time} (Argentina UTC-3)`);
  const beforeMidnight = businessStatusAt(hours, new Date('2026-11-24T02:30:00Z'));
  assert.equal(beforeMidnight.day, 'lunes'); assert.equal(beforeMidnight.isOpen, false);
  const afterMidnight = businessStatusAt(hours, new Date('2026-11-24T03:00:00Z'));
  assert.equal(afterMidnight.day, 'martes'); assert.equal(afterMidnight.isOpen, false);
  assert.equal(businessStatusAt(hours, new Date('2026-11-24T13:00:00Z')).isOpen, false);
  assert.equal(businessStatusAt([], new Date('2026-11-23T13:00:00Z')).isOpen, null);
});
