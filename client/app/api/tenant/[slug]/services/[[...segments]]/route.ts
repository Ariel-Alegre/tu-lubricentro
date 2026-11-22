import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '../../../../../lib/admin-session';
import { tenantCookie } from '../../../../../lib/tenant-session';

async function handle(request: NextRequest, context: { params: Promise<{ slug: string; segments?: string[] }> }) {
  const { slug, segments = [] } = await context.params;
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return NextResponse.json({ message: 'Dirección inválida' }, { status: 400 });
  if (request.method !== 'GET' && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ message: 'Origen inválido' }, { status: 403 });
  if (!((!segments.length && ['GET', 'POST'].includes(request.method)) || (segments.length === 1 && /^[0-9a-f-]{36}$/i.test(segments[0]) && ['PUT', 'DELETE'].includes(request.method)))) return NextResponse.json({ message: 'Ruta inválida' }, { status: 400 });
  const token = request.cookies.get(tenantCookie(slug))?.value;
  if (!token) return NextResponse.json({ message: 'Iniciá sesión' }, { status: 401 });
  try {
    const response = await fetch(`${API_URL}/api/tenant/${slug}/services${segments.length ? '/' + segments[0] : ''}`, {
      method: request.method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: ['POST', 'PUT'].includes(request.method) ? JSON.stringify(await request.json()) : undefined,
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      return NextResponse.json({ message: 'La gestión de servicios no está disponible por el momento. Contactá al administrador de la plataforma.' }, { status: 503 });
    }
    return NextResponse.json(await response.json(), { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ message: 'No se pudo conectar con el servidor' }, { status: 503 }); }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
