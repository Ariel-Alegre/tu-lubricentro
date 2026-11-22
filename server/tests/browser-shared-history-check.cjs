// Fixture --customers 3101, Next 3102 y Chrome CDP 9449. No utiliza Railway.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

(async () => {
  const tabs = await (await fetch('http://127.0.0.1:9449/json')).json();
  const ws = new WebSocket(tabs.find((tab) => tab.type === 'page' && tab.url.includes('3102')).webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let id = 0; const pending = new Map();
  ws.onmessage = (event) => { const result = JSON.parse(event.data); if (pending.has(result.id)) { pending.get(result.id)(result); pending.delete(result.id); } };
  async function call(method, params = {}) { const response = await new Promise((resolve) => { const key = ++id; pending.set(key, resolve); ws.send(JSON.stringify({ id: key, method, params })); }); if (response.error) throw new Error(response.error.message); return response.result; }
  async function evaluate(expression) { const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text); return response.result.value; }
  async function waitFor(expression) { for (let i = 0; i < 100; i++) { try { if (await evaluate(expression)) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 200)); } throw new Error(`No apareció: ${expression}`); }
  const base = 'http://127.0.0.1:3101';
  const req = (url, method = 'GET', body, token) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  try {
    const { token } = await (await req('/api/tenant/login', 'POST', { email: 'el-cano@example.test', password: '123456' })).json();
    const created = await req('/api/tenant/el-cano/customers', 'POST', { solicitudId: randomUUID(), nombre: 'Cliente privado QR', telefono: '1145678900', patente: 'AB123CD', marca: 'Ford', modelo: 'Fiesta', fecha: '2026-11-22', servicio: 'Cambio de aceite', productos: ['Aceite 10W-40'], kilometraje: 80000, observaciones: 'Nota interna privada', monto: '18500.50', metodoPago: 'efectivo' }, token);
    assert.equal(created.status, 201); const vehicle = await created.json();
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: 'http://localhost:3102/login/admin' }); await waitFor('Boolean(document.querySelector("form"))');
    await evaluate(`(async()=>{const r=await fetch('/api/tenant/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'el-cano@example.test',password:'123456'})});if(!r.ok)throw new Error('login')})()`);
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin/clientes' });
    await waitFor('Boolean(document.querySelector(".customer-history-button"))'); await evaluate('document.querySelector(".customer-history-button").click()');
    await waitFor('Boolean(document.querySelector(".history-action-buttons"))'); await evaluate('document.querySelector(".history-action-buttons button:last-child").click()');
    await waitFor('Boolean(document.querySelector(".customer-qr-code canvas"))');
    const link = await evaluate('document.querySelector(".customer-qr-modal textarea").value'); assert.match(link, /^http:\/\/localhost:3102\/el-cano\/AB123CD\?clave=[a-f0-9]{64}$/);
    assert.ok(await evaluate('document.querySelector(".customer-qr-code canvas").toDataURL().startsWith("data:image/png")'));
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lubricentro-qr-'));
    await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
    await evaluate('document.querySelector(".customer-qr-actions button").click()');
    const downloaded = path.join(directory, 'historial-AB123CD.png');
    for (let i = 0; i < 60 && !fs.existsSync(downloaded); i++) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(fs.existsSync(downloaded), 'descarga el QR para imprimir/compartir'); assert.equal((await require('sharp')(downloaded).metadata()).format, 'png');
    const qrShot = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(os.tmpdir(), 'lubricentro-history-qr.png'), Buffer.from(qrShot.data, 'base64'));
    await evaluate('document.querySelector(".customer-qr-modal .ant-modal-footer button").click()');
    await waitFor('document.querySelector(".customer-history-modal")?.getBoundingClientRect().width>0'); await evaluate('document.querySelector(".history-action-buttons button:last-child").click()');
    await waitFor('document.querySelector(".customer-qr-modal")?.getBoundingClientRect().width>0'); assert.equal(await evaluate('document.querySelector(".customer-qr-modal textarea").value'), link);
    await call('Network.clearBrowserCookies'); // La página compartida no requiere sesión.
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano/AB123CD' });
    await waitFor('document.body.innerText.includes("Acceso al historial")'); assert.equal(await evaluate('document.querySelectorAll(".shared-history-visits li").length'), 0, 'la patente sin clave no revela servicios');
    const key = new URL(link).searchParams.get('clave');
    await call('Page.navigate', { url: `http://localhost:3102/historial/${key}` });
    await waitFor('location.pathname==="/el-cano/AB123CD" && document.querySelectorAll(".shared-history-visits li").length===1');
    await call('Page.navigate', { url: `http://localhost:3102/lorenzo/ZZZ999?clave=${key}` });
    await waitFor('location.pathname==="/el-cano/AB123CD" && document.querySelector(".shared-history-brand h1")?.textContent==="AB123CD"');
    await call('Page.navigate', { url: link });
    await waitFor('document.querySelector(".shared-history-brand h1")?.textContent==="AB123CD" && document.querySelectorAll(".shared-history-visits li").length===1');
    const body = await evaluate('document.body.innerText'); for (const secret of ['Cliente privado QR', '1145678900', 'Nota interna privada', '18.500', 'Efectivo']) assert.equal(body.includes(secret), false);
    await evaluate('window.__sharedHistoryCheck="same-document"');
    const added = await req(`/api/tenant/el-cano/customers/vehicles/${vehicle.id}/visits`, 'POST', { solicitudId: randomUUID(), fecha: '2026-11-23', servicio: 'Nuevo servicio por socket', productos: ['Filtro de aire'], kilometraje: 85000, monto: '2500', metodoPago: null }, token); assert.equal(added.status, 201);
    await waitFor('document.querySelectorAll(".shared-history-visits li").length===2 && document.body.innerText.includes("Nuevo servicio por socket")'); assert.equal(await evaluate('window.__sharedHistoryCheck'), 'same-document');
    for (const [width, height, label] of [[1440,1100,'desktop'],[390,844,'mobile']]) { await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await new Promise((resolve) => setTimeout(resolve, 400)); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true); const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(os.tmpdir(), `lubricentro-shared-history-${label}.png`), Buffer.from(shot.data, 'base64')); }
    const root = await (await req('/api/admin/login', 'POST', { email: 'root@example.test', password: 'root-test-password' })).json();
    const state = '/api/admin/lubricentros/00000000-0000-4000-8000-000000000001/estado';
    await req(state, 'PATCH', { estado: 'Inactivo' }, root.token); await waitFor('document.body.innerText.includes("Historial no disponible")');
    await req(state, 'PATCH', { estado: 'Activo' }, root.token); await waitFor('document.querySelectorAll(".shared-history-visits li").length===2');
    assert.equal(await evaluate('window.__sharedHistoryCheck'), 'same-document');
    console.log('PASS: QR estable y descargable, acceso sin login, campos privados excluidos, nuevas visitas por socket y estado del negocio. Escritorio/móvil. PostgreSQL en memoria.');
  } finally { ws.close(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
