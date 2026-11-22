'use client';
import { Alert, AutoComplete, Button, Card, Empty, Form, Input, InputNumber, Modal, Select, Spin, Tag, Timeline } from 'antd';
import { CarOutlined, HistoryOutlined, LogoutOutlined, MenuOutlined, PlusOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizePlate, today, visitDate, type CustomerList, type VehicleHistory } from '../../lib/customers';
import './products.css';
import './customers.css';

type Values = { patente?: string; clienteId?: string; nombre?: string; telefono?: string; marca?: string; modelo?: string; fecha: string; servicio: string; productos?: string[]; kilometraje?: number | null; observaciones?: string };
export default function CustomersPanel({ slug, nombre, version, onOpenMenu, onLogout }: { slug: string; nombre: string; version: number; onOpenMenu: () => void; onLogout: () => void }) {
  const router = useRouter();
  const [form] = Form.useForm<Values>();
  const customerId = Form.useWatch('clienteId', form);
  const [list, setList] = useState<CustomerList>({ clientes: [], vehiculos: [] });
  const [selectedId, setSelectedId] = useState('');
  const [history, setHistory] = useState<VehicleHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [reload, setReload] = useState(0);
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
      if (!controller.signal.aborted) setHistory(data);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message || 'No se pudo cargar el historial'); }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
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
    form.setFieldsValue({ fecha: today(), productos: [], ...(mode === 'register' && /^[A-Z0-9]{5,10}$/.test(normalizePlate(search)) ? { patente: normalizePlate(search) } : {}) });
    setMode(mode);
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
      setHistory(data); setSelectedId(data.id);
    } catch (cause) { if (generation === searchGeneration.current) setError(cause instanceof Error ? cause.message : 'No se pudo buscar'); }
    finally { if (generation === searchGeneration.current) setDetailLoading(false); }
  }
  async function save(values: Values) {
    setSaving(true); setFormError('');
    try {
      const response = await fetch(mode === 'visit' ? `${base}/vehicles/${history!.id}/visits` : base, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, kilometraje: values.kilometraje ?? null, solicitudId: requestId.current }),
      });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); }
      if (!response.ok) throw new Error(data.message || 'No se pudo guardar la atención');
      setHistory(data); setSelectedId(data.id); setSearch(''); setNotice(''); setSuccess(mode === 'register' ? 'Cliente, vehículo y primera atención registrados.' : 'Nueva atención agregada al historial.'); setMode(null); setReload((value) => value + 1);
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'No se pudo guardar'); }
    finally { setSaving(false); }
  }
  const filtered = list.vehiculos.filter((item) => normalizePlate(item.patente).includes(normalizePlate(search)) || `${item.nombre} ${item.telefono}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')));

  return <div className="tenant-customers-page business-page business-page-editor">
    <header className="business-topbar"><div className="business-topbar-inner"><div className="business-platform-brand"><Button className="business-mobile-menu-button" type="text" icon={<MenuOutlined />} aria-label="Abrir menú administrativo" onClick={onOpenMenu} /><Image src="/tu-lubricentro-logo.png" alt="" width={36} height={36} /><strong>Tu Lubricentro</strong></div><Button icon={<LogoutOutlined />} onClick={onLogout}>Salir</Button></div></header>
    <main className="tenant-products-content customers-content">
      <div className="tenant-products-title"><div><span>CLIENTES DE {nombre.toUpperCase()}</span><h1>Clientes e historial</h1><p>Buscá la patente y agregá una atención a su historial.</p></div><Button type="primary" icon={<PlusOutlined />} onClick={() => open('register')} disabled={loading}>Registrar cliente / vehículo</Button></div>
      {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => setReload((value) => value + 1)}>Reintentar</Button>} />}
      {success && <Alert type="success" showIcon title={success} closable afterClose={() => setSuccess('')} />}
      <Card className="customers-search"><label htmlFor="customer-search">Buscar por patente</label><Input.Search id="customer-search" prefix={<SearchOutlined />} placeholder="Ej. AB123CD o ABC123" allowClear value={search} onChange={(event) => { searchGeneration.current++; if (!selectedId) setDetailLoading(false); setSearch(event.target.value); setNotice(''); }} onSearch={lookup} enterButton="Buscar" /><p>También podés filtrar la lista escribiendo el nombre del cliente.</p>{notice && <Alert type="info" showIcon title={notice} action={/^[A-Z0-9]{5,10}$/.test(normalizePlate(search)) ? <Button onClick={() => open('register')}>Registrar patente</Button> : undefined} />}</Card>
      <div className="customers-layout">
        <Card className="customers-list" title={<span><UserOutlined /> Mis clientes</span>} extra={<span>{list.clientes.length} {list.clientes.length === 1 ? 'cliente' : 'clientes'} · {list.vehiculos.length} {list.vehiculos.length === 1 ? 'vehículo' : 'vehículos'}</span>}>
          {loading ? <Spin /> : filtered.length ? <div className="customers-vehicles">{filtered.map((vehicle) => <button type="button" key={vehicle.id} className={`customer-vehicle${selectedId === vehicle.id ? ' selected' : ''}`} onClick={() => { searchGeneration.current++; setDetailLoading(true); setHistory(null); setSelectedId(vehicle.id); setReload((value) => value + 1); setNotice(''); }}><span className="customer-plate"><CarOutlined />{vehicle.patente}</span><strong>{vehicle.nombre}</strong><span>{[vehicle.marca, vehicle.modelo].filter(Boolean).join(' ') || 'Vehículo registrado'}</span><small>{vehicle.totalVisitas ?? 0} atenciones{vehicle.ultimaVisita ? ` · Última: ${visitDate(vehicle.ultimaVisita)}` : ''}</small></button>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={search ? 'No encontramos coincidencias.' : 'Todavía no registraste clientes.'} />}
        </Card>
        <Card className="customers-history" title={<span><HistoryOutlined /> Historial del vehículo</span>}>
          {detailLoading ? <div className="customers-loading"><Spin /></div> : history ? <>
            <div className="customer-summary"><Tag className="customer-plate">{history.patente}</Tag><h2>{history.nombre}</h2><p>{[history.marca, history.modelo].filter(Boolean).join(' ')}</p>{history.telefono && <a href={`tel:${history.telefono.replace(/[^\d+]/g, '')}`}>{history.telefono}</a>}<Button type="primary" icon={<PlusOutlined />} onClick={() => open('visit')}>Agregar atención</Button></div>
            <Timeline items={history.visitas.map((item) => ({ key: item.id, content: <article className="customer-visit"><span className="customer-visit-date">{visitDate(item.fecha)}{item.kilometraje !== null ? ` · ${item.kilometraje.toLocaleString('es-AR')} km` : ''}</span><h3>{item.servicio}</h3><div className="customer-visit-products">{item.productos.length ? item.productos.map((product) => <Tag key={product}>{product}</Tag>) : <span>Sin productos utilizados</span>}</div>{item.observaciones && <p>{item.observaciones}</p>}</article> }))} />
          </> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Buscá una patente o seleccioná un vehículo para ver sus atenciones." />}
        </Card>
      </div>
    </main>
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
      </Form>
    </Modal>
  </div>;
}
