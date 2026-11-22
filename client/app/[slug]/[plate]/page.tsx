import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { API_URL } from '../../lib/admin-session';
import { loadSharedHistory } from '../../lib/load-shared-history';
import { sharedHistoryPath } from '../../lib/shared-history';
import SharedHistoryView from '../../historial/[token]/shared-history';
import '../../historial/[token]/shared-history.css';

export const metadata = { title: 'Historial de servicios | Tu Lubricentro', robots: { index: false, follow: false }, referrer: 'no-referrer' };
type Props = { params: Promise<{ slug: string; plate: string }> };
async function History({ params }: Props) {
  const { slug, plate } = await params;
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^[a-zA-Z0-9]{5,10}$/.test(plate)) notFound();
  const { initial, error } = await loadSharedHistory({ slug, plate: plate.toUpperCase() });
  if (initial && initial.patente !== plate) redirect(sharedHistoryPath(initial.slug, initial.patente));
  return <SharedHistoryView key={`${slug}:${plate}`} slug={slug} plate={plate.toUpperCase()} initial={initial} initialError={error} socketUrl={process.env.SOCKET_PUBLIC_URL || API_URL} />;
}
export default function VehicleHistoryPage(props: Props) {
  return <Suspense fallback={<div className="dashboard-loading">Cargando historial...</div>}><History {...props} /></Suspense>;
}
