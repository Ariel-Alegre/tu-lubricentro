import { weekDays, type OpeningDay } from '../lib/opening-hours';
import './opening-hours.css';

export default function OpeningHours({ hours = [] }: { hours?: OpeningDay[] }) {
  return <div className="business-opening-hours"><h3>Horarios de atención</h3>
    {hours.length ? <dl>{weekDays.map(({ key, label }) => {
      const day = hours.find((item) => item.day === key);
      return <div key={key}><dt>{label}</dt><dd>{!day || day.closed ? 'Cerrado' : day.ranges.map((range) => `${range.from} – ${range.to}`).join(' / ')}</dd></div>;
    })}</dl> : <p>Consultá los horarios directamente con el lubricentro.</p>}
  </div>;
}
