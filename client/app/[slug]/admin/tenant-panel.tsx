'use client';
import { Alert, Button, ConfigProvider, Drawer, Menu, Spin } from 'antd';
import { AppstoreOutlined, ShoppingOutlined, TeamOutlined, ToolOutlined, LockOutlined, SettingOutlined } from '@ant-design/icons';
import Image from 'next/image';
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import type { Tenant } from '../../lib/tenant-session';
import './tenant-panel.css';
import '../lubricentro.css';
import { TenantPanelContext } from './tenant-panel-context';
import ChangePassword from './change-password';

export default function TenantPanel({ tenant: initialTenant, children }: { tenant: Tenant; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [tenant, setTenant] = useState(initialTenant);
  const [imageVersion, setImageVersion] = useState(0);
  const [customersVersion, setCustomersVersion] = useState(0);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [activeTab, setActiveTab] = useState('inicio');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const slug = initialTenant.slug;
  const view = pathname === `/${slug}/admin/productos` ? 'products' : pathname === `/${slug}/admin/clientes` ? 'customers' : pathname === `/${slug}/admin/servicios` ? 'services' : 'profile';

  useEffect(() => {
    if (!connected) return;
    router.prefetch(`/${slug}/admin`);
    router.prefetch(`/${slug}/admin/productos`);
    router.prefetch(`/${slug}/admin/clientes`);
    router.prefetch(`/${slug}/admin/servicios`);
  }, [connected, slug, router]);

  useEffect(() => {
    let cancelled = false;
    let revoked = false;
    let temporaryError = false;
    let socket: Socket | undefined;
    async function revoke(reason = 'revoked') {
      if (cancelled || revoked) return;
      revoked = true;
      setConnected(false);
      socket?.disconnect();
      try { await fetch(`/api/tenant/${slug}/logout`, { method: 'POST' }); }
      catch { /* El servidor ya invalidó la sesión; continuar fuera del panel. */ }
      finally { if (!cancelled) { router.replace(`/login/admin?reason=${reason === 'password-changed' ? reason : 'revoked'}`); router.refresh(); } }
    }
    async function ticket() {
      const response = await fetch(`/api/tenant/${slug}/socket`, { method: 'POST', cache: 'no-store' });
      if (response.status === 401 || response.status === 403) { await revoke(); throw new Error('Acceso revocado'); }
      if (!response.ok) throw new Error('No se pudo verificar la conexión');
      return response.json() as Promise<{ ticket: string; url: string }>;
    }
    async function start() {
      try {
        const initial = await ticket();
        if (cancelled || revoked) return;
        socket = io(initial.url, {
          transports: ['websocket'], autoConnect: false,
          auth: async (callback) => {
            try {
              const data = await ticket(); temporaryError = false;
              if (!cancelled && !revoked) callback({ ticket: data.ticket });
            } catch {
              temporaryError = true;
              if (!cancelled && !revoked) callback({ ticket: '' });
            }
          },
        });
        socket.on('session:ready', (account: Tenant) => {
          if (!cancelled && !revoked && account.id === initialTenant.id && account.slug === slug) {
            setTenant(account); setConnected(true); setError('');
            setCustomersVersion((value) => value + 1);
            setCatalogVersion((value) => value + 1); setImageVersion((value) => value + 1);
          }
        });
        socket.on('session:revoked', revoke);
        socket.on('customers:changed', () => { if (!cancelled && !revoked) setCustomersVersion((value) => value + 1); });
        socket.on('catalog:changed', () => { if (!cancelled && !revoked) setCatalogVersion((value) => value + 1); });
        socket.on('profile:changed', async () => { await validate(); if (!cancelled && !revoked) setImageVersion((value) => value + 1); });
        socket.on('disconnect', () => { if (!cancelled) setConnected(false); });
        socket.on('connect_error', (cause) => {
          if (cancelled || revoked) return;
          setConnected(false);
          const status = (cause as Error & { data?: { status?: number } }).data?.status;
          if (!temporaryError && (status === 401 || status === 403)) { void revoke(); return; }
          setError('Se perdió la conexión. Reintentá para continuar.');
        });
        socket.connect();
      } catch {
        if (!cancelled && !revoked) setError('No se pudo verificar el acceso. Reintentá en unos minutos.');
      }
    }
    // Revalidar al recuperar el foco y periódicamente cubre cambios durante una desconexión.
    async function validate() {
      if (cancelled || revoked) return;
      try {
        const response = await fetch(`/api/tenant/${slug}/session`, { cache: 'no-store' });
        if (response.status === 401 || response.status === 403) { await revoke(); return; }
        if (!response.ok) { setConnected(false); return; }
        const account: Tenant = await response.json();
        if (!cancelled && !revoked && socket?.connected) { setTenant(account); setConnected(true); }
      } catch { if (!cancelled) setConnected(false); }
    }
    void start();
    const timer = window.setInterval(validate, 30000);
    window.addEventListener('focus', validate);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', validate); socket?.disconnect(); };
  }, [slug, initialTenant.id, router]);

  async function logout() {
    setConnected(false);
    try {
      const response = await fetch(`/api/tenant/${slug}/logout`, { method: 'POST' });
      if (!response.ok) throw new Error();
      router.replace('/login/admin'); router.refresh();
    } catch { setError('No se pudo cerrar sesión. Reintentá.'); }
  }

  const navigation = <>
    <div className="tenant-brand"><Image src="/tu-lubricentro-logo.png" alt="" width={44} height={44} /><strong>Tu Lubricentro</strong></div>
    <Menu theme="light" className="tenant-navigation-menu" mode="inline" selectedKeys={[view === 'products' ? 'productos' : view === 'customers' ? 'clientes' : view === 'services' ? 'servicios' : 'inicio']} onClick={({ key }) => {
      setMobileMenuOpen(false);
      if (key === 'productos') router.push(`/${slug}/admin/productos`);
      else if (key === 'clientes') router.push(`/${slug}/admin/clientes`);
      else if (key === 'servicios') router.push(`/${slug}/admin/servicios`);
      else if (key === 'password') setPasswordOpen(true);
      else { setActiveTab('inicio'); if (view !== 'profile') router.push(`/${slug}/admin`); }
    }} items={[
      { key: 'inicio', label: 'Mi lubricentro', icon: <AppstoreOutlined /> },
      { key: 'productos', label: 'Productos', icon: <ShoppingOutlined /> },
      { key: 'servicios', label: 'Servicios', icon: <ToolOutlined /> },
      { key: 'clientes', label: 'Clientes', icon: <TeamOutlined /> },
      { key: 'configuracion', label: 'Configuración', icon: <SettingOutlined />, children: [
        { key: 'password', label: 'Cambiar contraseña', icon: <LockOutlined /> },
      ] },
    ]} />
    <div className="tenant-sidebar-footer"><strong>{tenant.nombre}</strong><span>Panel administrativo</span></div>
  </>;

  return <ConfigProvider theme={{ token: { colorPrimary: '#155fa0' } }}>
    {!connected && <div className="tenant-pending">
      {error ? <><Alert type="warning" title={error} showIcon /><Button onClick={() => window.location.reload()}>Reintentar</Button></> : <Spin description="Verificando acceso y conexión..." />}
    </div>}
    {/* Mantener children en el árbol permite validar y conservar las rutas durante la conexión. */}
    <div className="tenant-shell" hidden={!connected} inert={!connected} style={!connected ? { display: 'none' } : undefined}>
      <aside className="tenant-sidebar tenant-admin-sidebar" aria-label="Menú administrativo">{navigation}</aside>
      <Drawer placement="left" size={270} title="Menú administrativo" open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}>{navigation}</Drawer>
      <TenantPanelContext.Provider value={{ tenant, imageVersion, customersVersion, catalogVersion, activeTab, onTabChange: setActiveTab, onOpenMenu: () => setMobileMenuOpen(true), onLogout: logout, onImageUpdated: (account) => {
          setTenant(account); setImageVersion((current) => current + 1);
        } }}>
        <div className="tenant-main">{children}</div>
      </TenantPanelContext.Provider>
    </div>
    <ChangePassword slug={slug} open={passwordOpen && connected} onClose={() => setPasswordOpen(false)} />
  </ConfigProvider>;
}
