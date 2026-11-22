import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '../../../../../lib/admin-session';
import { tenantCookie } from '../../../../../lib/tenant-session';

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await context.params;
  if (request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ message: 'Origen inválido' }, { status: 403 });
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !['cover', 'profile'].includes(kind)) return NextResponse.json({ message: 'Ruta inválida' }, { status: 400 });
  const token = request.cookies.get(tenantCookie(slug))?.value;
  if (!token) return NextResponse.json({ message: 'Iniciá sesión' }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024) return NextResponse.json({ message: 'Seleccioná una imagen de hasta 5 MB' }, { status: 400 });
    const body = new FormData(); body.append('image', file);
    const response = await fetch(`${API_URL}/api/tenant/${slug}/images/${kind}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body, cache: 'no-store', signal: AbortSignal.timeout(30000) });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ message: 'No se pudo subir la imagen. Intentá nuevamente.' }, { status: 503 }); }
}
