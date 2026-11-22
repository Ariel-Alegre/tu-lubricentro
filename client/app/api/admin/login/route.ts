import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, API_URL } from '../../../lib/admin-session';

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ message: 'Origen inválido' }, { status: 403 });
  }
  try {
    const { email, password } = await request.json();
    const response = await fetch(`${API_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return NextResponse.json({ message: response.status === 401 ? 'Correo o contraseña incorrectos' : 'No se pudo iniciar sesión' }, { status: response.status });
    }
    const { token } = await response.json();
    const result = NextResponse.json({ ok: true });
    result.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 400,
    });
    return result;
  } catch {
    return NextResponse.json({ message: 'No se pudo conectar con el servidor' }, { status: 503 });
  }
}
