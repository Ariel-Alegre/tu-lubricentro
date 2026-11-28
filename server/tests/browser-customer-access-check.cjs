// Fixture --customers en 3101, Next 3102, Chrome CDP 9449; solo datos locales.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
(async () => {
  const tabs = await (await fetch('http://127.0.0.1:9449/json')).json();
  const ws = new WebSocket(tabs.find((tab) => tab.type === 'page' && tab.url.includes('3102')).webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let id = 0; const pending = new Map();
  ws.onmessage = (event) => { const m = JSON.parse(event.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  async function call(method, params = {}) { const m = await new Promise((resolve) => { const key = ++id; pending.set(key, resolve); ws.send(JSON.stringify({ id: key, method, params })); }); if (m.error) throw Error(m.error.message); return m.result; }
  async function ev(expression) { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
  async function wait(expression) { for (let i = 0; i < 150; i++) { try { if (await ev(expression)) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 200)); } throw Error(`No apareció: ${expression}`); }
  async function value(text) { await ev(`(()=>{const input=document.querySelector('#patente');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`); }
  const submit = () => ev('document.querySelector(".customer-access-card button[type=submit]").click()');
  const req = (path, body, token) => fetch('http://127.0.0.1:3101' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  try {
    for (const [slug, plate] of [['el-cano', 'AB123CD'], ['lorenzo', 'ZZ999ZZ']]) {
      const { token } = await (await req('/api/tenant/login', { email: `${slug}@example.test`, password: '123456' })).json();
      const response = await req(`/api/tenant/${slug}/customers`, { solicitudId: randomUUID(), nombre: 'Cliente privado', patente: plate, telefono: '', marca: 'Ford', modelo: 'Fiesta', fecha: '2026-11-28', servicio: `Servicio de ${slug}`, productos: ['Aceite'], kilometraje: 1000, observaciones: 'Nota privada', monto: '100', metodoPago: null }, token);
      assert.equal(response.status, 201);
    }
    await call('Page.navigate', { url: 'http://localhost:3102/el-cano' });
    await wait('document.querySelector(".business-client-history-link")?.getBoundingClientRect().width>0');
    assert.equal(await ev('document.body.innerText.includes("Acceso a mi comercio")'), false);
    assert.equal(await ev('document.querySelector(".business-client-history-link").getAttribute("href")'), '/el-cano/login');
    await ev('document.querySelector(".business-client-history-link").click()');
    await wait('location.pathname==="/el-cano/login" && Boolean(document.querySelector("#patente")) && Object.keys(document.querySelector("#patente")).some(key=>key.startsWith("__reactProps"))');
    assert.equal(await ev('document.querySelectorAll("form input").length'), 1);
    assert.equal(await ev('document.querySelector(".customer-access-business").textContent'), 'Lubricentro El Cano');
    await value('123'); await submit();
    await wait('document.body.innerText.includes("Ingresá una patente válida")');
    for (const plate of ['XY123YZ', 'ZZ999ZZ']) {
      await value(plate); await submit(); await wait('document.body.innerText.includes("No encontramos un historial")');
      assert.equal(await ev('location.pathname'), '/el-cano/login');
    }
    await value('ab-123-cd');
    assert.equal(await ev('document.querySelector("#patente").value'), 'AB123CD');
    await submit();
    await wait('location.pathname==="/el-cano/AB123CD" && document.body.innerText.includes("Servicio de el-cano")');
    assert.equal(await ev('document.body.innerText.includes("Nota privada") || document.body.innerText.includes("Cliente privado")'), false);
    await call('Page.navigate', { url: 'http://localhost:3102/lorenzo/login' });
    await wait('Boolean(document.querySelector("#patente")) && Object.keys(document.querySelector("#patente")).some(key=>key.startsWith("__reactProps"))');
    await value('AB123CD'); await submit(); await wait('document.body.innerText.includes("No encontramos un historial")');
    for (const width of [390, 360]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false });
      await call('Page.navigate', { url: 'http://localhost:3102/el-cano' });
      await wait('document.querySelector(".business-client-history-link")?.getBoundingClientRect().width>0');
      assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth'), true);
      await ev('document.querySelector(".business-client-history-link").click()');
      await wait('location.pathname==="/el-cano/login" && Boolean(document.querySelector("#patente")) && Object.keys(document.querySelector("#patente")).some(key=>key.startsWith("__reactProps"))');
      assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth'), true);
      await value('abc 123'); assert.equal(await ev('document.querySelector("#patente").value'), 'ABC123');
    }
    console.log('PASS: botón público, consulta solo por patente, validación, aislamiento entre comercios, historial y móvil.');
  } finally { ws.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
