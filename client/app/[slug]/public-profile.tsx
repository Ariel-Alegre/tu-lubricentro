'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import BusinessProfile, { type Comercio } from './business-profile';

export default function PublicProfile({ initial, socketUrl }: { initial: Comercio; socketUrl: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Comercio | null>(initial);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let stopped = false;
    let dirty = false;
    let running = false;
    let generation = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const socket = io(`${socketUrl.replace(/\/$/, '')}/public`, { auth: { slug: initial.slug }, transports: ['websocket'], autoConnect: false });
    async function refresh() {
      dirty = true;
      if (running || stopped) return;
      running = true;
      try {
        while (dirty && !stopped) {
          dirty = false;
          const current = generation;
          const response = await fetch(`/api/public/lubricentros/${initial.slug}`, { cache: 'no-store', signal: controller.signal });
          if (stopped || current !== generation) continue;
          if (response.status === 404) { setProfile(null); continue; }
          if (!response.ok) throw new Error('No se pudo actualizar');
          const data: Comercio = await response.json();
          if (!stopped && current === generation) { setProfile(data); setVersion((value) => value + 1); }
        }
      } catch {
        if (!stopped) { clearTimeout(retry); retry = setTimeout(() => { void refresh(); }, 3000); }
      } finally { running = false; }
    }
    socket.on('profile:ready', () => { clearTimeout(reconnect); void refresh(); });
    socket.on('profile:changed', (event: { slug: string; available: boolean }) => {
      generation += 1;
      if (!event.available) setProfile(null);
      if (event.slug !== initial.slug) { router.replace(`/${event.slug}`); return; }
      void refresh();
    });
    socket.on('connect_error', () => {
      void refresh();
      // Socket.IO no reintenta por sí solo un rechazo del middleware (p. ej. inactivo).
      clearTimeout(reconnect);
      reconnect = setTimeout(() => { if (!stopped) socket.connect(); }, 3000);
    });
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    socket.connect();
    return () => { stopped = true; clearTimeout(retry); clearTimeout(reconnect); controller.abort(); socket.disconnect(); window.removeEventListener('focus', onFocus); };
  }, [initial.slug, socketUrl, router]);
  if (!profile) return <main className="lubricentro-site"><section><h1>Este lubricentro no está disponible</h1><p>El perfil no se encuentra activo en este momento.</p></section></main>;
  return <BusinessProfile comercio={profile} publicImageVersion={version} />;
}
