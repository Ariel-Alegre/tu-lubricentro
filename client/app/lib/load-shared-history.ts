import { API_URL } from './admin-session';
import type { SharedHistory } from './shared-history';

export async function loadSharedHistory(source: string | { slug: string; plate: string }): Promise<{ initial: SharedHistory | null; error: string }> {
  try {
    const path = typeof source === 'string' ? source : `vehicle/${encodeURIComponent(source.slug)}/${encodeURIComponent(source.plate)}`;
    const response = await fetch(`${API_URL}/api/history/${path}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (response.ok) return { initial: await response.json(), error: '' };
    if (response.status === 404) return { initial: null, error: '' };
  } catch { /* La vista permite reintentar y reconectar sin perder el enlace. */ }
  return { initial: null, error: 'No se pudo cargar el historial. Reintentá en unos instantes.' };
}
