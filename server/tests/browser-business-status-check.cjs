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
    const openingHours = days.map((day) => ({ day, closed: day !== 'lunes', ranges: day === 'lunes' ? [{ from: '09:00', to: '13:00' }, { from: '16:00', to: '18:00' }] : [] }));
    assert.equal((await req('/api/tenant/el-cano/location', { mapsUrl: 'https://maps.app.goo.gl/test' }, token)).status, 200);
    assert.equal((await req('/api/tenant/el-cano/hours', { openingHours, isOpen: true }, token)).status, 200);
    await call('Page.enable');
    await call('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{
      const NativeDate=Date; let base=NativeDate.parse('2026-11-23T11:00:00Z'); let start=NativeDate.now();
      window.__setClock=(iso)=>{base=NativeDate.parse(iso);start=NativeDate.now()};
      window.Date=class extends NativeDate {constructor(...args){if(args.length)super(...args);else super(base+NativeDate.now()-start)}static now(){return base+NativeDate.now()-start}};
    })()` });
    async function clock(iso) { await ev(`window.__setClock(${JSON.stringify(iso)});window.dispatchEvent(new Event('focus'))`); }
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano' });
    await wait('typeof window.__setClock==="function"');
    await wait('document.querySelector(".business-name-heading h1")?.getBoundingClientRect().width>0 && document.querySelector(".business-open-status")?.textContent==="Cerrado ahora"');
    assert.equal(await ev('Boolean(document.querySelector(".business-name-heading .business-open-status"))'), true);
    assert.equal(await ev(`(()=>{const style=getComputedStyle(document.querySelector('.business-maps-link'));return style.color==='rgb(21, 95, 160)'&&style.textDecorationLine.includes('underline')&&style.cursor==='pointer'})()`), true);
    await ev('window.__sameBusiness=true');
    await clock('2026-11-23T12:00:00Z');
    await wait('document.querySelector(".business-open-status")?.textContent==="Abierto ahora" && document.querySelector(".business-today-hours")?.textContent==="Hoy: de 09:00 a 13:00 y de 16:00 a 18:00"');
    await clock('2026-11-23T16:00:00Z');
    await wait('document.querySelector(".business-open-status")?.textContent==="Cerrado ahora"');
    await clock('2026-11-23T19:00:00Z');
    await wait('document.querySelector(".business-open-status")?.textContent==="Abierto ahora"');
    // Cruzar las 18:00 sin eventos ni escrituras: debe cerrar por su propio temporizador.
    await clock('2026-11-23T20:59:55.500Z');
    await wait('document.querySelector(".business-open-status")?.textContent==="Abierto ahora"');
    await wait('document.querySelector(".business-open-status")?.textContent==="Cerrado ahora"');
    await clock('2026-11-23T13:00:00Z');
    await wait('document.querySelector(".business-open-status")?.textContent==="Abierto ahora"');
    const changed = days.map((day) => ({ day, closed: day !== 'lunes', ranges: day === 'lunes' ? [{ from: '11:00', to: '18:00' }] : [] }));
    await req('/api/tenant/el-cano/hours', { openingHours: changed }, token);
    await wait('document.querySelector(".business-open-status")?.textContent==="Cerrado ahora"');
    await clock('2026-11-23T14:00:00Z');
    await wait('document.querySelector(".business-today-hours")?.textContent==="Hoy: de 11:00 a 18:00"');
    for (const width of [390, 360]) { await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false }); assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth'), true); }
    await clock('2026-11-24T14:00:00Z');
    await wait('document.querySelector(".business-open-status")?.textContent==="Cerrado ahora" && !document.querySelector(".business-today-hours")');
    await req('/api/tenant/el-cano/hours', { openingHours: days.map((day) => ({ day, closed: true, ranges: [] })), isOpen: true }, token);
    await clock('2026-11-23T14:00:00Z');
    await wait('document.querySelector(".business-open-status")?.textContent==="Cerrado ahora"');
    assert.equal(await ev('window.__sameBusiness'), true);
    console.log('PASS: apertura, pausa, reapertura, cierre automático a las 18 sin recargar, días cerrados, hora Argentina aunque el navegador use Tokio, cambios por socket y móvil.');
  } finally { ws.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
