'use client';
import BusinessProfile from '../business-profile';
import ProductsPanel from './products-panel';
import CustomersPanel from './customers-panel';
import { useTenantPanel } from './tenant-panel-context';

export default function TenantContent({ view }: { view: 'profile' | 'products' | 'customers' }) {
  const panel = useTenantPanel();
  const { tenant, onOpenMenu, onLogout } = panel;
  if (view === 'products') return <ProductsPanel slug={tenant.slug} nombre={tenant.nombre} version={panel.catalogVersion} onOpenMenu={onOpenMenu} onLogout={onLogout} />;
  if (view === 'customers') return <CustomersPanel slug={tenant.slug} nombre={tenant.nombre} version={panel.customersVersion} catalogVersion={panel.catalogVersion} onOpenMenu={onOpenMenu} onLogout={onLogout} />;
  return <BusinessProfile comercio={tenant} editor={panel} />;
}
