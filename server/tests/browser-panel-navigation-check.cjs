// Fixture --customers 3101, Next 3102, Chrome CDP 9449. Solo datos locales.
const assert = require('node:assert/strict');

(async () => {
  const tabs = await (await fetch('http://127.0.0.1:9449/json')).json();
  const ws = new WebSocket(tabs.find((tab) => tab.type === 'page' && tab.url.includes('3102')).webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let id = 0; let sockets = 0; let tickets = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (m.method === 'Network.webSocketCreated') sockets++;
    if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/api/tenant/el-cano/socket')) tickets++;
    if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  async function call(method, params = {}) {
    const m = await new Promise((resolve) => { const key = ++id; pending.set(key, resolve); ws.send(JSON.stringify({ id: key, method, params })); });
    if (m.error) throw Error(m.error.message);
    return m.result;
  }
  async function ev(expression) {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async function wait(expression) {
    for (let i = 0; i < 150; i++) {
      try { if (await ev(expression)) return; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw Error(`No apareció: ${expression}`);
  }
  async function menu(label, path) {
    await ev(`[...document.querySelectorAll('.tenant-admin-sidebar [role=menuitem]')].find(x=>x.textContent.includes(${JSON.stringify(label)})).click()`);
    await wait(`location.pathname===${JSON.stringify(path)} && document.querySelector('.tenant-main')?.innerText.length>10`);
    assert.equal(await ev('document.querySelector(".tenant-admin-sidebar")===window.__sidebar'), true);
    assert.equal(await ev('window.__verificationFlashes'), 0);
    assert.equal(sockets, initialSockets);
    assert.equal(tickets, initialTickets);
  }
  let initialSockets; let initialTickets;
  try {
    await call('Network.enable');
    await call('Page.navigate', { url: 'http://localhost:3102/login/admin' });
    await wait('Boolean(document.querySelector("form"))');
    await ev(`(async()=>{const r=await fetch('/api/tenant/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'el-cano@example.test',password:'123456'})});if(!r.ok)throw Error('login')})()`);
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin' });
    await wait('document.querySelector(".tenant-admin-sidebar")?.getBoundingClientRect().width>0');
    assert.equal(await ev(`(async()=>{const html=await (await fetch('/el-cano/admin')).text();return html.includes('class="tenant-main"')&&html.includes('business-page-editor')&&html.includes('inert=')})()`), true, 'el HTML inicial incluye la página protegida y el panel sin interacción hasta conectar');
    initialSockets = sockets; initialTickets = tickets;
    await ev(`window.__sidebar=document.querySelector('.tenant-admin-sidebar');window.__verificationFlashes=0;window.__observer=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1&&(n.matches('.tenant-pending,.dashboard-loading')||n.querySelector('.tenant-pending,.dashboard-loading')))window.__verificationFlashes++});window.__observer.observe(document.body,{childList:true,subtree:true})`);
    await menu('Productos', '/el-cano/admin/productos');
    await wait('Boolean(document.querySelector(".tenant-products-title button"))');
    await menu('Clientes', '/el-cano/admin/clientes');
    await menu('Servicios', '/el-cano/admin/servicios');
    await wait('Boolean(document.querySelector(".tenant-service-heading button")) && !document.querySelector(".tenant-service-heading button").disabled');
    await ev('document.querySelector(".tenant-service-heading button").click()');
    await wait('document.querySelector(".tenant-service-modal #nombre")?.getBoundingClientRect().width>0');
    await ev(`(()=>{const input=document.querySelector('.tenant-service-modal #nombre');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Cambio de aceite');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await ev('document.querySelector(".tenant-service-modal .ant-modal-footer .ant-btn-primary").click()');
    await wait('document.querySelector(".tenant-service-list")?.innerText.includes("Cambio de aceite")');
    await wait('document.querySelector(".tenant-service-modal")?.getBoundingClientRect().width===0');
    await menu('Mi lubricentro', '/el-cano/admin');
    await menu('Productos', '/el-cano/admin/productos');
    await ev('history.back()');
    await wait('location.pathname==="/el-cano/admin"');
    assert.equal(await ev('document.querySelector(".tenant-admin-sidebar")===window.__sidebar'), true);
    assert.equal(await ev('window.__verificationFlashes'), 0);
    assert.equal(sockets, initialSockets); assert.equal(tickets, initialTickets);
    const root = await (await fetch('http://127.0.0.1:3101/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'root@example.test', password: 'root-test-password' }) })).json();
    const list = await (await fetch('http://127.0.0.1:3101/api/admin/lubricentros', { headers: { Authorization: `Bearer ${root.token}` } })).json();
    const tenant = list.find((t) => t.slug === 'el-cano');
    const response = await fetch(`http://127.0.0.1:3101/api/admin/lubricentros/${tenant.id}/estado`, { method: 'PATCH', headers: { Authorization: `Bearer ${root.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: 'Inactivo' }) });
    assert.equal(response.status, 200);
    await wait('location.pathname==="/login/admin"');
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin/clientes' });
    await wait('location.pathname==="/login/admin" && Boolean(document.querySelector("form"))');
    console.log('PASS: menú y socket persistentes, sin pantalla de verificación al navegar ni al volver atrás; desactivación y acceso directo protegidos.');
  } finally { ws.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
