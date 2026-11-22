'use client';

import { Alert, Button, Card, ConfigProvider, Form, Input } from 'antd';
import { LockOutlined, ShopOutlined, UserOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import './login.css';

export default function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function login(values: { email: string; password: string }) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.message); return; }
      router.replace('/');
      router.refresh();
    } catch { setError('No se pudo conectar. Intentá nuevamente.'); }
    finally { setLoading(false); }
  }

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#155fa0', controlHeight: 44, borderRadius: 10 } }}>
      <main className="admin-login">
        <Card className="admin-login-card">
          <div className="admin-login-brand"><ShopOutlined /></div>
          <h1>Tu Lubricentro</h1>
          <p>Ingresá al panel raíz</p>
          {error && <Alert type="error" showIcon title={error} className="admin-login-error" />}
          <Form layout="vertical" onFinish={login} requiredMark={false}>
            <Form.Item label="Correo electrónico" name="email" rules={[{ required: true, message: 'Ingresá tu correo' }, { type: 'email', message: 'Ingresá un correo válido' }]}>
              <Input prefix={<UserOutlined />} autoComplete="username" placeholder="Correo electrónico" />
            </Form.Item>
            <Form.Item label="Contraseña" name="password" rules={[{ required: true, message: 'Ingresá tu contraseña' }]}>
              <Input.Password prefix={<LockOutlined />} autoComplete="current-password" placeholder="Contraseña" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>Ingresar</Button>
          </Form>
        </Card>
      </main>
    </ConfigProvider>
  );
}
