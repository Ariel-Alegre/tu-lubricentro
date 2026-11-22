// Requiere tenant-server.cjs, Next en 3102 configurado contra el backend de prueba
// (SERVER_API_URL y SOCKET_PUBLIC_URL=http://127.0.0.1:3101) y Chrome en 9449.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const tabs = await (await fetch('http://127.0.0.1:9449/json')).json();
  const tab = tabs.find((item) => item.type === 'page' && item.url.includes('3102'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const result = JSON.parse(event.data);
    if (pending.has(result.id)) { pending.get(result.id)(result); pending.delete(result.id); }
  };
  async function call(method, params = {}) {
    const result = await new Promise((resolve) => { const key = ++id; pending.set(key, resolve); ws.send(JSON.stringify({ id: key, method, params })); });
    if (result.error) throw new Error(result.error.message);
    return result.result;
  }
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let index = 0; index < 60; index++) {
      try { if (await evaluate(expression)) return; } catch { /* La navegación puede cambiar el contexto entre consultas. */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`No apareció: ${expression}`);
  }
  try {
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await waitFor('location.origin === "http://localhost:3102"');
    const loginStatus = await evaluate('(async()=>{const response=await fetch("/api/tenant/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"el-cano@example.test",password:"123456"})});return response.status})()');
    assert.equal(loginStatus, 200);
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin' });
    await waitFor('Boolean(document.querySelector(".business-page-editor .business-image-upload-cover input[type=file]"))');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".tenant-admin-sidebar")).backgroundColor'), 'rgb(255, 255, 255)', 'menú lateral blanco');
    const { root } = await call('DOM.getDocument');
    const { nodeIds } = await call('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'input[type="file"]' });
    assert.equal(nodeIds.length, 2);
    await call('DOM.setFileInputFiles', { nodeId: nodeIds[0], files: [path.resolve(__dirname, '../../client/public/lubricentro-cover.png')] });
    await waitFor('document.body.innerText.includes("Portada actualizada")');
    await call('DOM.setFileInputFiles', { nodeId: nodeIds[1], files: [path.resolve(__dirname, '../../client/public/tu-lubricentro-logo.png')] });
    await waitFor('document.body.innerText.includes("Foto de perfil actualizada")');
    const preview = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(process.env.TEMP, 'lubricentro-upload-panel.png'), Buffer.from(preview.data, 'base64'));
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    const mobile = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(process.env.TEMP, 'lubricentro-upload-panel-mobile.png'), Buffer.from(mobile.data, 'base64'));
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".tenant-admin-sidebar")).display'), 'none');
    await evaluate('document.querySelector(".business-mobile-menu-button").click()');
    await waitFor('Boolean(document.querySelector(".ant-drawer-open"))');
    await evaluate('[...document.querySelectorAll(".ant-drawer .ant-menu-item")].find(item=>item.textContent.trim()==="Productos").click()');
    await waitFor('location.pathname === "/el-cano/admin/productos" && Boolean(document.querySelector(".tenant-products-title")) && !document.querySelector(".ant-drawer-open")');
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    const session = await evaluate('(async()=>{const r=await fetch("/api/tenant/el-cano/session");return r.json()})()');
    assert.equal(session.hasCover, true);
    assert.equal(session.hasProfile, true);
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano' });
    await waitFor('document.querySelector("h1")?.textContent === "Lubricentro El Cano"');
    await waitFor('[...document.images].filter(x=>x.src.includes("/api/public/lubricentros/")).length === 2 && [...document.images].every(x=>x.complete && x.naturalWidth>0)');
    assert.equal(await evaluate('[...document.querySelectorAll("[role=tab]")].some(x=>x.textContent==="Fotos")'), false);
    assert.equal(await evaluate('document.querySelectorAll(".business-image-upload").length'), 0, 'los controles de edición no aparecen en la vista pública');
    console.log('PASS: login por BFF, socket activo, dos cargas desde el selector real e imágenes públicas personalizadas. Sin galería Fotos. PostgreSQL simulado.');
  } finally { ws.close(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
