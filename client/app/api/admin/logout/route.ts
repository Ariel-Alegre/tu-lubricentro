import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE } from '../../../lib/admin-session';

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ message: 'Origen inválido' }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
