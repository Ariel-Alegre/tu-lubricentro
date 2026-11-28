'use client';

import { startTransition, useEffect, useState } from 'react';
import { businessStatusAt, type BusinessHours } from '../lib/opening-hours';
import './business-status.css';

export default function BusinessStatus({ openingHours = [] }: BusinessHours) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (!openingHours.length) return;
    let timer: ReturnType<typeof setTimeout>;
    function updateClock() {
      // Leer el reloj después de hidratar evita fechas variables durante el prerender.
      clearTimeout(timer);
      const current = new Date();
      startTransition(() => setNow(current));
      // Actualizar al comenzar el siguiente minuto, incluyendo aperturas y cierres.
      timer = setTimeout(updateClock, 60000 - current.getUTCSeconds() * 1000 - current.getUTCMilliseconds() + 20);
    }
    function visible() { if (document.visibilityState === 'visible') updateClock(); }
    updateClock();
    window.addEventListener('focus', updateClock);
    document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(timer); window.removeEventListener('focus', updateClock); document.removeEventListener('visibilitychange', visible); };
  }, [openingHours.length]);

  if (!now) return null;
  const { ranges, isOpen } = businessStatusAt(openingHours, now);
  if (typeof isOpen !== 'boolean') return null;
  const hours = `Hoy: ${ranges.map((range) => `de ${range.from} a ${range.to}`).join(' y ')}`;
  return <div className="business-status-summary" aria-live="polite">
    <span className="business-open-status" data-open={isOpen}>{isOpen ? 'Abierto ahora' : 'Cerrado ahora'}</span>
    {isOpen && <span className="business-today-hours">{hours}</span>}
  </div>;
}
