import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '../../../lib/admin-session';
import { tenantCookie } from '../../../lib/tenant-session';

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ message: 'Origen inválido' }, { status: 403 });
  try {
    const { email, password } = await request.json();
    const response = await fetch(`${API_URL}/api/tenant/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
      cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Servicio no disponible');
    const data = await response.json();
    if (!response.ok) return NextResponse.json({ message: data.message || 'No se pudo iniciar sesión' }, { status: response.status });
    if (typeof data.slug !== 'string' || data.slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug) || typeof data.token !== 'string') throw new Error('Respuesta inválida');
    const result = NextResponse.json({ ok: true, slug: data.slug });
    result.cookies.set(tenantCookie(data.slug), data.token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 400,
    });
    return result;
  } catch {
    return NextResponse.json({ message: 'El servidor no está disponible. Intentá nuevamente.' }, { status: 503 });
  }
}
