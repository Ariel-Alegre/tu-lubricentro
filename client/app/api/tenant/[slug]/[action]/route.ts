import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '../../../../lib/admin-session';
import { tenantCookie } from '../../../../lib/tenant-session';

async function handle(request: NextRequest, context: { params: Promise<{ slug: string; action: string }> }) {
  const { slug, action } = await context.params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 63) return NextResponse.json({ message: 'Dirección inválida' }, { status: 400 });
  if (!(request.method === 'GET' && action === 'session') && !(request.method === 'POST' && ['login', 'logout', 'socket', 'password'].includes(action))) {
    return NextResponse.json({ message: 'Ruta inválida' }, { status: 405 });
  }
  if (request.method === 'POST' && request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ message: 'Origen inválido' }, { status: 403 });
  }
  const name = tenantCookie(slug);
  const token = request.cookies.get(name)?.value;
  const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
  if (action === 'logout') {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(name, '', { ...options, maxAge: 0 });
    return response;
  }
  if (action !== 'login' && !token) return NextResponse.json({ message: 'Iniciá sesión' }, { status: 401 });
  try {
    const response = await fetch(`${API_URL}/api/tenant/${encodeURIComponent(slug)}/${action}`, {
      method: request.method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: action === 'login' || action === 'password' ? JSON.stringify(await request.json()) : undefined,
      cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Backend no disponible');
    const data = await response.json();
    if (!response.ok) {
      const result = NextResponse.json({ message: data.message || 'No se pudo validar el acceso' }, { status: response.status });
      if (response.status === 401 || response.status === 403) result.cookies.set(name, '', { ...options, maxAge: 0 });
      return result;
    }
    if (action === 'login') {
      const result = NextResponse.json({ ok: true });
      result.cookies.set(name, data.token, { ...options, maxAge: 60 * 60 * 24 * 400 });
      return result;
    }
    if (action === 'password') {
      const result = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
      result.cookies.set(name, '', { ...options, maxAge: 0 });
      return result;
    }
    return NextResponse.json(action === 'socket' ? { ticket: data.ticket, url: process.env.SOCKET_PUBLIC_URL || API_URL } : data, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ message: 'El servidor no está disponible. Intentá nuevamente.' }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
