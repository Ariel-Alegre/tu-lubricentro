'use client';

import { Button } from 'antd';
import { EyeOutlined, LogoutOutlined, MenuOutlined } from '@ant-design/icons';
import Image from 'next/image';
import Link from 'next/link';
import ServiceSettings from './service-settings';
import './products.css';

type Props = { slug: string; nombre: string; version: number; onOpenMenu: () => void; onLogout: () => void };

export default function ServicesPanel({ slug, nombre, version, onOpenMenu, onLogout }: Props) {
  return <div className="tenant-products-page business-page business-page-editor">
    <header className="business-topbar"><div className="business-topbar-inner">
      <div className="business-platform-brand"><Button className="business-mobile-menu-button" type="text" icon={<MenuOutlined />} aria-label="Abrir menú administrativo" onClick={onOpenMenu} /><Image src="/tu-lubricentro-logo.png" alt="" width={36} height={36} /><strong>Tu Lubricentro</strong></div>
      <div className="business-editor-top-actions"><Link href={`/${slug}`} target="_blank" className="business-admin-link"><EyeOutlined /><span>Ver perfil público</span></Link><Button icon={<LogoutOutlined />} onClick={onLogout}>Salir</Button></div>
    </div></header>
    <main className="tenant-products-content">
      <div className="tenant-products-title"><div><span>SERVICIOS DE {nombre.toUpperCase()}</span><h1>Servicios</h1><p>Administrá los trabajos que realizás en tu lubricentro.</p></div></div>
      <ServiceSettings slug={slug} version={version} />
    </main>
  </div>;
}
