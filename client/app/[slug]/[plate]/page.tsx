import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { API_URL } from '../../lib/admin-session';
import { loadSharedHistory } from '../../lib/load-shared-history';
import { sharedHistoryPath } from '../../lib/shared-history';
import SharedHistoryView from '../../historial/[token]/shared-history';
import '../../historial/[token]/shared-history.css';

export const metadata = { title: 'Historial de servicios | Tu Lubricentro', robots: { index: false, follow: false }, referrer: 'no-referrer' };
type Props = { params: Promise<{ slug: string; plate: string }>; searchParams: Promise<{ clave?: string | string[] }> };
async function History({ params, searchParams }: Props) {
  const { slug, plate } = await params;
  const { clave } = await searchParams;
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^[a-zA-Z0-9]{5,10}$/.test(plate)) notFound();
  if (typeof clave !== 'string' || !/^[a-f0-9]{64}$/.test(clave)) return <div className="shared-history-page"><main className="shared-history-main"><section className="shared-history-empty"><h1>Acceso al historial</h1><p>Para consultar los servicios de este vehículo, escaneá el QR o abrí el enlace completo que te compartió el lubricentro.</p></section></main></div>;
  const { initial, error } = await loadSharedHistory(clave);
  // La clave identifica un solo vehículo. El nombre de la ruta siempre refleja ese registro.
  if (initial && (initial.slug !== slug || initial.patente !== plate)) redirect(sharedHistoryPath(initial.slug, initial.patente, clave));
  return <SharedHistoryView key={clave} token={clave} initial={initial} initialError={error} socketUrl={process.env.SOCKET_PUBLIC_URL || API_URL} />;
}
export default function VehicleHistoryPage(props: Props) {
  return <Suspense fallback={<div className="dashboard-loading">Cargando historial...</div>}><History {...props} /></Suspense>;
}
