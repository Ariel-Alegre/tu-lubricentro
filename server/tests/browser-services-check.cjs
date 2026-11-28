// Backend de prueba en 3101, Next configurado contra él en 3102 y Chrome CDP en 9449.
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
    await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${textarea ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  }
  try {
    await evaluate(`(async()=>{await fetch('/api/tenant/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'el-cano@example.test',password:'123456'})})})()`);
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin/mi-lubricentro' });
    await waitFor('(()=>{const tab=[...document.querySelectorAll("[role=tab]")].find(x=>x.textContent==="Servicios");if(tab?.getAttribute("aria-selected")==="false")tab.click();const button=document.querySelector(".tenant-service-heading button");return Boolean(button&&!button.disabled)})()');
    await evaluate('document.querySelector(".tenant-service-heading button").click()');
    await waitFor('document.querySelector(".tenant-service-modal input")?.getBoundingClientRect().width > 0');
    await setValue('.tenant-service-modal input', 'Cambio de aceite');
    await setValue('.tenant-service-modal textarea', 'Cambio de aceite y revisión de filtros.', true);
    await evaluate('document.querySelector(".tenant-service-modal .ant-modal-footer .ant-btn-primary").click()');
    await waitFor('document.querySelector(".tenant-service-list h3")?.textContent === "Cambio de aceite"');
    await evaluate('document.querySelector(".tenant-service-actions button").click()');
    await waitFor('document.querySelector(".tenant-service-modal input")?.getBoundingClientRect().width > 0');
    await setValue('.tenant-service-modal input', 'Cambio de aceite y filtros');
    await evaluate('document.querySelector(".tenant-service-modal .ant-modal-footer .ant-btn-primary").click()');
    await waitFor('document.querySelector(".tenant-service-list h3")?.textContent === "Cambio de aceite y filtros"');
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano' });
    await waitFor('document.querySelector("h1")?.textContent === "Lubricentro El Cano"');
    await waitFor('[...document.querySelectorAll("[role=tab]")].some(x=>x.textContent==="Servicios")');
    assert.equal(await evaluate('[...document.querySelectorAll("[role=tab]")].some(x=>x.textContent==="Fotos")'), false);
    await waitFor('(()=>{const tab=[...document.querySelectorAll("[role=tab]")].find(x=>x.textContent==="Servicios");if(tab?.getAttribute("aria-selected")==="false")tab.click();return document.querySelector(".business-service h3")?.textContent === "Cambio de aceite y filtros"})()');
    for (const [width, height, name] of [[1440, 1100, 'desktop'], [390, 844, 'mobile']]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await new Promise((resolve) => setTimeout(resolve, 400));
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(process.env.TEMP, `lubricentro-services-${name}.png`), Buffer.from(shot.data, 'base64'));
    }
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano/admin/mi-lubricentro' });
    await waitFor('(()=>{const tab=[...document.querySelectorAll("[role=tab]")].find(x=>x.textContent==="Servicios");if(tab?.getAttribute("aria-selected")==="false")tab.click();return Boolean(document.querySelector(".tenant-service-actions button[aria-label^=Eliminar]"))})()');
    await evaluate('document.querySelector(".tenant-service-actions button[aria-label^=Eliminar]").click()');
    await waitFor('Boolean(document.querySelector(".ant-popconfirm-buttons .ant-btn-primary"))');
    await evaluate('document.querySelector(".ant-popconfirm-buttons .ant-btn-primary").click()');
    await waitFor('document.querySelector(".tenant-service-list") === null && document.body.innerText.includes("Todavía no agregaste servicios")');
    console.log('PASS: crear, editar, mostrar públicamente y eliminar servicios desde la interfaz. Sin Fotos, escritorio y móvil sin desbordes. Almacenamiento simulado.');
  } finally { ws.close(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
