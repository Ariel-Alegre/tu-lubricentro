import { Suspense } from 'react';
import { redirect, notFound } from 'next/navigation';
import { getTenant } from '../../lib/tenant-session';
import TenantPanel from './tenant-panel';
export const metadata = { title: 'Mi panel administrativo | Tu Lubricentro' };

async function ProtectedPanel({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  const tenant = await getTenant(slug);
  if (!tenant) redirect('/login/admin');
  return <TenantPanel tenant={tenant} />;
}

export default function PanelPage(props: { params: Promise<{ slug: string }> }) {
  return <Suspense fallback={<div className="dashboard-loading">Verificando acceso...</div>}><ProtectedPanel {...props} /></Suspense>;
}
