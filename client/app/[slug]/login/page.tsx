import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { API_URL } from '../../lib/admin-session';
import CustomerAccess from './customer-access';
export const metadata = { title: 'Consultar mi historial | Tu Lubricentro', robots: { index: false, follow: false } };

async function Login({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/lubricentros/${encodeURIComponent(slug)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  } catch {
    return <CustomerAccess slug={slug} error="No pudimos conectar con el lubricentro. Reintentá en unos minutos." />;
  }
  if (response.status === 404) notFound();
  if (!response.ok) return <CustomerAccess slug={slug} error="No pudimos cargar el lubricentro. Reintentá en unos minutos." />;
  const business: { nombre: string } = await response.json();
  return <CustomerAccess slug={slug} nombre={business.nombre} />;
}

export default function LoginPage(props: { params: Promise<{ slug: string }> }) {
  return <Suspense fallback={<div className="dashboard-loading">Cargando acceso...</div>}><Login {...props} /></Suspense>;
}
