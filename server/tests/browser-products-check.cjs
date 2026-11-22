// Backend de prueba en 3101, Next contra él en 3102 y Chrome CDP en 9449.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const tabs = await (await fetch('http://127.0.0.1:9449/json')).json();
  const ws = new WebSocket(tabs.find((tab) => tab.type === 'page' && tab.url.includes('3102')).webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let id = 0; const pending = new Map();
  ws.onmessage = (event) => { const message = JSON.parse(event.data); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } };
  async function call(method, params = {}) {
    const result = await new Promise((resolve) => { const key = ++id; pending.set(key, resolve); ws.send(JSON.stringify({ id: key, method, params })); });
    if (result.error) throw new Error(result.error.message);
    return result.result;
  }
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let count = 0; count < 80; count++) { try { if (await evaluate(expression)) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 200)); }
    throw new Error(`No apareció ${expression}`);
  }
  async function setValue(selector, value, textarea = false) {
    await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${textarea ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.blur();})()`);
  }
  try {
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await evaluate(`(async()=>{const response=await fetch('/api/tenant/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'el-cano@example.test',password:'123456'})});if(!response.ok)throw new Error('Login de prueba fallido');})()`);
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin' });
    await waitFor('(()=>{const item=[...document.querySelectorAll(".tenant-admin-sidebar .ant-menu-item")].find(x=>x.textContent.trim()==="Productos");if(item)item.click();return location.pathname==="/el-cano/admin/productos"})()');
    await waitFor('Boolean(document.querySelector(".tenant-products-title button")) && !document.querySelector(".tenant-products-title button").disabled');
    await evaluate('document.querySelector(".tenant-products-title button").click()');
    await waitFor('document.querySelector(".tenant-product-modal #nombre")?.getBoundingClientRect().width>0');
    await setValue('.tenant-product-modal #nombre', 'Aceite 10W-40');
    const { root } = await call('DOM.getDocument');
    const { nodeId } = await call('DOM.querySelector', { nodeId: root.nodeId, selector: '.tenant-product-modal input[type=file]' });
    await call('DOM.setFileInputFiles', { nodeId, files: [path.resolve(__dirname, '../../client/public/tu-lubricentro-logo.png')] });
    await waitFor('Boolean(document.querySelector(".tenant-product-modal img")?.src.startsWith("data:"))');
    await setValue('.tenant-product-modal textarea', 'Envase de 4 litros', true);
    await setValue('.tenant-product-modal .ant-input-number-input', '18500.50');
    await evaluate('document.querySelector(".tenant-product-modal .ant-modal-footer .ant-btn-primary").click()');
    await waitFor('document.querySelector(".tenant-products-table .tenant-product-name strong")?.textContent==="Aceite 10W-40"');
    await waitFor('Boolean(document.querySelector(".tenant-products-table .product-photo img")?.naturalWidth)');
    await evaluate('document.querySelector(".tenant-products-table .tenant-product-actions button").click()');
    await waitFor('document.querySelector(".tenant-product-modal #nombre")?.getBoundingClientRect().width>0');
    await setValue('.tenant-product-modal #nombre', 'Aceite sintético');
    await evaluate('document.querySelector(".tenant-product-modal .ant-modal-footer .ant-btn-primary").click()');
    await waitFor('document.querySelector(".tenant-products-table .tenant-product-name strong")?.textContent==="Aceite sintético"');
    await setValue('.tenant-products-toolbar input', 'inexistente');
    await waitFor('document.body.innerText.includes("No encontramos productos con esa búsqueda")');
    await setValue('.tenant-products-toolbar input', '');
    for (const [width, height, name] of [[1440, 1100, 'desktop'], [390, 844, 'mobile']]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await new Promise((resolve) => setTimeout(resolve, 400));
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(process.env.TEMP, `lubricentro-products-${name}.png`), Buffer.from(shot.data, 'base64'));
    }
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano' });
    await waitFor('(()=>{const tab=[...document.querySelectorAll("[role=tab]")].find(x=>x.textContent==="Productos");if(tab?.getAttribute("aria-selected")==="false")tab.click();return document.querySelector(".business-product h3")?.textContent==="Aceite sintético"})()');
    await waitFor('Boolean(document.querySelector(".business-product .product-photo img")?.naturalWidth)');
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin/productos' });
    await waitFor('Boolean(document.querySelector(".tenant-products-mobile button[aria-label^=Eliminar]"))');
    await evaluate('document.querySelector(".tenant-products-mobile button[aria-label^=Eliminar]").click()');
    await waitFor('Boolean(document.querySelector(".ant-popconfirm-buttons .ant-btn-primary"))');
    await evaluate('document.querySelector(".ant-popconfirm-buttons .ant-btn-primary").click()');
    await waitFor('document.body.innerText.includes("Todavía no agregaste productos")');
    console.log('PASS: menú redirige a productos, alta, edición, búsqueda, catálogo público y eliminación. Escritorio/móvil sin desbordes. Almacenamiento simulado.');
  } finally { ws.close(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
