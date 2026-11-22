import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '../../../../../lib/admin-session';
import { tenantCookie } from '../../../../../lib/tenant-session';

async function handle(request: NextRequest, context: { params: Promise<{ slug: string; segments?: string[] }> }) {
  const { slug, segments = [] } = await context.params;
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return NextResponse.json({ message: 'Dirección inválida' }, { status: 400 });
  if (request.method !== 'GET' && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ message: 'Origen inválido' }, { status: 403 });
  const id = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const valid = !segments.length || (request.method === 'GET' && segments.length === 2 && ((segments[0] === 'plate' && /^[A-Za-z0-9 -]{5,20}$/.test(segments[1])) || (segments[0] === 'vehicles' && id(segments[1])))) || (request.method === 'POST' && segments.length === 3 && segments[0] === 'vehicles' && id(segments[1]) && segments[2] === 'visits');
  const payment = request.method === 'POST' && segments.length === 5 && segments[0] === 'vehicles' && id(segments[1]) && segments[2] === 'visits' && id(segments[3]) && segments[4] === 'payment';
  if (!valid && !payment) return NextResponse.json({ message: 'Ruta inválida' }, { status: 400 });
  const token = request.cookies.get(tenantCookie(slug))?.value;
  if (!token) return NextResponse.json({ message: 'Iniciá sesión' }, { status: 401 });
  try {
    const response = await fetch(`${API_URL}/api/tenant/${slug}/customers${segments.length ? '/' + segments.map(encodeURIComponent).join('/') : ''}`, {
      method: request.method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: request.method === 'POST' ? JSON.stringify(await request.json()) : undefined, cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('No disponible');
    return NextResponse.json(await response.json(), { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ message: 'No se pudo conectar con el servidor' }, { status: 503 }); }
}
export const GET = handle;
export const POST = handle;
