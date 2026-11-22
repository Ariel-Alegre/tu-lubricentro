import { Suspense } from 'react';
import TenantLogin from './tenant-login';

export const metadata = { title: 'Acceso de lubricentros | Tu Lubricentro' };

export default function GeneralLogin() {
  return <Suspense fallback={<div className="dashboard-loading">Cargando acceso...</div>}><TenantLogin /></Suspense>;
}
