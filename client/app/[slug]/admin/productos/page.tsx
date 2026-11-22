import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getTenant } from '../../../lib/tenant-session';
import TenantPanel from '../tenant-panel';

export const metadata = { title: 'Mis productos | Tu Lubricentro' };

async function Products({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  const tenant = await getTenant(slug);
  if (!tenant) redirect('/login/admin');
  return <TenantPanel tenant={tenant} view="products" />;
}
export default function ProductsPage(props: { params: Promise<{ slug: string }> }) {
  return <Suspense fallback={<div className="dashboard-loading">Cargando productos...</div>}><Products {...props} /></Suspense>;
}
