'use client';

import { Alert, Button, Card, Form, Input } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Tenant } from '../../lib/tenant-session';

export default function LocationSettings({ slug, mapsUrl = '', onUpdate }: { slug: string; mapsUrl?: string; onUpdate: (tenant: Tenant) => void }) {
  const [form] = Form.useForm<{ mapsUrl: string }>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (!form.isFieldsTouched()) form.setFields([{ name: 'mapsUrl', value: mapsUrl, touched: false }]);
  }, [mapsUrl, form]);

  async function save(values: { mapsUrl: string }) {
    setSaving(true); setError(''); setSaved(false);
    try {
      const response = await fetch(`/api/tenant/${slug}/location`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapsUrl: values.mapsUrl?.trim() || '' }) });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); return; }
      if (!response.ok) throw new Error(data.message || 'No se pudo guardar la ubicación');
      onUpdate(data); form.setFields([{ name: 'mapsUrl', value: data.mapsUrl || '', touched: false }]); setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la ubicación'); }
    finally { setSaving(false); }
  }

  return <Card className="tenant-location-settings" title={<><EnvironmentOutlined /> Ubicación en Google Maps</>} style={{ marginBottom: 24 }}>
    <p style={{ color: '#718096', marginBottom: 16, lineHeight: 1.6 }}>Buscá tu lubricentro en Google Maps y elegí Compartir → Copiar enlace. Pegalo acá para que los clientes sepan cómo llegar.</p>
    {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
    {saved && <Alert type="success" showIcon title="Ubicación actualizada" style={{ marginBottom: 16 }} />}
    <Form form={form} layout="vertical" onFinish={save} initialValues={{ mapsUrl }} onValuesChange={() => setSaved(false)} disabled={saving}>
      <Form.Item name="mapsUrl" label="Enlace de Google Maps" extra="Dejá el campo vacío y guardá para ocultar la ubicación." rules={[{ max: 4096, message: 'El enlace es demasiado largo' }]}><Input allowClear inputMode="url" placeholder="https://maps.app.goo.gl/…" /></Form.Item>
      <Button type="primary" htmlType="submit" loading={saving} block>Guardar ubicación</Button>
    </Form>
  </Card>;
}
