// Backend de prueba 3101, Next 3102 y Chrome CDP 9449.
const assert = require('node:assert/strict');
const sharp = require('sharp');

(async () => {
  const tabs = await (await fetch('http://127.0.0.1:9449/json')).json();
  const ws = new WebSocket(tabs.find((tab) => tab.type === 'page' && tab.url.includes('3102')).webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let id = 0; const pending = new Map();
  ws.onmessage = (event) => { const message = JSON.parse(event.data); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } };
  async function call(method, params = {}) {
    const result = await new Promise((resolve) => { const key = ++id; pending.set(key, resolve); ws.send(JSON.stringify({ id: key, method, params })); });
    if (result.error) throw new Error(result.error.message); return result.result;
  }
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let i = 0; i < 100; i++) { try { if (await evaluate(expression)) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 200)); }
    throw new Error(`No apareció ${expression}`);
  }
  const base = 'http://127.0.0.1:3101';
  const req = (route, method = 'GET', body, token) => fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const { token } = await (await req('/api/tenant/login', 'POST', { email: 'el-cano@example.test', password: '123456' })).json();
  try {
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano' });
    await waitFor('document.querySelector("h1")?.textContent==="Lubricentro El Cano"');
    await waitFor('(()=>{const t=[...document.querySelectorAll("[role=tab]")].find(x=>x.textContent==="Productos");if(t?.getAttribute("aria-selected")==="false")t.click();return t?.getAttribute("aria-selected")==="true"})()');
    await evaluate('window.__realtimeCheck = "same-document"');
    const products = '/api/tenant/el-cano/products';
    const product = await (await req(products, 'POST', { nombre: 'Producto en vivo', precio: '100' }, token)).json();
    await waitFor('document.querySelector(".business-product h3")?.textContent==="Producto en vivo"');
    await req(`${products}/${product.id}`, 'PUT', { nombre: 'Producto editado', precio: '200' }, token);
    await waitFor('document.querySelector(".business-product h3")?.textContent==="Producto editado"');
    async function photo(route, color) {
      const bytes = await sharp({ create: { width: 80, height: 80, channels: 3, background: color } }).png().toBuffer();
      const body = new FormData(); body.append('image', new Blob([bytes], { type: 'image/png' }), 'foto.png');
      const response = await fetch(base + route, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body }); assert.equal(response.status, 200);
    }
    await photo(`${products}/${product.id}/image`, '#155fa0');
    await waitFor('Boolean(document.querySelector(".business-product img")?.naturalWidth)');
    const previousPhoto = await evaluate('document.querySelector(".business-product img").src');
    await photo(`${products}/${product.id}/image`, '#ff0000');
    await waitFor(`Boolean(document.querySelector(".business-product img")?.naturalWidth) && document.querySelector(".business-product img").src!==${JSON.stringify(previousPhoto)}`);
    await photo('/api/tenant/el-cano/images/profile', '#155fa0');
    await photo('/api/tenant/el-cano/images/cover', '#155fa0');
    await waitFor('[...document.images].filter(x=>x.src.includes("/api/public/lubricentros/el-cano/images/")&&x.naturalWidth>0).length===2');
    const services = '/api/tenant/el-cano/services';
    await evaluate('[...document.querySelectorAll("[role=tab]")].find(x=>x.textContent==="Servicios").click()');
    const service = await (await req(services, 'POST', { nombre: 'Servicio en vivo' }, token)).json();
    await waitFor('document.body.innerText.includes("Servicio en vivo")');
    await req(`${services}/${service.id}`, 'DELETE', undefined, token);
    await waitFor('!document.body.innerText.includes("Servicio en vivo")');
    const root = await (await req('/api/admin/login', 'POST', { email: 'root@example.test', password: 'root-test-password' })).json();
    const state = '/api/admin/lubricentros/00000000-0000-4000-8000-000000000001/estado';
    await req(state, 'PATCH', { estado: 'Inactivo' }, root.token);
    await waitFor('document.body.innerText.includes("Este lubricentro no está disponible")');
    await req(state, 'PATCH', { estado: 'Activo' }, root.token);
    await waitFor('document.querySelector("h1")?.textContent==="Lubricentro El Cano"');
    const editResponse = await req('/api/admin/lubricentros/00000000-0000-4000-8000-000000000001', 'PUT', { nombre: 'El Cano actualizado', slug: 'el-cano-actualizado', email: 'el-cano@example.test', telefono: '1145678900', direccion: 'Av. Nueva 123', ciudad: 'Buenos Aires', provincia: 'Buenos Aires', responsable: 'Prueba' }, root.token);
    assert.equal(editResponse.status, 200);
    await waitFor('location.pathname==="/el-cano-actualizado" && document.querySelector("h1")?.textContent==="El Cano actualizado"');
    assert.equal(await evaluate('document.body.innerText.includes("Av. Nueva 123")'), true);
    assert.equal(await evaluate('window.__realtimeCheck'), 'same-document', 'todos los cambios se reflejan sin recargar el documento');
    console.log('PASS: productos, fotos y reemplazos, servicios, estado, datos y cambio de slug en perfil público sin recargar. Datos y bucket simulados.');
  } finally { ws.close(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
