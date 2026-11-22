import { Suspense, type ReactNode } from 'react';
import { redirect, notFound } from 'next/navigation';
import { getTenant } from '../../lib/tenant-session';
import TenantPanel from './tenant-panel';

type Props = { children: ReactNode; params: Promise<{ slug: string }> };
async function ProtectedLayout({ children, params }: Props) {
  const { slug } = await params;
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  const tenant = await getTenant(slug);
  if (!tenant) redirect('/login/admin');
  return <TenantPanel key={tenant.id} tenant={tenant}>{children}</TenantPanel>;
}
export default function AdminLayout(props: Props) {
  return <Suspense fallback={<div className="dashboard-loading">Verificando acceso...</div>}><ProtectedLayout {...props} /></Suspense>;
}
