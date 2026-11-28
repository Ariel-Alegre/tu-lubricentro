// Fixture local 3101, Next 3102, Chrome CDP 9449 sin suspensión de pestañas en segundo plano.
const assert = require('node:assert/strict');
(async () => {
  const clients = [];
  const tabs = () => fetch('http://127.0.0.1:9449/json').then((r) => r.json());
  async function browser(tab) {
    const ws = new WebSocket(tab.webSocketDebuggerUrl); clients.push(ws); await new Promise((r) => { ws.onopen = r; });
    let id = 0; const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    async function call(method, params = {}) { const m = await new Promise((r) => { const key = ++id; pending.set(key, r); ws.send(JSON.stringify({ id: key, method, params })); }); if (m.error) throw Error(m.error.message); return m.result; }
    async function ev(expression) { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
    async function wait(expression) { for (let i = 0; i < 150; i++) { try { if (await ev(expression)) return; } catch {} await new Promise((r) => setTimeout(r, 200)); } throw Error(`No apareció: ${expression}`); }
    return { call, ev, wait };
  }
  const admin = await browser((await tabs()).find((t) => t.type === 'page' && t.url.includes('3102')));
  async function value(selector, text) { await admin.ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`); }
  async function information(client) { await client.wait(`(()=>{const tab=[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent==='Información');if(tab?.getAttribute('aria-selected')==='false')tab.click();return tab?.getAttribute('aria-selected')==='true'})()`); }
  const save = () => admin.ev('document.querySelector(".tenant-hours-settings button[type=submit]").click()');
  try {
    await admin.call('Page.navigate', { url: 'http://localhost:3102/login/admin' }); await admin.wait('Boolean(document.querySelector("form"))');
    await admin.ev(`(async()=>{const r=await fetch('/api/tenant/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'el-cano@example.test',password:'123456'})});if(!r.ok)throw Error('login')})()`);
    await admin.call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin/mi-lubricentro' });
    await admin.wait('Boolean(document.querySelector(".tenant-shell:not([hidden])"))'); await information(admin);
    await admin.wait('document.querySelectorAll(".tenant-hours-day").length===7');
    const { targetId } = await admin.call('Target.createTarget', { url: 'http://localhost:3102/el-cano' });
    const profile = await browser((await tabs()).find((t) => t.id === targetId));
    await profile.wait('document.querySelector(".business-name h1")?.getBoundingClientRect().width>0'); await information(profile);
    assert.equal(await profile.ev('Boolean(document.querySelector(".business-open-status"))'), false);
    await profile.ev('window.__sameProfile=true');
    await admin.ev('document.querySelector("[data-day=lunes] input[type=checkbox]").click()');
    await admin.wait('document.querySelectorAll("[data-day=lunes] input[type=time]").length===2');
    await value('[aria-label="Lunes: apertura 1"]', '09:00'); await value('[aria-label="Lunes: cierre 1"]', '13:00');
    await admin.ev('[...document.querySelectorAll("[data-day=lunes] button")].find(x=>x.textContent.includes("Agregar horario")).click()');
    await admin.wait('document.querySelectorAll("[data-day=lunes] input[type=time]").length===4');
    await value('[aria-label="Lunes: apertura 2"]', '16:00'); await value('[aria-label="Lunes: cierre 2"]', '20:00');
    assert.equal(await admin.ev('document.querySelectorAll(".tenant-hours-settings input[type=radio]").length'), 0);
    await save();
    await admin.wait('document.querySelector(".tenant-hours-settings")?.innerText.includes("Horarios actualizados")');
    await profile.wait('Boolean(document.querySelector(".business-open-status")) && document.querySelector(".business-opening-hours")?.innerText.includes("16:00 – 20:00")');
    assert.equal(await profile.ev('document.querySelectorAll(".business-opening-hours dl > div").length'), 7);
    await value('[aria-label="Lunes: apertura 1"]', '18:00'); await save();
    await admin.wait('document.querySelector(".tenant-hours-settings")?.innerText.includes("La hora de cierre debe ser posterior")');
    assert.equal(await profile.ev('document.querySelector(".business-opening-hours").innerText.includes("09:00 – 13:00")'), true);
    await value('[aria-label="Lunes: apertura 1"]', '09:00');
    await save();
    await admin.call('Page.bringToFront'); await admin.call('Page.reload'); await admin.wait('Boolean(document.querySelector(".tenant-shell:not([hidden])"))'); await information(admin);
    await admin.wait('document.querySelectorAll("[data-day=lunes] input[type=time]").length===4');
    assert.equal(await admin.ev('document.querySelectorAll("[data-day=lunes] input[type=time]")[2].value'), '16:00');
    assert.equal(await admin.ev('document.querySelectorAll(".tenant-hours-settings input[type=radio]").length'), 0);
    for (const client of [admin, profile]) { await client.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }); assert.equal(await client.ev('document.documentElement.scrollWidth<=innerWidth'), true); }
    assert.equal(await profile.ev('window.__sameProfile'), true);
    console.log('PASS: Información permite días y turnos, sin estado manual; validación, persistencia, socket y móvil sin desbordes.');
  } finally { clients.forEach((ws) => ws.close()); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
