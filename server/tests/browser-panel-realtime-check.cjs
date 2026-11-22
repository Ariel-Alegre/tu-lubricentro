// Fixture --customers 3101, Next 3102, Chrome CDP 9449. Datos y bucket de prueba.
const assert = require('node:assert/strict');
const sharp = require('sharp');

(async () => {
  const tabs = await (await fetch('http://127.0.0.1:9449/json')).json();
  const ws = new WebSocket(tabs.find((tab) => tab.type === 'page' && tab.url.includes('3102')).webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let id = 0; const pending = new Map();
  ws.onmessage = (event) => { const m = JSON.parse(event.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  async function call(method, params = {}) { const m = await new Promise((resolve) => { const key = ++id; pending.set(key, resolve); ws.send(JSON.stringify({ id: key, method, params })); }); if (m.error) throw new Error(m.error.message); return m.result; }
  async function ev(expression) { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
  async function wait(expression) { for (let i = 0; i < 100; i++) { try { if (await ev(expression)) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 200)); } throw new Error(`No apareció: ${expression}`); }
  async function value(selector, text) { await ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`); }
  const base = 'http://127.0.0.1:3101';
  const req = (url, method = 'GET', body, token) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  try {
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    const root = await (await req('/api/admin/login', 'POST', { email: 'root@example.test', password: 'root-test-password' })).json();
    const tenant = await (await req('/api/tenant/login', 'POST', { email: 'el-cano@example.test', password: '123456' })).json();
    await call('Page.navigate', { url: 'http://localhost:3102/login' }); await wait('Boolean(document.querySelector("form"))');
    await ev(`(async()=>{const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'root@example.test',password:'root-test-password'})});if(!r.ok)throw Error('login root')})()`);
    await call('Page.navigate', { url: 'http://localhost:3102/' }); await wait('document.querySelectorAll(".desktopTable .ant-table-row").length===2');
    await ev('window.__rootLive="same-document"');
    const data = { nombre: 'Negocio en vivo', slug: 'negocio-en-vivo', email: 'negocio@example.test', telefono: '1144445555', direccion: 'Calle 123', ciudad: 'Buenos Aires', provincia: 'Buenos Aires', responsable: 'Responsable', password: '123456' };
    let response = await req('/api/admin/lubricentros', 'POST', data, root.token); assert.equal(response.status, 201); const business = await response.json();
    await wait('document.querySelector(".desktopTable")?.innerText.includes("Negocio en vivo")');
    await ev('[...document.querySelectorAll(".desktopTable button[aria-label]")].find(x=>x.getAttribute("aria-label")==="Editar Lubricentro El Cano").click()'); await wait('document.querySelector(".ant-drawer #nombre")?.getBoundingClientRect().width>0');
    await value('.ant-drawer #nombre', 'Borrador root sin guardar');
    await req(`/api/admin/lubricentros/${business.id}`, 'PUT', { ...data, nombre: 'Negocio editado en vivo' }, root.token);
    await wait('document.querySelector(".desktopTable")?.innerText.includes("Negocio editado en vivo")'); assert.equal(await ev('document.querySelector(".ant-drawer #nombre").value'), 'Borrador root sin guardar');
    await req(`/api/admin/lubricentros/${business.id}/estado`, 'PATCH', { estado: 'Inactivo' }, root.token);
    await wait('[...document.querySelectorAll(".desktopTable .ant-table-row")].some(x=>x.innerText.includes("Negocio editado en vivo")&&x.innerText.includes("Inactivo"))'); assert.equal(await ev('window.__rootLive'), 'same-document');
    await call('Page.navigate', { url: 'http://localhost:3102/login/admin' }); await wait('Boolean(document.querySelector("form"))');
    await ev(`(async()=>{const r=await fetch('/api/tenant/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'el-cano@example.test',password:'123456'})});if(!r.ok)throw Error('login tenant')})()`);
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin/productos' }); await wait('Boolean(document.querySelector(".tenant-products-title button"))&&!document.querySelector(".tenant-products-title button").disabled');
    await ev('window.__catalogLive="same-document";document.querySelector(".tenant-products-title button").click()'); await wait('document.querySelector(".tenant-product-modal #nombre")?.getBoundingClientRect().width>0'); await value('.tenant-product-modal #nombre', 'Borrador producto');
    const products = '/api/tenant/el-cano/products'; response = await req(products, 'POST', { nombre: 'Producto remoto', precio: '200' }, tenant.token); assert.equal(response.status, 201); const product = await response.json();
    await wait('document.querySelector(".tenant-products-table")?.innerText.includes("Producto remoto")'); assert.equal(await ev('document.querySelector(".tenant-product-modal #nombre").value'), 'Borrador producto');
    await req(`${products}/${product.id}`, 'PUT', { nombre: 'Producto actualizado', precio: '350' }, tenant.token); await wait('document.querySelector(".tenant-products-table")?.innerText.includes("Producto actualizado")');
    const png = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#155fa0' } }).png().toBuffer();
    async function photo(url) { const body = new FormData(); body.append('image', new Blob([png], { type: 'image/png' }), 'foto.png'); const r = await fetch(base + url, { method: 'POST', headers: { Authorization: `Bearer ${tenant.token}` }, body }); assert.equal(r.status, 200); }
    await photo(`${products}/${product.id}/image`); await wait('Boolean(document.querySelector(".tenant-products-table .product-photo img")?.naturalWidth)'); const oldImage = await ev('document.querySelector(".tenant-products-table .product-photo img").src');
    await photo(`${products}/${product.id}/image`); await wait(`document.querySelector(".tenant-products-table .product-photo img")?.src!==${JSON.stringify(oldImage)}`);
    await req(`${products}/${product.id}`, 'DELETE', undefined, tenant.token); await wait('!document.querySelector(".tenant-products-table .tenant-product-name")'); assert.equal(await ev('document.querySelector(".tenant-product-modal #nombre").value'), 'Borrador producto'); assert.equal(await ev('window.__catalogLive'), 'same-document');
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin' });
    await wait('(()=>{const tab=[...document.querySelectorAll("[role=tab]")].find(x=>x.textContent==="Servicios");if(tab?.getAttribute("aria-selected")==="false")tab.click();return Boolean(document.querySelector(".tenant-service-heading button"))&&!document.querySelector(".tenant-service-heading button").disabled})()');
    await ev('window.__profileLive="same-document";document.querySelector(".tenant-service-heading button").click()'); await wait('document.querySelector(".tenant-service-modal #nombre")?.getBoundingClientRect().width>0'); await value('.tenant-service-modal #nombre', 'Borrador servicio');
    const services = '/api/tenant/el-cano/services'; response = await req(services, 'POST', { nombre: 'Servicio remoto' }, tenant.token); assert.equal(response.status, 201); const service = await response.json();
    await wait('document.querySelector(".tenant-service-list")?.innerText.includes("Servicio remoto")');
    await req(`${services}/${service.id}`, 'PUT', { nombre: 'Servicio actualizado' }, tenant.token); await wait('document.querySelector(".tenant-service-list")?.innerText.includes("Servicio actualizado")');
    await req(`${services}/${service.id}`, 'DELETE', undefined, tenant.token); await wait('!document.querySelector(".tenant-service-list")'); assert.equal(await ev('document.querySelector(".tenant-service-modal #nombre").value'), 'Borrador servicio');
    await ev('document.querySelector(".tenant-service-modal .ant-modal-close").click()');
    await photo('/api/tenant/el-cano/images/cover'); await wait('document.querySelector(".business-cover img")?.src.includes("/api/public/lubricentros/")&&Boolean(document.querySelector(".business-cover img")?.naturalWidth)');
    const oldCover = await ev('document.querySelector(".business-cover img").src'); await photo('/api/tenant/el-cano/images/cover'); await wait(`document.querySelector(".business-cover img")?.src!==${JSON.stringify(oldCover)}`);
    assert.equal(await ev('window.__profileLive'), 'same-document');
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin/clientes' }); await wait('Boolean(document.querySelector(".tenant-products-title button"))&&!document.querySelector(".tenant-products-title button").disabled');
    await ev('document.querySelector(".tenant-products-title button").click()'); await wait('document.querySelector(".customer-modal #nombre")?.getBoundingClientRect().width>0'); await value('.customer-modal #nombre', 'Borrador cliente');
    await req(services, 'POST', { nombre: 'Servicio nuevo para atención' }, tenant.token);
    await ev('document.querySelector(".customer-modal #servicio").focus()'); await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await wait('[...document.querySelectorAll(".ant-select-item-option")].some(x=>x.textContent.includes("Servicio nuevo para atención"))'); assert.equal(await ev('document.querySelector(".customer-modal #nombre").value'), 'Borrador cliente');
    console.log('PASS: panel raíz, productos, precios/fotos, servicios, portada y opciones de atención cambian por socket sin recargar ni borrar borradores. Sesión de escritura separada.');
  } finally { ws.close(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
