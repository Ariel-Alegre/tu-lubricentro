// Fixture --customers en 3101, Next en 3102 y Chrome CDP en 9449.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

(async () => {
  const tabs = await (await fetch('http://127.0.0.1:9449/json')).json();
  const ws = new WebSocket(tabs.find((tab) => tab.type === 'page' && tab.url.includes('3102')).webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let id = 0; const pending = new Map();
  ws.onmessage = (event) => { const result = JSON.parse(event.data); if (pending.has(result.id)) { pending.get(result.id)(result); pending.delete(result.id); } };
  async function call(method, params = {}) {
    const response = await new Promise((resolve) => { const key = ++id; pending.set(key, resolve); ws.send(JSON.stringify({ id: key, method, params })); });
    if (response.error) throw new Error(response.error.message); return response.result;
  }
  async function evaluate(expression) {
    const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text); return response.result.value;
  }
  async function waitFor(expression) {
    for (let i = 0; i < 100; i++) { try { if (await evaluate(expression)) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 200)); }
    throw new Error(`No apareció: ${expression}`);
  }
  async function value(selector, text, textarea = false) {
    await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${textarea ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.blur();})()`);
  }
  try {
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await evaluate(`(async()=>{const r=await fetch('/api/tenant/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'el-cano@example.test',password:'123456'})});if(!r.ok)throw new Error('Login falló')})()`);
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin' });
    await waitFor('(()=>{const item=[...document.querySelectorAll(".tenant-admin-sidebar .ant-menu-item")].find(x=>x.textContent==="Clientes");if(item)item.click();return location.pathname==="/el-cano/admin/clientes"})()');
    await waitFor('Boolean(document.querySelector(".tenant-products-title button")) && !document.querySelector(".tenant-products-title button").disabled');
    await evaluate('document.querySelector(".tenant-products-title button").click()');
    await waitFor('document.querySelector(".customer-modal #nombre")?.getBoundingClientRect().width>0');
    await value('.customer-modal #nombre', 'Ana García'); await value('.customer-modal #telefono', '1145678900');
    await value('.customer-modal #patente', 'ab123cd'); await value('.customer-modal #marca', 'Ford'); await value('.customer-modal #modelo', 'Fiesta');
    await value('.customer-modal #servicio', 'Cambio de aceite'); await value('.customer-modal #kilometraje', '120000');
    await evaluate('document.querySelector(".customer-modal #productos").focus()');
    await call('Input.insertText', { text: 'Aceite 10W-40' });
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitFor('document.querySelector(".customer-modal .ant-select-selection-item")?.textContent.includes("Aceite 10W-40")');
    await evaluate('document.querySelector(".customer-modal .ant-modal-footer .ant-btn-primary").click()');
    await waitFor('document.querySelector(".customer-summary h2")?.textContent==="Ana García" && document.querySelectorAll(".customer-visit").length===1');
    assert.equal(await evaluate('document.querySelector(".customer-visit-products").textContent.includes("Aceite 10W-40")'), true);
    // La misma patente, escrita con guiones y espacios, abre el historial existente.
    await value('#customer-search', 'ab 123-cd'); await evaluate('document.querySelector(".customers-search .ant-input-search-btn").click()');
    await waitFor('document.querySelector(".customer-summary .customer-plate")?.textContent==="AB123CD"');
    await evaluate('document.querySelector(".customer-summary button").click()');
    await waitFor('document.querySelector(".customer-modal #servicio")?.getBoundingClientRect().width>0');
    assert.equal(await evaluate('Boolean(document.querySelector(".customer-modal #nombre"))'), false, 'no pide registrar de nuevo al cliente');
    await value('.customer-modal #servicio', 'Cambio de filtros'); await value('.customer-modal #observaciones', 'Revisión general', true);
    await evaluate('document.querySelector(".customer-modal .ant-modal-footer .ant-btn-primary").click()');
    await waitFor('document.querySelectorAll(".customer-visit").length===2');
    await evaluate('window.__customerCheck="same-document"');
    const listing = await evaluate('(async()=>{const r=await fetch("/api/tenant/el-cano/customers");return r.json()})()');
    assert.equal(listing.clientes.length, 1); assert.equal(listing.vehiculos.length, 1);
    // Otra sesión modifica el historial y el panel abierto recibe el cambio por socket.
    const login = await fetch('http://127.0.0.1:3101/api/tenant/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'el-cano@example.test', password: '123456' }) }); const { token } = await login.json();
    const response = await fetch(`http://127.0.0.1:3101/api/tenant/el-cano/customers/vehicles/${listing.vehiculos[0].id}/visits`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ solicitudId: randomUUID(), fecha: '2026-11-22', servicio: 'Atención recibida por socket', productos: ['Filtro de aire'] }) }); assert.equal(response.status, 201);
    await waitFor('document.querySelectorAll(".customer-visit").length===3 && document.body.innerText.includes("Atención recibida por socket")');
    assert.equal(await evaluate('window.__customerCheck'), 'same-document');
    for (const [width, height, label] of [[1440, 1100, 'desktop'], [390, 844, 'mobile']]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await new Promise((resolve) => setTimeout(resolve, 400));
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, `sin desbordes en ${label}`);
      const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(process.env.TEMP, `lubricentro-customers-${label}.png`), Buffer.from(shot.data, 'base64'));
    }
    // Se puede elegir un cliente ya registrado al dar de alta otro vehículo.
    await evaluate('document.querySelector(".tenant-products-title button").click()');
    await waitFor('Boolean(document.querySelector(".customer-modal #clienteId"))');
    await evaluate('document.querySelector(".customer-modal #clienteId").focus()');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await waitFor('Boolean(document.querySelector(".ant-select-item-option"))');
    await evaluate('[...document.querySelectorAll(".ant-select-item-option")].find(x=>x.textContent.includes("Ana García")).click()');
    await waitFor('!document.querySelector(".customer-modal #nombre")');
    await value('.customer-modal #patente', 'ABC123'); await value('.customer-modal #servicio', 'Control de niveles');
    await evaluate('document.querySelector(".customer-modal .ant-modal-footer .ant-btn-primary").click()');
    await waitFor('document.querySelector(".customer-summary .customer-plate")?.textContent==="ABC123"');
    const counts = await evaluate('(async()=>{const r=await fetch("/api/tenant/el-cano/customers");const d=await r.json();return [d.clientes.length,d.vehiculos.length]})()'); assert.deepEqual(counts, [1, 2]);
    console.log('PASS: menú Clientes, alta inicial con producto, búsqueda por patente, atención sin repetir cliente, historial por socket y otro vehículo del mismo cliente. Escritorio/móvil sin desbordes. PostgreSQL en memoria.');
  } finally { ws.close(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
