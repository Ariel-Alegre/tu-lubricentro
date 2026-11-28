// Fixture local 3101, Next 3102, Chrome CDP 9449 con pestañas en segundo plano habilitadas.
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
  const root = await browser((await tabs()).find((t) => t.type === 'page' && t.url.includes('3102')));
  async function open(path) { const { targetId } = await root.call('Target.createTarget', { url: 'http://localhost:3102' + path }); return browser((await tabs()).find((t) => t.id === targetId)); }
  try {
    await root.call('Page.navigate', { url: 'http://localhost:3102/login' }); await root.wait('Boolean(document.querySelector("form"))');
    await root.ev(`(async()=>{const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'root@example.test',password:'root-test-password'})});if(!r.ok)throw Error('root login')})()`);
    await root.call('Page.navigate', { url: 'http://localhost:3102/' }); await root.wait('document.querySelectorAll(".desktopTable .ant-table-row").length===2');
    await root.ev('[...document.querySelectorAll("button")].find(x=>x.textContent.includes("Nuevo lubricentro")).click()');
    await root.wait('document.querySelector(".ant-drawer #nombre")?.getBoundingClientRect().width>0');
    assert.equal(await root.ev('Boolean(document.querySelector(".ant-drawer #direccion,.ant-drawer #ciudad,.ant-drawer #provincia"))'), false);
    await root.ev('document.querySelector(".ant-drawer-close").click()');
    const profile = await open('/el-cano'); await profile.wait('document.querySelector(".business-name h1")?.getBoundingClientRect().width>0');
    assert.equal(await profile.ev('Boolean(document.querySelector(".business-visit"))'), false); await profile.ev('window.__sameProfile=true');
    const admin = await open('/login/admin'); await admin.wait('Boolean(document.querySelector("form"))');
    await admin.ev(`(async()=>{const r=await fetch('/api/tenant/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'el-cano@example.test',password:'123456'})});if(!r.ok)throw Error('tenant login')})()`);
    await admin.call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin/mi-lubricentro' });
    await admin.wait('document.querySelector(".tenant-shell:not([hidden]) .tenant-location-settings input")?.getBoundingClientRect().width>0');
    async function save(url) {
      await admin.ev(`(()=>{const el=document.querySelector('.tenant-location-settings #mapsUrl');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(url)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await admin.ev('document.querySelector(".tenant-location-settings button[type=submit]").click()');
    }
    await save('https://evil.example/maps'); await admin.wait('document.querySelector(".tenant-location-settings")?.innerText.includes("Pegá el enlace HTTPS")');
    const first = 'https://maps.app.goo.gl/test';
    await save(first); await admin.wait('document.querySelector(".tenant-location-settings")?.innerText.includes("Ubicación actualizada")');
    await profile.wait(`document.querySelector('.business-visit a')?.href===${JSON.stringify(first)}`);
    await root.wait(`[...document.querySelectorAll('.desktopTable a')].some(link=>link.href===${JSON.stringify(first)})`);
    const second = 'https://www.google.com/maps/place/Test'; await save(second);
    await profile.wait(`document.querySelector('.business-visit a')?.href===${JSON.stringify(second)}`);
    await admin.call('Page.reload'); await admin.wait('Boolean(document.querySelector(".tenant-shell:not([hidden]) .tenant-location-settings input"))');
    assert.equal(await admin.ev('document.querySelector(".tenant-location-settings #mapsUrl").value'), second);
    for (const client of [admin, profile]) {
      await client.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
      assert.equal(await client.ev('document.documentElement.scrollWidth<=innerWidth'), true);
    }
    await save(''); await profile.wait('!document.querySelector(".business-visit")');
    assert.equal(await profile.ev('window.__sameProfile'), true);
    console.log('PASS: root sin dirección, ubicación editable en comercio, validación y persistencia; perfil/root sincronizados y móvil sin desbordes.');
  } finally { clients.forEach((ws) => ws.close()); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
