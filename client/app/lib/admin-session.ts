import { cookies } from 'next/headers';

export const ADMIN_COOKIE = 'lubricentro_admin';
export const API_URL = process.env.SERVER_API_URL || 'http://127.0.0.1:3001';

export async function getAdmin() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  try {
    const response = await fetch(`${API_URL}/api/admin/session`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return await response.json() as { email: string };
  } catch { return null; }
}
