import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '../../../../../lib/admin-session';
export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string; plate: string }> }) {
  const { slug, plate } = await context.params;
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^[a-z0-9]{5,10}$/i.test(plate)) return NextResponse.json({ message: 'Historial no disponible' }, { status: 404, headers });
  try {
    const response = await fetch(`${API_URL}/api/history/vehicle/${slug}/${plate.toUpperCase()}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    return NextResponse.json(await response.json(), { status: response.status, headers });
  } catch { return NextResponse.json({ message: 'No se pudo consultar el historial' }, { status: 503, headers }); }
}
