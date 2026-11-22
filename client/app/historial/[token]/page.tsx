import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { API_URL } from '../../lib/admin-session';
import SharedHistoryView from './shared-history';
import type { SharedHistory } from '../../lib/shared-history';

export const metadata = { title: 'Historial de servicios | Tu Lubricentro', robots: { index: false, follow: false }, referrer: 'no-referrer' };
async function History({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  let initial: SharedHistory | null = null;
  let error = '';
  try {
    const response = await fetch(`${API_URL}/api/history/${token}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (response.ok) initial = await response.json();
    else if (response.status !== 404) error = 'No se pudo cargar el historial. Reintentá en unos instantes.';
  } catch { error = 'No se pudo cargar el historial. Reintentá en unos instantes.'; }
  return <SharedHistoryView token={token} initial={initial} initialError={error} socketUrl={process.env.SOCKET_PUBLIC_URL || API_URL} />;
}
export default function SharedHistoryPage(props: { params: Promise<{ token: string }> }) {
  return <Suspense fallback={<div className="dashboard-loading">Cargando historial...</div>}><History {...props} /></Suspense>;
}
