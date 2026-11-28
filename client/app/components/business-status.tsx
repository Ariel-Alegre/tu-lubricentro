'use client';

import { startTransition, useEffect, useState } from 'react';
import type { BusinessHours } from '../lib/opening-hours';
import './business-status.css';

export default function BusinessStatus({ isOpen, openingHours = [] }: BusinessHours) {
  const [today, setToday] = useState('');
  useEffect(() => {
    if (isOpen !== true) return;
    function updateDay() {
      // Leer el reloj después de hidratar evita fechas variables durante el prerender.
      const day = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      startTransition(() => setToday(day));
    }
    updateDay();
    const timer = window.setInterval(updateDay, 60000);
    window.addEventListener('focus', updateDay);
    return () => { clearInterval(timer); window.removeEventListener('focus', updateDay); };
  }, [isOpen]);

  if (typeof isOpen !== 'boolean') return null;
  const schedule = openingHours.find((day) => day.day === today);
  const hours = schedule && !schedule.closed && schedule.ranges.length
    ? `Hoy: ${schedule.ranges.map((range) => `de ${range.from} a ${range.to}`).join(' y ')}`
    : 'Horario de hoy no publicado';
  return <div className="business-status-summary" aria-live="polite">
    <span className="business-open-status" data-open={isOpen}>{isOpen ? 'Abierto ahora' : 'Cerrado ahora'}</span>
    {isOpen && today && <span className="business-today-hours">{hours}</span>}
  </div>;
}
