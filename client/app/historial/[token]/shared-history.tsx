'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { io } from 'socket.io-client';
import { CalendarOutlined, CarOutlined, DashboardOutlined, HistoryOutlined, ShoppingOutlined } from '@ant-design/icons';
import type { SharedHistory } from '../../lib/shared-history';
import { sharedHistoryPath } from '../../lib/shared-history';
import { visitDate } from '../../lib/customers';
import './shared-history.css';

export default function SharedHistoryView({ token, slug, plate, initial, initialError, socketUrl }: { token?: string; slug?: string; plate?: string; initial: SharedHistory | null; initialError: string; socketUrl: string }) {
  const [history, setHistory] = useState(initial);
  const [error, setError] = useState(initialError);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!history) return;
    const canonical = sharedHistoryPath(history.slug, history.patente);
    if (window.location.pathname + window.location.search !== canonical) window.history.replaceState(null, '', canonical);
  }, [history]);
  useEffect(() => {
    let stopped = false; let running = false; let dirty = false; let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined; let reconnect: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const socket = io(`${socketUrl.replace(/\/$/, '')}/history`, { transports: ['websocket'], auth: token ? { token } : { slug, plate }, autoConnect: false });
    async function refresh() {
      dirty = true; if (running || stopped) return; running = true;
      try {
        while (dirty && !stopped) {
          dirty = false; const current = generation;
          const path = token ? token : `vehicle/${encodeURIComponent(slug!)}/${encodeURIComponent(plate!)}`;
          const response = await fetch(`/api/history/${path}`, { cache: 'no-store', signal: controller.signal });
          if (stopped || current !== generation) continue;
          if (response.status === 404) { setHistory(null); setError(''); continue; }
          if (!response.ok) throw new Error();
          const data: SharedHistory = await response.json();
          if (!stopped && current === generation) { setHistory(data); setError(''); }
        }
      } catch { if (!stopped) { setError('No pudimos actualizar el historial. Reintentando...'); clearTimeout(timer); timer = setTimeout(() => { void refresh(); }, 3000); } }
      finally { running = false; }
    }
    socket.on('history:ready', () => { clearTimeout(reconnect); void refresh(); });
    socket.on('history:changed', () => { generation++; void refresh(); });
    socket.on('connect_error', () => { void refresh(); clearTimeout(reconnect); reconnect = setTimeout(() => { if (!stopped) socket.connect(); }, 5000); });
    const focus = () => { void refresh(); }; window.addEventListener('focus', focus); socket.connect();
    return () => { stopped = true; clearTimeout(timer); clearTimeout(reconnect); controller.abort(); socket.disconnect(); window.removeEventListener('focus', focus); };
  }, [token, slug, plate, socketUrl, retry]);

  return <div className="shared-history-page">
    <header className="shared-history-topbar"><Image src="/tu-lubricentro-logo.png" width={36} height={36} alt="" /><strong>Tu Lubricentro</strong><span>Historial de servicios</span></header>
    <main className="shared-history-main">
      {error && <div className="shared-history-error" role="alert">{error}<button onClick={() => setRetry((value) => value + 1)}>Reintentar</button></div>}
      {!history ? <section className="shared-history-empty"><HistoryOutlined /><h1>Historial no disponible</h1><p>{error ? 'Estamos intentando conectar con el lubricentro.' : 'Consultá al lubricentro por el enlace de tu vehículo.'}</p></section> : <>
        <section className="shared-history-hero"><div className="shared-history-brand"><span><CarOutlined /></span><div><small>MI VEHÍCULO</small><h1>{history.patente}</h1><p>{[history.marca, history.modelo].filter(Boolean).join(' ') || 'Historial del vehículo'}</p></div></div><div className="shared-history-business"><span>Atendido en</span><Link href={`/${history.slug}`}>{history.lubricentro}</Link><small>{history.visitas.length} {history.visitas.length === 1 ? 'atención registrada' : 'atenciones registradas'}</small></div></section>
        <div className="shared-history-heading"><h2>Servicios realizados</h2><p>Las nuevas atenciones de este lubricentro aparecen en el mismo enlace.</p></div>
        {history.visitas.length ? <ol className="shared-history-visits">{history.visitas.map((visit, index) => <li key={visit.id}><div className="shared-history-date"><span><CalendarOutlined /><time dateTime={visit.fecha}>{visitDate(visit.fecha)}</time></span>{index === 0 && <small>Más reciente</small>}</div><h3>{visit.servicio}</h3>{visit.kilometraje !== null && <p className="shared-history-km"><DashboardOutlined />{visit.kilometraje.toLocaleString('es-AR')} km</p>}<h4><ShoppingOutlined /> Productos utilizados</h4><div className="shared-history-products">{visit.productos.length ? visit.productos.map((product) => <span key={product}>{product}</span>) : <p>No se utilizaron productos.</p>}</div></li>)}</ol> : <section className="shared-history-empty"><p>Todavía no hay servicios registrados para este vehículo.</p></section>}
        <p className="shared-history-footnote">Este historial corresponde a los servicios registrados por {history.lubricentro}.</p>
      </>}
    </main>
  </div>;
}
