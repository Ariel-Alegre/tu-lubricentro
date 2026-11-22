'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Modal, QRCode, Spin } from 'antd';
import { CheckOutlined, CopyOutlined, DownloadOutlined, QrcodeOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import './customer-history-qr.css';

export default function CustomerHistoryQR({ slug, vehicleId, plate, open, onClose }: { slug: string; vehicleId: string; plate: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [retry, setRetry] = useState(0);
  const qr = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/tenant/${slug}/customers/vehicles/${vehicleId}/share`, { method: 'POST', signal: controller.signal, cache: 'no-store' }).then(async (response) => {
      if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); }
      const data = await response.json();
      if (!response.ok || !/^[a-f0-9]{64}$/.test(data.token)) throw new Error(data.message || 'No se pudo generar el QR');
      if (!controller.signal.aborted) { setLink(`${window.location.origin}/historial/${data.token}`); setError(''); }
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message || 'No se pudo generar el QR'); });
    return () => controller.abort();
  }, [slug, vehicleId, open, retry, router]);
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { setError('No se pudo copiar. Podés seleccionar y copiar el enlace que aparece debajo del QR.'); }
  }
  function download() {
    try {
      const source = qr.current?.querySelector('canvas'); if (!source) return;
      const canvas = document.createElement('canvas'); canvas.width = source.width + 48; canvas.height = source.height + 48;
      const context = canvas.getContext('2d'); if (!context) throw new Error();
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(source, 24, 24);
      const anchor = document.createElement('a'); anchor.href = canvas.toDataURL('image/png'); anchor.download = `historial-${plate}.png`; anchor.click();
    } catch { setError('No se pudo descargar el QR. Intentá nuevamente.'); }
  }
  return <Modal className="customer-qr-modal" title={<span><QrcodeOutlined /> QR del historial del cliente</span>} open={open} onCancel={onClose} footer={<Button onClick={onClose}>Volver al historial</Button>} centered width={440}>
    <div className="customer-qr-intro"><strong>{plate}</strong><p>El cliente escanea este código y ve los servicios realizados en tu lubricentro, sin iniciar sesión.</p></div>
    {error && <Alert type="warning" showIcon title={error} action={!link ? <Button onClick={() => setRetry((value) => value + 1)}>Reintentar</Button> : undefined} />}
    {link ? <><div className="customer-qr-code" ref={qr}><QRCode value={link} size={256} type="canvas" errorLevel="M" /></div><div className="customer-qr-actions"><Button type="primary" icon={<DownloadOutlined />} onClick={download}>Descargar QR</Button><Button icon={copied ? <CheckOutlined /> : <CopyOutlined />} onClick={copy}>{copied ? 'Copiado' : 'Copiar enlace'}</Button></div><Input.TextArea aria-label="Enlace del historial del cliente" readOnly autoSize={{ minRows: 2, maxRows: 3 }} value={link} onFocus={(event) => event.target.select()} /><p className="customer-qr-note">Quien tenga este QR puede consultar los servicios de este vehículo. El enlace incluye las próximas atenciones; no hace falta generar otro QR.</p></> : !error && <div className="customer-qr-loading"><Spin description="Generando QR..." /></div>}
  </Modal>;
}
