'use client';
import { createContext, useContext } from 'react';
import type { Tenant } from '../../lib/tenant-session';

type PanelContext = {
  tenant: Tenant;
  imageVersion: number;
  customersVersion: number;
  catalogVersion: number;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenMenu: () => void;
  onLogout: () => Promise<void>;
  onImageUpdated: (tenant: Tenant) => void;
};
export const TenantPanelContext = createContext<PanelContext | null>(null);
export function useTenantPanel() {
  const panel = useContext(TenantPanelContext);
  if (!panel) throw new Error('El contenido debe estar dentro del panel administrativo');
  return panel;
}
