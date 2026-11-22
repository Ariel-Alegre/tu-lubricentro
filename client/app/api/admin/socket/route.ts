import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, API_URL } from '../../../lib/admin-session';
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ message: 'Origen inválido' }, { status: 403 });
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return NextResponse.json({ message: 'Iniciá sesión' }, { status: 401 });
  try {
    const response = await fetch(`${API_URL}/api/admin/socket`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    return NextResponse.json(response.ok ? { ticket: data.ticket, url: process.env.SOCKET_PUBLIC_URL || API_URL } : data, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ message: 'No se pudo conectar con el servidor' }, { status: 503 }); }
}
