import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '../../../../../../lib/admin-session';

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await context.params;
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !['cover', 'profile'].includes(kind)) return new NextResponse(null, { status: 404 });
  try {
    const response = await fetch(`${API_URL}/api/lubricentros/${slug}/images/${kind}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) return new NextResponse(null, { status: response.status });
    if (!response.headers.get('content-type')?.startsWith('image/webp')) return new NextResponse(null, { status: 502 });
    return new NextResponse(await response.arrayBuffer(), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new NextResponse(null, { status: 503 }); }
}
