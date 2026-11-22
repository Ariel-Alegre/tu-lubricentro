'use client';

import { Alert, Form, Input, Modal } from 'antd';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Values = { currentPassword: string; newPassword: string; confirmPassword: string };

export default function ChangePassword({ slug, open, onClose }: { slug: string; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  function close() {
    if (saving) return;
    form.resetFields(); setError(''); onClose();
  }

  async function save({ currentPassword, newPassword }: Values) {
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/tenant/${slug}/password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) {
        router.replace('/login/admin?reason=revoked'); router.refresh(); return;
      }
      if (!response.ok) throw new Error(data.message || 'No se pudo cambiar la contraseña');
      form.resetFields(); onClose();
      router.replace('/login/admin?reason=password-changed'); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cambiar la contraseña'); }
    finally { setSaving(false); }
  }

  return <Modal className="tenant-password-modal" title="Cambiar contraseña" open={open} forceRender onCancel={close} onOk={() => form.submit()} okText="Guardar contraseña" cancelText="Cancelar" confirmLoading={saving} cancelButtonProps={{ disabled: saving }} closable={!saving} mask={{ closable: !saving }}>
    <p style={{ color: '#718096', marginBottom: 20 }}>Al guardar se cerrarán las sesiones abiertas de este lubricentro. Volvé a ingresar con tu nueva contraseña.</p>
    {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 20 }} />}
    <Form form={form} layout="vertical" onFinish={save} requiredMark={false} disabled={saving}>
      <Form.Item name="currentPassword" label="Contraseña actual" rules={[{ required: true, message: 'Ingresá tu contraseña actual' }]}><Input.Password autoComplete="current-password" maxLength={128} /></Form.Item>
      <Form.Item name="newPassword" label="Nueva contraseña" rules={[{ required: true, message: 'Ingresá la nueva contraseña' }, { min: 6, max: 128, message: 'Usá entre 6 y 128 caracteres' }]}><Input.Password autoComplete="new-password" maxLength={128} placeholder="Mínimo 6 caracteres" /></Form.Item>
      <Form.Item name="confirmPassword" label="Confirmar nueva contraseña" dependencies={['newPassword']} rules={[{ required: true, message: 'Repetí la nueva contraseña' }, ({ getFieldValue }) => ({ validator(_, value) { return !value || value === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('Las contraseñas no coinciden')); } })]}><Input.Password autoComplete="new-password" maxLength={128} /></Form.Item>
    </Form>
  </Modal>;
}
