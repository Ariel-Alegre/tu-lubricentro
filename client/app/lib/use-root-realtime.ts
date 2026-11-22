'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';

export function useRootRealtime() {
  const router = useRouter();
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let stopped = false; let revoked = false; let socket: Socket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    async function ticket() {
      const response = await fetch('/api/admin/socket', { method: 'POST', cache: 'no-store' });
      if (response.status === 401 || response.status === 403) { if (!stopped) { revoked = true; socket?.disconnect(); router.replace('/login'); router.refresh(); } throw new Error('Sesión inválida'); }
      if (!response.ok) throw new Error('No se pudo conectar');
      return response.json() as Promise<{ ticket: string; url: string }>;
    }
    async function start() {
      try {
        const initial = await ticket(); if (stopped || revoked) return;
        socket = io(`${initial.url.replace(/\/$/, '')}/root`, { transports: ['websocket'], autoConnect: false, auth: async (callback) => {
          try { const data = await ticket(); if (!stopped && !revoked) callback({ ticket: data.ticket }); }
          catch { if (!stopped && !revoked) callback({ ticket: '' }); }
        } });
        socket.on('root:ready', () => { if (!stopped) { clearTimeout(retry); setError(''); setVersion((value) => value + 1); } });
        socket.on('lubricentros:changed', () => { if (!stopped) setVersion((value) => value + 1); });
        socket.on('root:revoked', () => { if (!stopped) { revoked = true; socket?.disconnect(); router.replace('/login'); router.refresh(); } });
        socket.on('disconnect', () => { if (!stopped && !revoked) setError('Se perdió la conexión. Los datos se actualizarán al reconectar.'); });
        socket.on('connect_error', () => { if (!stopped && !revoked) { setError('Reconectando las actualizaciones del panel...'); clearTimeout(retry); retry = setTimeout(() => socket?.connect(), 3000); } });
        socket.connect();
      } catch { if (!stopped && !revoked) { setError('Reconectando las actualizaciones del panel...'); retry = setTimeout(() => { void start(); }, 3000); } }
    }
    const focus = () => { if (!stopped && !revoked) setVersion((value) => value + 1); };
    void start(); window.addEventListener('focus', focus);
    return () => { stopped = true; clearTimeout(retry); socket?.disconnect(); window.removeEventListener('focus', focus); };
  }, [router]);
  return { version, error };
}
