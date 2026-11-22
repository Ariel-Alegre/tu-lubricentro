import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '../../../../lib/admin-session';

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return new NextResponse(null, { status: 404 });
  try {
    const response = await fetch(`${API_URL}/api/lubricentros/${slug}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    return NextResponse.json(await response.json(), { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ message: 'Servicio no disponible' }, { status: 503 }); }
}
