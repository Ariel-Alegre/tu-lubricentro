'use client';
import { Alert, AutoComplete, Button, Card, Empty, Form, Input, InputNumber, Modal, Select, Spin, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { HistoryOutlined, LogoutOutlined, MenuOutlined, PlusOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizePlate, today, visitDate, paymentMethods, type PaymentMethod, type Visit, type CustomerList, type Vehicle, type VehicleHistory } from '../../lib/customers';
import { formatPrice } from '../../lib/products';
import './products.css';
import './customers.css';
import CustomerHistory from './customer-history';

type Values = { patente?: string; clienteId?: string; nombre?: string; telefono?: string; marca?: string; modelo?: string; fecha: string; servicio: string; productos?: string[]; kilometraje?: number | null; observaciones?: string; monto: string; metodoPago: PaymentMethod | 'pendiente' };
export default function CustomersPanel({ slug, nombre, version, onOpenMenu, onLogout }: { slug: string; nombre: string; version: number; onOpenMenu: () => void; onLogout: () => void }) {
  const router = useRouter();
  const [form] = Form.useForm<Values>();
  const [paymentForm] = Form.useForm<{ monto: string; metodoPago: PaymentMethod }>();
  const total = Form.useWatch('monto', form);
  const [paymentVisit, setPaymentVisit] = useState<Visit | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const customerId = Form.useWatch('clienteId', form);
  const [list, setList] = useState<CustomerList>({ clientes: [], vehiculos: [] });
  const [selectedId, setSelectedId] = useState('');
  const [history, setHistory] = useState<VehicleHistory | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<'register' | 'visit' | null>(null);
  const [saving, setSaving] = useState(false);
  const [serviceOptions, setServiceOptions] = useState<{ value: string }[]>([]);
  const [productOptions, setProductOptions] = useState<{ value: string }[]>([]);
  const requestId = useRef('');
  const searchGeneration = useRef(0);
  const base = `/api/tenant/${slug}/customers`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/tenant/${slug}/customers`, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); }
      const data = await response.json(); if (!response.ok) throw new Error(data.message);
      if (!controller.signal.aborted) { setList(data); setError(''); }
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message || 'No se pudieron cargar los clientes'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, version, reload, router]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetch(`/api/tenant/${slug}/customers/vehicles/${selectedId}`, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); }
      const data = await response.json(); if (!response.ok) throw new Error(data.message);
      if (!controller.signal.aborted) { setHistory(data); setDetailError(''); }
    }).catch((cause) => { if (!controller.signal.aborted) setDetailError(cause.message || 'No se pudo cargar el historial'); }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selectedId, slug, version, reload, router]);

  useEffect(() => {
    const controller = new AbortController();
    async function catalog(kind: 'services' | 'products') {
      try {
        const response = await fetch(`/api/tenant/${slug}/${kind}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const data: { nombre: string }[] = await response.json();
        const options = [...new Set(data.map((item) => item.nombre))].map((value) => ({ value }));
        if (!controller.signal.aborted) { if (kind === 'services') setServiceOptions(options); else setProductOptions(options); }
      } catch { /* Se puede escribir el servicio y los productos aunque el catálogo no esté disponible. */ }
    }
    void catalog('services'); void catalog('products');
    return () => controller.abort();
  }, [slug, version]);

  function open(mode: 'register' | 'visit') {
    form.resetFields(); setFormError(''); setSuccess(''); requestId.current = crypto.randomUUID();
    form.setFieldsValue({ fecha: today(), productos: [], metodoPago: 'pendiente', ...(mode === 'register' && /^[A-Z0-9]{5,10}$/.test(normalizePlate(search)) ? { patente: normalizePlate(search) } : {}) });
    setMode(mode);
  }
  function viewHistory(id: string) {
    searchGeneration.current++; setDetailError(''); setDetailLoading(true);
    setHistory(null); setSelectedId(id); setHistoryOpen(true);
    setReload((value) => value + 1); setNotice('');
  }
  function closeHistory() {
    searchGeneration.current++; setHistoryOpen(false); setSelectedId('');
    setHistory(null); setDetailError(''); setDetailLoading(false);
  }
  async function lookup() {
    const plate = normalizePlate(search); const generation = ++searchGeneration.current;
    if (!/^[A-Z0-9]{5,10}$/.test(plate)) { setNotice('Ingresá una patente como ABC123 o AB123CD. También podés buscar por nombre en la lista.'); return; }
    setNotice(''); setError(''); setDetailLoading(true); setSelectedId(''); setHistory(null);
    try {
      const response = await fetch(`${base}/plate/${encodeURIComponent(plate)}`, { cache: 'no-store' });
      if (generation !== searchGeneration.current) return;
      if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); return; }
      const data = await response.json();
      if (response.status === 404) { setNotice('Esta patente todavía no está registrada en tu lubricentro. Registrá el cliente, el vehículo y su primera atención.'); return; }
      if (!response.ok) throw new Error(data.message);
      setHistory(data); setSelectedId(data.id); setDetailError(''); setHistoryOpen(true);
    } catch (cause) { if (generation === searchGeneration.current) setError(cause instanceof Error ? cause.message : 'No se pudo buscar'); }
    finally { if (generation === searchGeneration.current) setDetailLoading(false); }
  }
  async function save(values: Values) {
    setSaving(true); setFormError('');
    try {
      const response = await fetch(mode === 'visit' ? `${base}/vehicles/${history!.id}/visits` : base, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, metodoPago: values.metodoPago === 'pendiente' ? null : values.metodoPago, kilometraje: values.kilometraje ?? null, solicitudId: requestId.current }),
      });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); }
      if (!response.ok) throw new Error(data.message || 'No se pudo guardar la atención');
      setHistory(data); setSelectedId(data.id); setHistoryOpen(true); setDetailError(''); if (mode === 'register') { setSearch(''); setPage(1); } setNotice(''); setSuccess(mode === 'register' ? 'Cliente, vehículo y primera atención registrados.' : 'Nueva atención agregada al historial.'); setMode(null); setReload((value) => value + 1);
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'No se pudo guardar'); }
    finally { setSaving(false); }
  }
  const filtered = list.vehiculos.filter((item) => normalizePlate(item.patente).includes(normalizePlate(search)) || `${item.nombre} ${item.telefono}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')));

  function charge(visit: Visit) {
    paymentForm.resetFields(); paymentForm.setFieldsValue({ monto: visit.monto ?? undefined });
    setPaymentError(''); setPaymentVisit(visit);
  }
  async function registerPayment(values: { monto: string; metodoPago: PaymentMethod }) {
    if (!history || !paymentVisit) return;
    setPaymentSaving(true); setPaymentError('');
    try {
      const response = await fetch(`${base}/vehicles/${history.id}/visits/${paymentVisit.id}/payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); }
      if (!response.ok) throw new Error(data.message || 'No se pudo registrar el pago');
      setHistory(data); setPaymentVisit(null); setReload((value) => value + 1); setSuccess('Pago registrado correctamente.');
    } catch (cause) { setPaymentError(cause instanceof Error ? cause.message : 'No se pudo registrar el pago'); }
    finally { setPaymentSaving(false); }
  }

  const columns: TableProps<Vehicle>['columns'] = [
    { title: 'Cliente', key: 'cliente', render: (_, vehicle) => <div className="customer-table-name"><strong>{vehicle.nombre}</strong>{vehicle.telefono && <span>{vehicle.telefono}</span>}</div> },
    { title: 'Patente', dataIndex: 'patente', key: 'patente', width: 104, render: (patente: string) => <Tag className="customer-plate">{patente}</Tag> },
    { title: 'Vehículo', key: 'vehiculo', responsive: ['xl'], render: (_, vehicle) => [vehicle.marca, vehicle.modelo].filter(Boolean).join(' ') || '—' },
    { title: 'Atenciones', dataIndex: 'totalVisitas', key: 'atenciones', responsive: ['lg'], width: 110, render: (value?: number) => value ?? 0 },
    { title: 'Última visita', dataIndex: 'ultimaVisita', key: 'ultimaVisita', responsive: ['lg'], width: 140, render: (value?: string) => value ? visitDate(value) : '—' },
    { title: 'Historial', key: 'acciones', width: 136, render: (_, vehicle) => <Button className="customer-history-button" icon={<HistoryOutlined />} aria-label={`Ver historial de ${vehicle.nombre}, patente ${vehicle.patente}`} onClick={(event) => { event.stopPropagation(); viewHistory(vehicle.id); }}>Ver historial</Button> },
  ];

  return <div className="tenant-customers-page business-page business-page-editor">
    <header className="business-topbar"><div className="business-topbar-inner"><div className="business-platform-brand"><Button className="business-mobile-menu-button" type="text" icon={<MenuOutlined />} aria-label="Abrir menú administrativo" onClick={onOpenMenu} /><Image src="/tu-lubricentro-logo.png" alt="" width={36} height={36} /><strong>Tu Lubricentro</strong></div><Button icon={<LogoutOutlined />} onClick={onLogout}>Salir</Button></div></header>
    <main className="tenant-products-content customers-content">
      <div className="tenant-products-title"><div><span>CLIENTES DE {nombre.toUpperCase()}</span><h1>Clientes e historial</h1><p>Buscá la patente y agregá una atención a su historial.</p></div><Button type="primary" icon={<PlusOutlined />} onClick={() => open('register')} disabled={loading}>Registrar cliente / vehículo</Button></div>
      {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => setReload((value) => value + 1)}>Reintentar</Button>} />}
      {success && <Alert type="success" showIcon title={success} closable afterClose={() => setSuccess('')} />}
      <Card className="customers-search"><label htmlFor="customer-search">Buscar por patente</label><Input.Search id="customer-search" prefix={<SearchOutlined />} placeholder="Ej. AB123CD o ABC123" allowClear value={search} loading={detailLoading && !historyOpen} onChange={(event) => { searchGeneration.current++; setPage(1); if (!selectedId) setDetailLoading(false); setSearch(event.target.value); setNotice(''); }} onSearch={lookup} enterButton="Buscar" /><p>También podés filtrar la tabla escribiendo el nombre o teléfono del cliente.</p>{notice && <Alert type="info" showIcon title={notice} action={/^[A-Z0-9]{5,10}$/.test(normalizePlate(search)) ? <Button onClick={() => open('register')}>Registrar patente</Button> : undefined} />}</Card>
      <Card className="customers-list" title={<span><UserOutlined /> Mis clientes</span>} extra={<span>{list.clientes.length} {list.clientes.length === 1 ? 'cliente' : 'clientes'} · {list.vehiculos.length} {list.vehiculos.length === 1 ? 'vehículo' : 'vehículos'}</span>} styles={{ body: { padding: 0 } }}>
        <Table<Vehicle> rowKey="id" tableLayout="fixed" columns={columns} dataSource={filtered} loading={loading} pagination={{ current: page, onChange: (value) => setPage(value), pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }} onRow={(vehicle) => ({ onClick: () => viewHistory(vehicle.id) })} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={search ? 'No encontramos coincidencias.' : 'Todavía no registraste clientes.'} /> }} />
      </Card>
    </main>
    <Modal className="customer-history-modal" title={<div className="history-modal-title"><HistoryOutlined /><div><strong>Historial del vehículo</strong><small>Todos los cuidados, en un solo lugar</small></div></div>} open={historyOpen && mode === null && !paymentVisit} onCancel={closeHistory} centered footer={<div className="history-modal-footer"><span>Atenciones ordenadas de la más reciente a la más antigua</span><Button onClick={closeHistory}>Cerrar historial</Button></div>} width={860} styles={{ container: { padding: 0, borderRadius: 16, overflow: 'hidden' }, header: { padding: '20px 24px', marginBottom: 0 }, body: { maxHeight: 'min(68vh, 720px)', overflowY: 'auto', padding: 0 }, footer: { marginTop: 0, padding: '16px 24px', borderTop: '1px solid #e9eef5' } }}>
      {detailError && <Alert type="error" showIcon title={detailError} action={<Button onClick={() => { setDetailLoading(true); setReload((value) => value + 1); }}>Reintentar</Button>} />}
      {detailLoading ? <div className="customers-loading"><Spin description="Cargando historial..." /></div> : history ? <CustomerHistory history={history} onAdd={() => open('visit')} onCharge={charge} /> : !detailError && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Este vehículo todavía no tiene atenciones registradas." />}
    </Modal>
    <Modal className="customer-modal" title={mode === 'register' ? 'Registrar vehículo y primera atención' : `Nueva atención · ${history?.patente ?? ''}`} open={mode !== null} forceRender width={640} onCancel={() => { if (!saving) setMode(null); }} onOk={() => form.submit()} okText={mode === 'register' ? 'Registrar primera atención' : 'Guardar atención'} cancelText="Cancelar" confirmLoading={saving} cancelButtonProps={{ disabled: saving }}>
      {formError && <Alert type="error" showIcon title={formError} />}
      <Form form={form} layout="vertical" onFinish={save} requiredMark={false} disabled={saving}>
        {mode === 'register' && <>
          <h3>Cliente y vehículo</h3><p className="customer-form-hint">Estos datos se cargan una sola vez. Las próximas visitas se buscan por patente.</p>
          {list.clientes.length > 0 && <Form.Item name="clienteId" label="Cliente"><Select allowClear placeholder="Registrar un cliente nuevo" showSearch optionFilterProp="label" options={list.clientes.map((item) => ({ value: item.id, label: `${item.nombre}${item.telefono ? ` · ${item.telefono}` : ''}` }))} /></Form.Item>}
          {!customerId && <div className="customer-form-grid"><Form.Item name="nombre" label="Nombre y apellido" rules={[{ required: true, whitespace: true, message: 'Ingresá el nombre del cliente' }, { max: 120 }]}><Input maxLength={120} /></Form.Item><Form.Item name="telefono" label="Teléfono (opcional)" rules={[{ max: 40 }]}><Input maxLength={40} /></Form.Item></div>}
          <Form.Item name="patente" label="Patente" normalize={normalizePlate} rules={[{ required: true, pattern: /^[A-Z0-9]{5,10}$/, message: 'Ingresá una patente válida: ABC123 o AB123CD' }]}><Input maxLength={10} placeholder="AB123CD" autoCapitalize="characters" /></Form.Item>
          <div className="customer-form-grid"><Form.Item name="marca" label="Marca (opcional)"><Input maxLength={80} placeholder="Ej. Ford" /></Form.Item><Form.Item name="modelo" label="Modelo (opcional)"><Input maxLength={80} placeholder="Ej. Fiesta" /></Form.Item></div>
        </>}
        <h3>Trabajo realizado</h3>
        <div className="customer-form-grid"><Form.Item name="fecha" label="Fecha" rules={[{ required: true, message: 'Elegí la fecha' }]}><Input type="date" /></Form.Item><Form.Item name="kilometraje" label="Kilometraje (opcional)"><InputNumber min={0} max={10000000} precision={0} suffix="km" style={{ width: '100%' }} /></Form.Item></div>
        <Form.Item name="servicio" label="Servicio realizado" rules={[{ required: true, whitespace: true, message: 'Ingresá el servicio realizado' }, { max: 120 }]}><AutoComplete options={serviceOptions} filterOption={(input, option) => String(option?.value).toLocaleLowerCase('es').includes(input.toLocaleLowerCase('es'))} maxLength={120} placeholder="Elegí un servicio o escribí uno nuevo" /></Form.Item>
        <Form.Item name="productos" label="Productos utilizados" extra="Elegí del catálogo o escribí el nombre y presioná Enter. Dejalo vacío si no se utilizaron productos." rules={[{ type: 'array', max: 12, message: 'Podés agregar hasta 12 productos' }]}><Select mode="tags" options={productOptions} tokenSeparators={[';']} placeholder="Ej. Aceite 10W-40, filtro de aceite" /></Form.Item>
        <Form.Item name="observaciones" label="Observaciones (opcional)"><Input.TextArea rows={3} maxLength={1000} showCount /></Form.Item>
        <h3>Cobro de la atención</h3>
        <div className="customer-form-grid">
          <Form.Item name="monto" label="Monto total a cobrar (ARS)" rules={[{ required: true, message: 'Ingresá el total de la atención' }]}><InputNumber<string> stringMode prefix="$" min="0" max="9999999999.99" precision={2} placeholder="0.00" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="metodoPago" label="Estado y método de pago" rules={[{ required: true, message: 'Elegí cómo se paga' }]}><Select options={[{ value: 'pendiente', label: 'Pendiente de pago' }, ...paymentMethods]} /></Form.Item>
        </div>
        <div className="customer-charge-preview"><span>Total de la atención</span><strong>{total != null && total !== '' ? formatPrice(String(total)) : 'Ingresá el monto'}</strong><small>Incluí el servicio y los productos. Al elegir un método de pago, la atención queda registrada como pagada.</small></div>
      </Form>
    </Modal>
    <Modal className="customer-payment-modal" title="Cobrar atención" open={paymentVisit !== null} forceRender onCancel={() => { if (!paymentSaving) setPaymentVisit(null); }} onOk={() => paymentForm.submit()} okText="Registrar pago" cancelText="Volver al historial" confirmLoading={paymentSaving} cancelButtonProps={{ disabled: paymentSaving }} width={480}>
      {paymentVisit && <div className="payment-attention"><strong>{paymentVisit.servicio}</strong><span>{history?.patente} · {visitDate(paymentVisit.fecha)}</span><p>{paymentVisit.monto !== null ? formatPrice(paymentVisit.monto) : 'Esta atención todavía no tiene un monto registrado.'}</p></div>}
      {paymentError && <Alert type="error" showIcon title={paymentError} style={{ marginBottom: 16 }} />}
      <Form name="visit-payment" form={paymentForm} layout="vertical" requiredMark={false} onFinish={registerPayment} disabled={paymentSaving}>
        <Form.Item name="monto" label="Monto a cobrar (ARS)" rules={[{ required: true, message: 'Ingresá el monto a cobrar' }]}><InputNumber<string> disabled={paymentSaving || paymentVisit?.monto != null} stringMode prefix="$" min="0" max="9999999999.99" precision={2} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="metodoPago" label="¿Con qué método paga?" rules={[{ required: true, message: 'Seleccioná el método de pago' }]}><Select placeholder="Seleccioná un método" options={paymentMethods} /></Form.Item>
      </Form>
    </Modal>
  </div>;
}
