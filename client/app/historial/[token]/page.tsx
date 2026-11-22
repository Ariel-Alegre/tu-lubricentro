import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { API_URL } from '../../lib/admin-session';
import SharedHistoryView from './shared-history';
import { sharedHistoryPath } from '../../lib/shared-history';
import { loadSharedHistory } from '../../lib/load-shared-history';

export const metadata = { title: 'Historial de servicios | Tu Lubricentro', robots: { index: false, follow: false }, referrer: 'no-referrer' };
async function History({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const { initial, error } = await loadSharedHistory(token);
  if (initial) redirect(sharedHistoryPath(initial.slug, initial.patente, token));
  return <SharedHistoryView token={token} initial={initial} initialError={error} socketUrl={process.env.SOCKET_PUBLIC_URL || API_URL} />;
}
export default function SharedHistoryPage(props: { params: Promise<{ token: string }> }) {
  return <Suspense fallback={<div className="dashboard-loading">Cargando historial...</div>}><History {...props} /></Suspense>;
}
