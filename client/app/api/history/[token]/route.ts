import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '../../../lib/admin-session';
export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };
  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ message: 'Historial no disponible' }, { status: 404, headers });
  try {
    const response = await fetch(`${API_URL}/api/history/${token}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    return NextResponse.json(await response.json(), { status: response.status, headers });
  } catch { return NextResponse.json({ message: 'No se pudo consultar el historial' }, { status: 503, headers }); }
}
