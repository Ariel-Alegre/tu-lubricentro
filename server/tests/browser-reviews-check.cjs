// Backend aislado --customers 3101, Next 3102, Chrome CDP 9449.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

(async () => {
  const clients = [];
  async function browser(tab) {
    const ws = new WebSocket(tab.webSocketDebuggerUrl); clients.push(ws);
    await new Promise((resolve) => { ws.onopen = resolve; });
    let id = 0; const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    async function call(method, params = {}) { const m = await new Promise((resolve) => { const key = ++id; pending.set(key, resolve); ws.send(JSON.stringify({ id: key, method, params })); }); if (m.error) throw Error(m.error.message); return m.result; }
    async function ev(expression) { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
    async function wait(expression) { for (let i = 0; i < 150; i++) { try { if (await ev(expression)) return; } catch {} await new Promise((r) => setTimeout(r, 200)); } throw Error(`No apareció: ${expression}`); }
    return { call, ev, wait };
  }
  const tabs = () => fetch('http://127.0.0.1:9449/json').then((r) => r.json());
  const admin = await browser((await tabs()).find((t) => t.type === 'page' && t.url.includes('3102')));
  async function open(path) { const { targetId } = await admin.call('Target.createTarget', { url: `http://localhost:3102${path}` }); return browser((await tabs()).find((t) => t.id === targetId)); }
  const req = (path, body, token) => fetch('http://127.0.0.1:3101' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  async function value(text) { await admin.ev(`(()=>{const el=document.querySelector('.tenant-reviews-settings #reviewsUrl');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`); }
  try {
    const tenant = await (await req('/api/tenant/login', { email: 'el-cano@example.test', password: '123456' })).json();
    assert.equal((await req('/api/tenant/el-cano/customers', { solicitudId: randomUUID(), nombre: 'Cliente reseñas', telefono: '', patente: 'AB123CD', marca: 'Ford', modelo: 'Fiesta', fecha: '2026-11-28', servicio: 'Cambio de aceite', productos: [], kilometraje: 1000, observaciones: '', monto: '100', metodoPago: null }, tenant.token)).status, 201);
    const profile = await open('/el-cano');
    await profile.wait('document.querySelector(".business-name h1")?.getBoundingClientRect().width>0');
    const history = await open('/el-cano/AB123CD');
    await history.wait('document.querySelector(".shared-history-hero")?.getBoundingClientRect().width>0');
    assert.equal(await profile.ev('Boolean(document.querySelector(".google-reviews-card"))'), false);
    assert.equal(await history.ev('Boolean(document.querySelector(".google-reviews-card"))'), false);
    await profile.ev('window.__sameProfile=true'); await history.ev('window.__sameHistory=true');
    await admin.call('Page.bringToFront');
    await admin.call('Page.navigate', { url: 'http://localhost:3102/login/admin' });
    await admin.wait('Boolean(document.querySelector("form"))');
    await admin.ev(`(async()=>{const r=await fetch('/api/tenant/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'el-cano@example.test',password:'123456'})});if(!r.ok)throw Error('login')})()`);
    await admin.call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin/mi-lubricentro' });
    await admin.wait('Boolean(document.querySelector(".tenant-shell:not([hidden]) .tenant-reviews-settings input"))');
    await value('https://evil.example/reviews'); await admin.ev('document.querySelector(".tenant-reviews-settings button[type=submit]").click()');
    await admin.wait('document.querySelector(".tenant-reviews-settings")?.innerText.includes("Usá un enlace HTTPS")');
    const url = 'https://g.page/r/test/review';
    await value(url); await admin.ev('document.querySelector(".tenant-reviews-settings button[type=submit]").click()');
    await admin.wait('document.querySelector(".tenant-reviews-settings")?.innerText.includes("Enlace actualizado")');
    await profile.wait(`document.querySelector('.google-reviews-card a')?.href===${JSON.stringify(url)}`);
    await history.wait(`document.querySelector('.google-reviews-card a')?.href===${JSON.stringify(url)}`);
    assert.equal(await history.ev('document.querySelector(".google-reviews-card a").target'), '_blank');
    const url2 = 'https://search.google.com/local/writereview?placeid=test';
    assert.equal((await req('/api/tenant/el-cano/reviews', { reviewsUrl: url2 }, tenant.token)).status, 200);
    await profile.wait(`document.querySelector('.google-reviews-card a')?.href===${JSON.stringify(url2)}`);
    await history.wait(`document.querySelector('.google-reviews-card a')?.href===${JSON.stringify(url2)}`);
    await admin.wait(`document.querySelector('.tenant-reviews-settings #reviewsUrl')?.value===${JSON.stringify(url2)}`);
    for (const client of [admin, profile, history]) {
      await client.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
      assert.equal(await client.ev('document.documentElement.scrollWidth<=innerWidth'), true);
    }
    await value(''); await admin.ev('document.querySelector(".tenant-reviews-settings button[type=submit]").click()');
    await profile.wait('!document.querySelector(".google-reviews-card")');
    await history.wait('!document.querySelector(".google-reviews-card")');
    assert.equal(await profile.ev('window.__sameProfile'), true); assert.equal(await history.ev('window.__sameHistory'), true);
    await admin.call('Page.reload');
    await admin.wait('Boolean(document.querySelector(".tenant-shell:not([hidden]) .tenant-reviews-settings input"))');
    assert.equal(await admin.ev('document.querySelector(".tenant-reviews-settings #reviewsUrl").value'), '');
    console.log('PASS: guardar, validar, actualizar y quitar reseñas; perfil e historial cambian por socket sin recargar; móvil sin desbordes.');
  } finally { clients.forEach((ws) => ws.close()); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
