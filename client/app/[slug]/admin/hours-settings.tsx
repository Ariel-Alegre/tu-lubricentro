'use client';

import { Alert, Button, Checkbox, Form, Input } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { weekDays, type OpeningDay } from '../../lib/opening-hours';
import type { Tenant } from '../../lib/tenant-session';
import './hours-settings.css';

type Values = { openingHours: OpeningDay[] };
function prepare(openingHours: OpeningDay[]): Values {
  return { openingHours: weekDays.map(({ key }) => {
    const day = openingHours.find((item) => item.day === key);
    return { day: key, closed: day?.closed ?? true, ranges: day?.ranges.length ? day.ranges : [{ from: '09:00', to: '18:00' }] };
  }) };
}

export default function HoursSettings({ tenant, onUpdate }: { tenant: Pick<Tenant, 'slug' | 'openingHours' | 'temporarilyClosed'>; onUpdate: (tenant: Tenant) => void }) {
  const [form] = Form.useForm<Values>();
  const dirty = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [changingAvailability, setChangingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const router = useRouter();
  useEffect(() => {
    if (!dirty.current) form.setFieldsValue(prepare(tenant.openingHours || []));
  }, [form, tenant.openingHours]);

  async function changeAvailability() {
    setChangingAvailability(true); setAvailabilityError('');
    try {
      const response = await fetch(`/api/tenant/${tenant.slug}/availability`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ temporarilyClosed: !tenant.temporarilyClosed }) });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); return; }
      if (!response.ok) throw new Error(data.message || 'No se pudo actualizar el estado');
      onUpdate(data);
    } catch (cause) { setAvailabilityError(cause instanceof Error ? cause.message : 'No se pudo actualizar el estado'); }
    finally { setChangingAvailability(false); }
  }

  async function save(values: Values) {
    setSaving(true); setError(''); setSaved(false);
    try {
      const openingHours = values.openingHours.map((day, index) => ({ day: weekDays[index].key, closed: day.closed, ranges: day.closed ? [] : day.ranges }));
      const response = await fetch(`/api/tenant/${tenant.slug}/hours`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ openingHours }) });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); return; }
      if (!response.ok) throw new Error(data.message || 'No se pudieron guardar los horarios');
      dirty.current = false; form.setFieldsValue(prepare(data.openingHours)); onUpdate(data); setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los horarios'); }
    finally { setSaving(false); }
  }

  return <div className="tenant-hours-settings">
    <h3>Días y horarios de atención</h3>
    <p>Indicá qué días atendés. Podés agregar hasta tres franjas por día, por ejemplo, mañana y tarde. El estado Abierto/Cerrado se actualiza automáticamente según estos horarios y la hora de Argentina.</p>
    <div className="tenant-hours-availability">
      <strong>{tenant.temporarilyClosed ? 'Cerrado por el comercio' : 'Estado automático según tus horarios'}</strong>
      <p>{tenant.temporarilyClosed ? 'Se mostrará Cerrado hasta que vuelvas al horario automático. Tus horarios se conservan.' : 'Si necesitás cerrar antes o no atender hoy, podés mostrar Cerrado inmediatamente.'}</p>
      {availabilityError && <Alert type="error" showIcon title={availabilityError} />}
      <Button className="tenant-availability-button" danger={!tenant.temporarilyClosed} type={tenant.temporarilyClosed ? 'primary' : 'default'} onClick={changeAvailability} loading={changingAvailability} disabled={saving}>{tenant.temporarilyClosed ? 'Volver al horario automático' : 'Cerrar ahora'}</Button>
    </div>
    {error && <Alert type="error" showIcon title={error} />}
    {saved && <Alert type="success" showIcon title="Horarios actualizados" />}
    <Form form={form} layout="vertical" initialValues={prepare(tenant.openingHours || [])} onFinish={save} onValuesChange={() => { dirty.current = true; setSaved(false); }} disabled={saving || changingAvailability} requiredMark={false}>
      <div className="tenant-hours-week">{weekDays.map(({ key, label }, index) => <section className="tenant-hours-day" key={key} data-day={key} aria-label={`Horarios del ${label}`}>
        <div className="tenant-hours-day-heading"><strong>{label}</strong><Form.Item name={['openingHours', index, 'closed']} valuePropName="checked" noStyle><Checkbox>No atiende</Checkbox></Form.Item></div>
        <Form.Item noStyle shouldUpdate={(before, after) => before.openingHours?.[index]?.closed !== after.openingHours?.[index]?.closed}>
          {({ getFieldValue }) => !getFieldValue(['openingHours', index, 'closed']) && <Form.List name={['openingHours', index, 'ranges']}>
            {(fields, { add, remove }) => <>
              {fields.map((field) => <div className="tenant-hours-range" key={field.key}>
                <Form.Item name={[field.name, 'from']} label="Desde" rules={[{ required: true, message: 'Ingresá la apertura' }]}><Input type="time" aria-label={`${label}: apertura ${field.name + 1}`} /></Form.Item>
                <Form.Item name={[field.name, 'to']} label="Hasta" rules={[{ required: true, message: 'Ingresá el cierre' }]}><Input type="time" aria-label={`${label}: cierre ${field.name + 1}`} /></Form.Item>
                <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Quitar horario ${field.name + 1} del ${label}`} onClick={() => remove(field.name)} />
              </div>)}
              <Button type="dashed" icon={<PlusOutlined />} disabled={saving || fields.length >= 3} onClick={() => add({ from: '', to: '' })}>Agregar horario</Button>
            </>}
          </Form.List>}
        </Form.Item>
      </section>)}</div>
      <Button type="primary" htmlType="submit" loading={saving} block>Guardar horarios</Button>
    </Form>
  </div>;
}
