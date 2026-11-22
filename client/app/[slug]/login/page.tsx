import { Suspense } from 'react';
import { redirect, notFound } from 'next/navigation';
import { getTenant } from '../../lib/tenant-session';
export const metadata = { title: 'Ingresar a mi lubricentro | Tu Lubricentro' };

async function Login({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  if (await getTenant(slug)) redirect(`/${slug}/admin`);
  return redirect('/login/admin');
}

export default function LoginPage(props: { params: Promise<{ slug: string }> }) {
  return <Suspense fallback={<div className="dashboard-loading">Cargando acceso...</div>}><Login {...props} /></Suspense>;
}
