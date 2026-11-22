import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '../../../../../../../lib/admin-session';

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await context.params;
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });
  try {
    const response = await fetch(`${API_URL}/api/lubricentros/${slug}/products/${id}/image`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) return new NextResponse(null, { status: response.status });
    if (!response.headers.get('content-type')?.startsWith('image/webp')) return new NextResponse(null, { status: 502 });
    return new NextResponse(await response.arrayBuffer(), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new NextResponse(null, { status: 503 }); }
}
