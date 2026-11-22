// Fixture local en 3101, Next en 3102 y Chrome CDP en 9449.
const assert = require('node:assert/strict');
(async () => {
  const tabs = await (await fetch('http://127.0.0.1:9449/json')).json();
  const ws = new WebSocket(tabs.find((t) => t.type === 'page' && t.url.includes('3102')).webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  async function call(method, params = {}) { const m = await new Promise((resolve) => { const key = ++id; pending.set(key, resolve); ws.send(JSON.stringify({ id: key, method, params })); }); if (m.error) throw Error(m.error.message); return m.result; }
  async function ev(expression) { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
  async function wait(expression) { for (let i = 0; i < 120; i++) { try { if (await ev(expression)) return; } catch {} await new Promise((r) => setTimeout(r, 200)); } throw Error(`No apareció: ${expression}`); }
  async function value(name, value) { await ev(`(()=>{const input=document.querySelector('.tenant-password-modal #${name}');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`); }
  const submit = () => ev('document.querySelector(".tenant-password-modal .ant-modal-footer .ant-btn-primary").click()');
  try {
    await ev(`(async()=>{const r=await fetch('/api/tenant/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'el-cano@example.test',password:'123456'})});if(!r.ok)throw Error('login')})()`);
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin/productos' });
    await wait('document.querySelector(".tenant-admin-sidebar")?.getBoundingClientRect().width>0');
    await ev('[...document.querySelectorAll(".tenant-admin-sidebar .ant-menu-submenu-title")].find(x=>x.textContent.includes("Configuración")).click()');
    await wait('[...document.querySelectorAll(".tenant-admin-sidebar .ant-menu-item")].some(x=>x.textContent.includes("Cambiar contraseña")&&x.getBoundingClientRect().height>0)');
    await ev('[...document.querySelectorAll(".tenant-admin-sidebar .ant-menu-item")].find(x=>x.textContent.includes("Cambiar contraseña")).click()');
    await wait('document.querySelector(".tenant-password-modal #currentPassword")?.getBoundingClientRect().width>0');
    await value('currentPassword', 'incorrecta'); await value('newPassword', '654321'); await value('confirmPassword', '654321'); await submit();
    await wait('document.querySelector(".tenant-password-modal")?.innerText.includes("La contraseña actual es incorrecta")');
    assert.equal(await ev('location.pathname'), '/el-cano/admin/productos');
    await value('currentPassword', '123456'); await value('newPassword', '12345'); await value('confirmPassword', '12345'); await submit();
    await wait('document.querySelector(".tenant-password-modal")?.innerText.includes("Usá entre 6 y 128 caracteres")');
    await value('newPassword', '654321'); await value('confirmPassword', '123456'); await submit();
    await wait('document.querySelector(".tenant-password-modal")?.innerText.includes("Las contraseñas no coinciden")');
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth'), true);
    await value('confirmPassword', '654321'); await submit();
    await wait('location.pathname==="/login/admin" && location.search.includes("password-changed") && document.body.innerText.includes("La contraseña fue actualizada")');
    assert.equal(await ev(`(async()=>{const r=await fetch('/api/tenant/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'el-cano@example.test',password:'123456'})});return r.status})()`), 401);
    assert.equal(await ev(`(async()=>{const r=await fetch('/api/tenant/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'el-cano@example.test',password:'654321'})});return r.status})()`), 200);
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin/productos' });
    await wait('Boolean(document.querySelector(".tenant-shell:not([hidden])"))');
    const cookies = await call('Network.getCookies');
    assert.equal(cookies.cookies.find((c) => c.name === 'lubricentro_session_el-cano').httpOnly, true);
    console.log('PASS: cambiar contraseña desde el menú, errores sin perder sesión, mínimo 6, confirmación, móvil, cierre y nuevo login.');
  } finally { ws.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
