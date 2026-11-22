import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { API_URL } from '../lib/admin-session';
import BusinessProfile from './business-profile';
import type { Product } from '../lib/products';
import './lubricentro.css';

type Comercio = { nombre: string; slug: string; telefono: string; direccion: string; ciudad: string; provincia: string; hasCover?: boolean; hasProfile?: boolean; services?: { id: string; nombre: string; descripcion: string }[]; products?: Product[] };

async function Lubricentro({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/lubricentros/${encodeURIComponent(slug)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  } catch {
    return <main className="lubricentro-site"><section><h1>No pudimos cargar el lubricentro</h1><p>Intentá nuevamente en unos minutos.</p></section></main>;
  }
  if (response.status === 404) notFound();
  if (!response.ok) return <main className="lubricentro-site"><section><h1>Servicio temporalmente no disponible</h1><p>Intentá nuevamente en unos minutos.</p></section></main>;
  const comercio: Comercio = await response.json();
  return <BusinessProfile comercio={comercio} />;
}

export default function LubricentroPage(props: { params: Promise<{ slug: string }> }) {
  return <Suspense fallback={<div className="dashboard-loading">Cargando lubricentro...</div>}><Lubricentro {...props} /></Suspense>;
}
