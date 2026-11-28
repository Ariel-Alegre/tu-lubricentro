import { cookies } from 'next/headers';
import { API_URL } from './admin-session';

export type Tenant = { id: string; nombre: string; slug: string; email: string; telefono: string; direccion: string; ciudad: string; provincia: string; responsable: string; estado: string; reviewsUrl?: string; hasCover?: boolean; hasProfile?: boolean };
export function tenantCookie(slug: string) { return `lubricentro_session_${slug}`; }

export async function getTenant(slug: string): Promise<Tenant | null> {
  const token = (await cookies()).get(tenantCookie(slug))?.value;
  if (!token) return null;
  try {
    const response = await fetch(`${API_URL}/api/tenant/${encodeURIComponent(slug)}/session`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    return response.ok ? await response.json() as Tenant : null;
  } catch { return null; }
}
