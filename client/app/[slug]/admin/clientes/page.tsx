import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getTenant } from '../../../lib/tenant-session';
import TenantPanel from '../tenant-panel';

export const metadata = { title: 'Clientes e historial | Tu Lubricentro' };
async function Customers({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  const tenant = await getTenant(slug);
  if (!tenant) redirect('/login/admin');
  return <TenantPanel tenant={tenant} view="customers" />;
}
export default function CustomersPage(props: { params: Promise<{ slug: string }> }) {
  return <Suspense fallback={<div className="dashboard-loading">Cargando clientes...</div>}><Customers {...props} /></Suspense>;
}
