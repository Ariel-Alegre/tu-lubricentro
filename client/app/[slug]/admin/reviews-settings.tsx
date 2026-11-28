'use client';

import { Alert, Button, Card, Form, Input } from 'antd';
import { StarOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Tenant } from '../../lib/tenant-session';

export default function ReviewsSettings({ slug, reviewsUrl = '', onUpdate }: { slug: string; reviewsUrl?: string; onUpdate: (tenant: Tenant) => void }) {
  const [form] = Form.useForm<{ reviewsUrl: string }>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!form.isFieldsTouched()) form.setFields([{ name: 'reviewsUrl', value: reviewsUrl, touched: false }]);
  }, [reviewsUrl, form]);

  async function save(values: { reviewsUrl: string }) {
    setSaving(true); setError(''); setSaved(false);
    try {
      const response = await fetch(`/api/tenant/${slug}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewsUrl: values.reviewsUrl?.trim() || '' }) });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); return; }
      if (!response.ok) throw new Error(data.message || 'No se pudo guardar el enlace');
      onUpdate(data);
      form.setFields([{ name: 'reviewsUrl', value: data.reviewsUrl || '', touched: false }]);
      setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el enlace'); }
    finally { setSaving(false); }
  }

  return <Card className="tenant-reviews-settings" title={<><StarOutlined /> Reseñas de Google</>} style={{ marginBottom: 24 }}>
    <p style={{ color: '#718096', marginBottom: 16, lineHeight: 1.6 }}>Pegá el enlace para recibir reseñas de tu comercio. Se mostrará en tu perfil público y en el historial de los clientes. Dejalo vacío y guardá para ocultarlo.</p>
    {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
    {saved && <Alert type="success" showIcon title="Enlace actualizado" style={{ marginBottom: 16 }} />}
    <Form form={form} layout="vertical" onFinish={save} initialValues={{ reviewsUrl }} onValuesChange={() => setSaved(false)} disabled={saving}>
      <Form.Item name="reviewsUrl" label="Enlace de reseñas de Google" rules={[{ max: 2048, message: 'El enlace es demasiado largo' }]}>
        <Input allowClear inputMode="url" placeholder="https://g.page/r/…/review" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={saving} block>Guardar enlace</Button>
    </Form>
  </Card>;
}
