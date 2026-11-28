// Fixture local 3101, Next 3102, Chrome CDP 9449. Sin cambios en Railway.
const assert = require('node:assert/strict');
(async () => {
  const tabs = await (await fetch('http://127.0.0.1:9449/json')).json();
  const ws = new WebSocket(tabs.find((t) => t.type === 'page' && t.url.includes('3102')).webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  async function call(method, params = {}) { const m = await new Promise((r) => { const key = ++id; pending.set(key, r); ws.send(JSON.stringify({ id: key, method, params })); }); if (m.error) throw Error(m.error.message); return m.result; }
  async function ev(expression) { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
  async function wait(expression) { for (let i = 0; i < 150; i++) { try { if (await ev(expression)) return; } catch {} await new Promise((r) => setTimeout(r, 200)); } throw Error(`No apareció: ${expression}`); }
  const req = (path, body, token) => fetch('http://127.0.0.1:3101' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  try {
    const { token } = await (await req('/api/tenant/login', { email: 'el-cano@example.test', password: '123456' })).json();
    const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    const openingHours = days.map((day) => ({ day, closed: false, ranges: [{ from: '09:00', to: '13:00' }, { from: '16:00', to: '20:00' }] }));
    assert.equal((await req('/api/tenant/el-cano/location', { mapsUrl: 'https://maps.app.goo.gl/test' }, token)).status, 200);
    assert.equal((await req('/api/tenant/el-cano/hours', { openingHours, isOpen: false }, token)).status, 200);
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano' });
    await wait('document.querySelector(".business-name-heading h1")?.getBoundingClientRect().width>0 && document.querySelector(".business-open-status")?.textContent==="Cerrado ahora"');
    assert.equal(await ev('Boolean(document.querySelector(".business-name-heading .business-open-status"))'), true);
    assert.equal(await ev(`(()=>{const style=getComputedStyle(document.querySelector('.business-maps-link'));return style.color==='rgb(21, 95, 160)'&&style.textDecorationLine.includes('underline')&&style.cursor==='pointer'})()`), true);
    await ev('window.__sameBusiness=true');
    assert.equal((await req('/api/tenant/el-cano/hours', { openingHours, isOpen: true }, token)).status, 200);
    await wait('document.querySelector(".business-open-status")?.textContent==="Abierto ahora" && document.querySelector(".business-today-hours")?.textContent==="Hoy: de 09:00 a 13:00 y de 16:00 a 20:00"');
    const changed = days.map((day) => ({ day, closed: false, ranges: [{ from: '10:00', to: '18:00' }] }));
    await req('/api/tenant/el-cano/hours', { openingHours: changed, isOpen: true }, token);
    await wait('document.querySelector(".business-today-hours")?.textContent==="Hoy: de 10:00 a 18:00"');
    for (const width of [390, 360]) { await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false }); assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth'), true); }
    await req('/api/tenant/el-cano/hours', { openingHours: changed, isOpen: false }, token);
    await wait('document.querySelector(".business-open-status")?.textContent==="Cerrado ahora" && !document.querySelector(".business-today-hours")');
    await req('/api/tenant/el-cano/hours', { openingHours: days.map((day) => ({ day, closed: true, ranges: [] })), isOpen: true }, token);
    await wait('document.querySelector(".business-today-hours")?.textContent==="Horario de hoy no publicado"');
    await req('/api/tenant/el-cano/hours', { openingHours: changed, isOpen: null }, token);
    await wait('!document.querySelector(".business-status-summary")');
    assert.equal(await ev('window.__sameBusiness'), true);
    console.log('PASS: estado junto al nombre, horarios de hoy por socket, enlace azul/subrayado/pointer y móvil sin desbordes.');
  } finally { ws.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
