'use client';

import { Alert, Button, ConfigProvider, Form, Input } from 'antd';
import { ArrowLeftOutlined, CarOutlined, HistoryOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { normalizePlate } from '../../lib/customers';
import { sharedHistoryPath } from '../../lib/shared-history';
import './customer-access.css';

export default function CustomerAccess({ slug, nombre, error: initialError = '' }: { slug: string; nombre?: string; error?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function consult({ patente }: { patente: string }) {
    setLoading(true); setError('');
    const plate = normalizePlate(patente);
    try {
      const response = await fetch(`/api/history/vehicle/${encodeURIComponent(slug)}/${encodeURIComponent(plate)}`, { cache: 'no-store' });
      if (response.status === 404) { setError('No encontramos un historial para esa patente en este lubricentro. Revisá la patente o consultá al comercio.'); return; }
      if (!response.ok) throw new Error();
      router.push(sharedHistoryPath(slug, plate));
    } catch { setError('No pudimos consultar el historial. Intentá nuevamente en unos minutos.'); }
    finally { setLoading(false); }
  }

  return <ConfigProvider theme={{ token: { colorPrimary: '#155fa0', controlHeight: 48, borderRadius: 10, fontSize: 16, fontFamily: 'var(--font-geist-sans), Arial, sans-serif' } }}>
    <main className="customer-access-page">
      <Link href={`/${slug}`} className="customer-access-back"><ArrowLeftOutlined /> Volver al lubricentro</Link>
      <section className="customer-access-card" aria-labelledby="customer-access-title">
        <span className="customer-access-icon"><HistoryOutlined /></span>
        {nombre && <p className="customer-access-business">{nombre}</p>}
        <h1 id="customer-access-title">Historial de tu vehículo</h1>
        <p className="customer-access-intro">Ingresá la patente para ver los servicios realizados en este lubricentro.</p>
        {(initialError || error) && <Alert type={initialError ? 'warning' : 'error'} showIcon title={initialError || error} style={{ marginBottom: 24 }} />}
        <Form layout="vertical" onFinish={consult} requiredMark={false} disabled={loading || Boolean(initialError)}>
          <Form.Item name="patente" label="Patente del vehículo" getValueFromEvent={(event) => normalizePlate(event.target.value)} rules={[{ required: true, message: 'Ingresá la patente' }, { pattern: /^[A-Z0-9]{5,10}$/, message: 'Ingresá una patente válida, solo letras y números' }]}>
            <Input className="customer-access-plate" prefix={<CarOutlined />} placeholder="Ej. AB123CD o ABC123" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} />
          </Form.Item>
          <Button type="primary" block htmlType="submit" loading={loading} icon={<HistoryOutlined />}>Ver mi historial</Button>
        </Form>
        <p className="customer-access-hint">Solo necesitás la patente. No hace falta crear una cuenta.</p>
      </section>
    </main>
  </ConfigProvider>;
}
