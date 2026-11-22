import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, API_URL } from '../../../../lib/admin-session';

async function proxy(request: NextRequest, context: { params: Promise<{ segments?: string[] }> }) {
  if (request.method !== 'GET' && request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ message: 'Origen inválido' }, { status: 403 });
  }
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return NextResponse.json({ message: 'Iniciá sesión' }, { status: 401 });
  const { segments = [] } = await context.params;
  if (segments.length && !(request.method === 'PATCH' && segments.length === 2 && segments[1] === 'estado') && !(request.method === 'PUT' && segments.length === 1)) {
    return NextResponse.json({ message: 'Ruta inválida' }, { status: 404 });
  }
  try {
    const response = await fetch(`${API_URL}/api/admin/lubricentros${segments.length ? '/' + segments.map(encodeURIComponent).join('/') : ''}`, {
      method: request.method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: request.method === 'GET' ? undefined : JSON.stringify(await request.json()),
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ message: 'El servidor todavía no tiene disponible el registro de lubricentros. Actualizá el despliegue.' }, { status: 503 });
    }
    return NextResponse.json(await response.json(), { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ message: 'No se pudo conectar con el servidor' }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
