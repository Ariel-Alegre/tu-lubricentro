'use client';
import { Alert, Button, Card, Empty, Form, Input, Modal, Popconfirm, Spin } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ToolOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Service = { id: string; nombre: string; descripcion: string };
type Values = Pick<Service, 'nombre' | 'descripcion'>;

export default function ServiceSettings({ slug, version = 0 }: { slug: string; version?: number }) {
  const router = useRouter();
  const [form] = Form.useForm<Values>();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const base = `/api/tenant/${slug}/services`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/tenant/${slug}/services`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); }
        if (!response.ok) throw new Error(data.message || 'No se pudieron cargar los servicios');
        if (!controller.signal.aborted) { setServices(data); setError(''); }
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, reload, router, version]);

  function edit(service: Service | null) {
    setEditing(service); setFormError(''); form.resetFields();
    if (service) form.setFieldsValue({ nombre: service.nombre, descripcion: service.descripcion });
    setOpen(true);
  }

  async function save(values: Values) {
    setSaving(true); setFormError('');
    try {
      const response = await fetch(editing ? `${base}/${editing.id}` : base, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); }
      if (!response.ok) throw new Error(data.message || 'No se pudo guardar el servicio');
      setServices((items) => items.some((item) => item.id === data.id) ? items.map((item) => item.id === data.id ? data : item) : [...items, data]);
      setOpen(false); form.resetFields(); router.refresh();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'No se pudo guardar'); }
    finally { setSaving(false); }
  }

  async function remove(service: Service) {
    setDeleting(service.id); setError('');
    try {
      const response = await fetch(`${base}/${service.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); }
      if (!response.ok) throw new Error(data.message || 'No se pudo eliminar');
      setServices((items) => items.filter((item) => item.id !== service.id)); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo eliminar'); }
    finally { setDeleting(null); }
  }

  return <Card className="tenant-service-settings" id="tenant-services" title={<><ToolOutlined /> Servicios que realizás</>}>
    <div className="tenant-service-heading"><p>Agregá los trabajos que ofrece tu lubricentro. Se mostrarán en la sección Servicios de tu página pública.</p><Button type="primary" icon={<PlusOutlined />} onClick={() => edit(null)} disabled={loading || Boolean(error)}>Agregar servicio</Button></div>
    {error && <Alert type="error" title={error} showIcon action={<Button onClick={() => { setLoading(true); setReload((value) => value + 1); }}>Reintentar</Button>} />}
    {loading ? <div className="tenant-service-loading"><Spin /></div> : !error && (services.length ? <div className="tenant-service-list">{services.map((service) => <article key={service.id}>
      <div><h3>{service.nombre}</h3>{service.descripcion && <p>{service.descripcion}</p>}</div>
      <div className="tenant-service-actions"><Button icon={<EditOutlined />} aria-label={`Editar ${service.nombre}`} onClick={() => edit(service)} disabled={deleting !== null}>Editar</Button><Popconfirm title="¿Eliminar este servicio?" description="Dejará de mostrarse en tu página pública." onConfirm={() => remove(service)} okText="Eliminar" cancelText="Cancelar"><Button danger icon={<DeleteOutlined />} loading={deleting === service.id} disabled={deleting !== null} aria-label={`Eliminar ${service.nombre}`}>Eliminar</Button></Popconfirm></div>
    </article>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Todavía no agregaste servicios." />)}
    <Modal className="tenant-service-modal" title={editing ? 'Editar servicio' : 'Agregar servicio'} open={open} forceRender onCancel={() => { if (!saving) setOpen(false); }} onOk={() => form.submit()} confirmLoading={saving} okText={editing ? 'Guardar cambios' : 'Agregar servicio'} cancelText="Cancelar" cancelButtonProps={{ disabled: saving }}>
      {formError && <Alert type="error" title={formError} showIcon style={{ marginBottom: 20 }} />}
      <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
        <Form.Item label="Nombre del servicio" name="nombre" rules={[{ required: true, whitespace: true, message: 'Ingresá el nombre del servicio' }, { max: 120 }]}><Input placeholder="Ej. Cambio de aceite y filtros" maxLength={120} /></Form.Item>
        <Form.Item label="Descripción (opcional)" name="descripcion" rules={[{ max: 1000 }]}><Input.TextArea rows={4} placeholder="Contá en qué consiste este servicio" maxLength={1000} showCount /></Form.Item>
      </Form>
    </Modal>
  </Card>;
}
