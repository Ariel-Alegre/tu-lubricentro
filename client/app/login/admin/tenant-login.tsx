'use client';
import { Alert, Button, ConfigProvider, Form, Input } from 'antd';
import { LockOutlined, MailOutlined, ShopOutlined, SafetyCertificateOutlined, SyncOutlined } from '@ant-design/icons';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import './tenant-login.css';

export default function TenantLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function login(values: { email: string; password: string }) {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/tenant/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const data = await response.json();
      if (!response.ok) { setError(data.message); return; }
      router.replace(`/${data.slug}/admin`); router.refresh();
    } catch { setError('No se pudo conectar con el servidor'); }
    finally { setLoading(false); }
  }
  return <ConfigProvider theme={{ token: { colorPrimary: '#155fa0', controlHeight: 52, borderRadius: 12, fontSize: 16, fontFamily: 'var(--font-geist-sans), Arial, sans-serif' } }}>
    <main className="tenant-access">
      <aside className="tenant-access-story">
        <div className="tenant-access-brand">
          <div className="tenant-access-logo"><Image src="/tu-lubricentro-logo.png" alt="" width={52} height={52} priority /></div>
          <div><strong>Tu Lubricentro</strong><span>Más cerca de tu negocio.</span></div>
        </div>
        <div className="tenant-access-pitch">
          <span className="tenant-access-pill"><ShopOutlined /> HECHO PARA TU COMERCIO</span>
          <h2>Todo tu lubricentro.<br /><em>Un solo lugar.</em></h2>
          <p>Un espacio propio para administrar tu comercio y tener su información siempre a mano.</p>
          <div className="tenant-access-benefits">
            <div><span><ShopOutlined /></span><div><strong>Tu espacio, tu identidad</strong><p>Un panel exclusivo para tu lubricentro.</p></div></div>
            <div><span><SafetyCertificateOutlined /></span><div><strong>Acceso personal</strong><p>Ingresá con las credenciales de tu comercio.</p></div></div>
            <div><span><SyncOutlined /></span><div><strong>Siempre conectado</strong><p>El estado de tu acceso se actualiza en tiempo real.</p></div></div>
          </div>
        </div>
        <div className="tenant-access-story-footer">La gestión de tu negocio empieza acá.</div>
      </aside>
      <section className="tenant-access-form-side" aria-labelledby="tenant-login-title">
        <div className="tenant-access-form-wrap">
          <div className="tenant-access-form-icon"><LockOutlined /></div>
          <span className="tenant-access-eyebrow">PANEL ADMINISTRATIVO</span>
          <h1 id="tenant-login-title">Bienvenido de nuevo</h1>
          <p className="tenant-access-intro">Ingresá tus datos y continuá con tu lubricentro.</p>
          {params.get('reason') === 'revoked' && <Alert className="tenant-access-alert" type="warning" showIcon title="Tu acceso fue desactivado o modificado. Volvé a ingresar si ya fue habilitado." />}
          {params.get('reason') === 'password-changed' && <Alert className="tenant-access-alert" type="success" showIcon title="La contraseña fue actualizada. Ingresá con tu nueva contraseña." />}
          {error && <Alert className="tenant-access-alert" type="error" showIcon title={error} />}
          <Form layout="vertical" onFinish={login} requiredMark={false}>
            <Form.Item label="Correo electrónico" name="email" rules={[{ required: true, type: 'email', message: 'Ingresá un correo válido' }]}>
              <Input prefix={<MailOutlined />} autoComplete="username" placeholder="nombre@tulubricentro.com" inputMode="email" />
            </Form.Item>
            <Form.Item label="Contraseña" name="password" rules={[{ required: true, message: 'Ingresá tu contraseña' }]}>
              <Input.Password prefix={<LockOutlined />} autoComplete="current-password" placeholder="Ingresá tu contraseña" />
            </Form.Item>
            <Button type="primary" block htmlType="submit" loading={loading}>Ingresar a mi panel</Button>
          </Form>
          <div className="tenant-access-security"><SafetyCertificateOutlined /><span>Acceso exclusivo para lubricentros habilitados</span></div>
          <div className="tenant-access-help"><strong>¿Necesitás ayuda para ingresar?</strong><p>Contactá al administrador de la plataforma para revisar o habilitar tu acceso.</p></div>
        </div>
        <footer className="tenant-access-footer">Tu Lubricentro <span>·</span> Administración de comercios</footer>
      </section>
    </main>
  </ConfigProvider>;
}
