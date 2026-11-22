import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '../../../../../../lib/admin-session';
import { tenantCookie } from '../../../../../../lib/tenant-session';

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await context.params;
  if (request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ message: 'Origen inválido' }, { status: 403 });
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: 'Ruta inválida' }, { status: 400 });
  const token = request.cookies.get(tenantCookie(slug))?.value;
  if (!token) return NextResponse.json({ message: 'Iniciá sesión' }, { status: 401 });
  try {
    const form = await request.formData(); const file = form.get('image');
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024) return NextResponse.json({ message: 'Seleccioná una foto de hasta 5 MB' }, { status: 400 });
    const body = new FormData(); body.append('image', file);
    const response = await fetch(`${API_URL}/api/tenant/${slug}/products/${id}/image`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body, cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Ruta no disponible');
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ message: 'No se pudo subir la foto del producto. Intentá nuevamente.' }, { status: 503 }); }
}
