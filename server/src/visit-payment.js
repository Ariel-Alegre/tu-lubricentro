const methods = ['efectivo', 'transferencia', 'debito', 'credito', 'mercado_pago', 'otro'];
function payment(body, requireMethod = false) {
  const { monto, metodoPago = null } = body;
  if (!['number', 'string'].includes(typeof monto) || !/^\d{1,10}(\.\d{1,2})?$/.test(String(monto)) || (metodoPago !== null && !methods.includes(metodoPago)) || (requireMethod && metodoPago === null)) {
    throw Object.assign(new Error('Ingresá un monto válido en pesos, con hasta dos decimales, y un método de pago válido'), { status: 400 });
  }
  const [whole, fraction = ''] = String(monto).split('.');
  return { monto: `${Number(whole)}.${fraction.padEnd(2, '0')}`, metodoPago };
}
module.exports = { payment };
