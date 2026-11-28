'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Button, ConfigProvider, Empty, Tabs } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, EnvironmentOutlined, InfoCircleOutlined, HistoryOutlined, LogoutOutlined, EyeOutlined, MenuOutlined, MessageOutlined, PhoneOutlined, ShopOutlined, ShoppingOutlined, WhatsAppOutlined, ToolOutlined, ShareAltOutlined, CheckOutlined } from '@ant-design/icons';
import ImageUpload from './admin/image-upload';
import ServiceSettings from './admin/service-settings';
import type { Tenant } from '../lib/tenant-session';
import { formatPrice, type Product } from '../lib/products';
import ProductPhoto from '../components/product-photo';
import LocationSettings from './admin/location-settings';

export type Comercio = { nombre: string; slug: string; telefono: string; direccion: string; ciudad: string; provincia: string; mapsUrl?: string; reviewsUrl?: string; hasCover?: boolean; hasProfile?: boolean; services?: { id: string; nombre: string; descripcion: string }[]; products?: Product[] };

type Editor = { imageVersion: number; catalogVersion: number; activeTab: string; onTabChange: (tab: string) => void; onOpenMenu: () => void; onImageUpdated: (tenant: Tenant) => void; onLogout: () => void };

export default function BusinessProfile({ comercio, editor, publicImageVersion = 0 }: { comercio: Comercio; editor?: Editor; publicImageVersion?: number }) {
  const [publicTab, setPublicTab] = useState('inicio');
  const tab = editor?.activeTab ?? publicTab;
  const setTab = editor?.onTabChange ?? setPublicTab;
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState('');
  const imageVersion = editor?.imageVersion ?? publicImageVersion;
  const [coverFailedVersion, setCoverFailedVersion] = useState(-1);
  const [profileFailedVersion, setProfileFailedVersion] = useState(-1);
  const customCover = comercio.hasCover && coverFailedVersion !== imageVersion;
  const customProfile = comercio.hasProfile && profileFailedVersion !== imageVersion;
  const media = (kind: string) => `/api/public/lubricentros/${comercio.slug}/images/${kind}?v=${imageVersion}`;
  const coverSrc = customCover ? media('cover') : '/lubricentro-cover.png';
  const profileSrc = customProfile ? media('profile') : '/tu-lubricentro-logo.png';
  const initials = comercio.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  const digits = comercio.telefono.replace(/\D/g, '');
  // Los números locales argentinos de diez dígitos usan el prefijo móvil +54 9.
  const whatsappNumber = !comercio.telefono.trim().startsWith('+') && digits.length === 10 ? `549${digits}` : digits;
  const contact = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hola ${comercio.nombre}, quisiera hacer una consulta.`)}`;
  const appointment = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hola ${comercio.nombre}, quisiera consultar disponibilidad para un turno.`)}`;
  const productContact = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hola ${comercio.nombre}, quisiera consultar los productos disponibles y sus precios.`)}`;
  const maps = comercio.mapsUrl || '';

  async function share() {
    setShareError('');
    const data = { title: comercio.nombre, text: `Conocé ${comercio.nombre}`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(data.url); setCopied(true); window.setTimeout(() => setCopied(false), 2500); }
    } catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) setShareError('No se pudo compartir. Podés copiar la dirección desde tu navegador.'); }
  }

  const information = <>
    {maps && <div className="business-detail"><EnvironmentOutlined /><div><strong>Ubicación del lubricentro</strong><a href={maps} target="_blank" rel="noopener noreferrer">Ver cómo llegar</a></div></div>}
    <div className="business-detail"><PhoneOutlined /><div><a href={`tel:${comercio.telefono.replace(/[^\d+]/g, '')}`}>{comercio.telefono}</a><span>Comunicate con el comercio</span></div></div>
    <div className="business-detail"><ClockCircleOutlined /><div><strong>Horarios de atención</strong><span>Consultá los horarios directamente con el lubricentro.</span></div></div>
  </>;

  return <ConfigProvider theme={{ token: { colorPrimary: '#155fa0', borderRadius: 10, fontSize: 16, fontFamily: 'var(--font-geist-sans), Arial, sans-serif' } }}>
    <main className={`business-page${editor ? ' business-page-editor' : ''}`}>
      <header className="business-topbar"><div className="business-topbar-inner">
        <div className="business-platform-brand">{editor && <Button className="business-mobile-menu-button" type="text" icon={<MenuOutlined />} aria-label="Abrir menú administrativo" onClick={editor.onOpenMenu} />}<Image src="/tu-lubricentro-logo.png" alt="" width={36} height={36} /><strong>Tu Lubricentro</strong></div>
        {editor ? <div className="business-editor-top-actions"><Link href={`/${comercio.slug}`} target="_blank" className="business-admin-link"><EyeOutlined /><span>Ver perfil público</span></Link><Button icon={<LogoutOutlined />} onClick={editor.onLogout}>Salir</Button></div> : <Link href={`/${comercio.slug}/login`} className="business-client-history-link"><HistoryOutlined /><span>Consultar mi historial</span></Link>}
      </div></header>

      <div className="business-profile-head">
        {editor && <div className="business-editor-notice"><span><ToolOutlined /> Estás administrando tu perfil</span><p>Usá los botones + para cambiar las fotos y la pestaña Servicios para editar tus trabajos.</p></div>}
        <div className="business-cover">
          <Image src={coverSrc} alt={customCover ? `Portada de ${comercio.nombre}` : 'Ilustración de aceite y piezas de motor'} fill priority unoptimized={Boolean(customCover)} onError={() => setCoverFailedVersion(imageVersion)} sizes="(max-width: 1200px) 100vw, 1200px" />
          {!customCover && <><div className="business-cover-copy"><span>EL CUIDADO DE TU VEHÍCULO</span><strong>En buenas manos.</strong><p>Conectá con tu lubricentro de confianza.</p></div><span className="business-cover-caption">Imagen ilustrativa</span></>}
          {editor && <ImageUpload slug={comercio.slug} kind="cover" onUpdate={editor.onImageUpdated} />}
        </div>
        <div className="business-identity">
          <div className="business-avatar-wrap"><div className="business-avatar"><Image src={profileSrc} alt={`Perfil de ${comercio.nombre}`} width={140} height={140} className={customProfile ? '' : 'business-default-avatar'} unoptimized={Boolean(customProfile)} onError={() => setProfileFailedVersion(imageVersion)} /></div>{editor && <ImageUpload slug={comercio.slug} kind="profile" onUpdate={editor.onImageUpdated} />}</div>
          <div className="business-name"><span className="business-category"><ShopOutlined /> Lubricentro</span><h1>{comercio.nombre}</h1>{maps && <p><EnvironmentOutlined /> <a href={maps} target="_blank" rel="noopener noreferrer">Ver ubicación en Google Maps</a></p>}</div>
          <div className="business-main-actions"><Button type="primary" icon={<WhatsAppOutlined />} href={contact} target="_blank" rel="noreferrer">Enviar mensaje</Button><Button icon={copied ? <CheckOutlined /> : <ShareAltOutlined />} onClick={share} aria-label="Compartir lubricentro">{copied ? 'Copiado' : 'Compartir'}</Button></div>
        </div>
        {shareError && <p className="business-share-error" role="alert">{shareError}</p>}
        <nav className="business-tabs" aria-label="Secciones del lubricentro"><Tabs activeKey={tab} onChange={setTab} items={[
          { key: 'inicio', label: 'Inicio' }, { key: 'informacion', label: 'Información' }, { key: 'productos', label: 'Productos' }, { key: 'servicios', label: 'Servicios' },
        ]} /></nav>
      </div>

      <div className="business-body">
        <aside className="business-sidebar">
          {editor && <LocationSettings slug={comercio.slug} mapsUrl={comercio.mapsUrl} onUpdate={editor.onImageUpdated} />}
          <section className="business-card"><h2>Presentación</h2><p className="business-intro">Conocé {comercio.nombre} y encontrá toda la información para tu próxima visita.</p><div className="business-detail"><ShopOutlined /><div><strong>Servicio automotor</strong><span>Atención para tu vehículo</span></div></div>{information}</section>
          {maps && <section className="business-card business-visit"><span className="business-card-icon"><EnvironmentOutlined /></span><h2>Vení a conocernos</h2><p>Encontrá nuestro lubricentro en Google Maps y elegí la mejor ruta para visitarnos.</p><Button block icon={<EnvironmentOutlined />} href={maps} target="_blank" rel="noopener noreferrer">Cómo llegar</Button></section>}
          <p className="business-powered">Un comercio en <strong>Tu Lubricentro</strong></p>
        </aside>

        <div className="business-feed">
          {tab === 'inicio' && <>
            <section className="business-card business-contact-strip"><div className="business-contact-icon"><ShoppingOutlined /></div><div><h2>Productos para tu vehículo</h2><p>Consultá los productos disponibles en este lubricentro.</p></div><Button onClick={() => setTab('productos')}>Ver productos</Button></section>
            <section className="business-card business-contact-strip"><div className="business-contact-icon"><CalendarOutlined /></div><div><h2>¿Tu vehículo necesita atención?</h2><p>Consultá disponibilidad y coordiná tu próxima visita.</p></div><Button type="primary" href={appointment} target="_blank" rel="noreferrer">Consultar turno</Button></section>
            <section className="business-card business-welcome"><div className="business-post-head"><div className="business-post-avatar">{initials}</div><div><strong>{comercio.nombre}</strong><span>Información del comercio</span></div></div><h2>Bienvenido a nuestro espacio</h2><p>Ahora podés encontrar nuestros datos de contacto en un solo lugar. Escribinos para consultar servicios, horarios o disponibilidad.</p><div className="business-welcome-art"><ShopOutlined /><div><span>EL CUIDADO QUE TU VEHÍCULO NECESITA</span><strong>Tu próxima visita<br />empieza acá.</strong></div></div><div className="business-post-footer"><MessageOutlined /> ¿Tenés una consulta? <a href={contact} target="_blank" rel="noreferrer">Hablemos por WhatsApp</a></div></section>
            <section className="business-card business-contact-strip"><div className="business-contact-icon"><ToolOutlined /></div><div><h2>Servicios del lubricentro</h2><p>Conocé qué trabajos realiza {comercio.nombre}.</p></div><Button onClick={() => setTab('servicios')}>Ver servicios</Button></section>
          </>}
          {tab === 'informacion' && <section className="business-card"><h2><InfoCircleOutlined /> Información de {comercio.nombre}</h2><p className="business-intro">Todo lo que necesitás para comunicarte y encontrarnos.</p>{information}<Button type="primary" icon={<WhatsAppOutlined />} href={contact} target="_blank" rel="noreferrer">Consultar horarios</Button></section>}
          {tab === 'productos' && <section className="business-card"><h2>Productos de {comercio.nombre}</h2>
            {editor ? <div className="business-section-empty"><p>Administrá tu catálogo desde la sección Productos del menú lateral.</p><Button type="primary" href={`/${comercio.slug}/admin/productos`} icon={<ShoppingOutlined />}>Administrar productos</Button></div> : comercio.products?.length ? <div className="business-services-grid">{comercio.products.map((product) => <article className="business-service business-product" key={product.id}><ProductPhoto slug={comercio.slug} product={product} version={imageVersion} className="product-photo-large" /><h3>{product.nombre}</h3>{product.descripcion && <p>{product.descripcion}</p>}<strong className="business-product-price">{formatPrice(product.precio)} <small>ARS</small></strong><Button icon={<WhatsAppOutlined />} href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hola ${comercio.nombre}, quisiera consultar por el producto: ${product.nombre}.`)}`} target="_blank" rel="noreferrer">Consultar producto</Button></article>)}</div> : <div className="business-section-empty"><Empty image={<ShoppingOutlined />} description={<p>Todavía no hay productos publicados. Podés consultar disponibilidad y precios directamente con el lubricentro.</p>}><Button type="primary" icon={<WhatsAppOutlined />} href={productContact} target="_blank" rel="noreferrer">Consultar productos</Button></Empty></div>}
          </section>}
          {tab === 'servicios' && (editor ? <ServiceSettings slug={comercio.slug} version={editor.catalogVersion} /> : <section className="business-card"><h2>Servicios de {comercio.nombre}</h2>
            {comercio.services?.length ? <div className="business-services-grid">{comercio.services.map((service) => <article className="business-service" key={service.id}><span className="business-card-icon"><ToolOutlined /></span><h3>{service.nombre}</h3>{service.descripcion && <p>{service.descripcion}</p>}<Button icon={<WhatsAppOutlined />} href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hola ${comercio.nombre}, quisiera consultar por el servicio: ${service.nombre}.`)}`} target="_blank" rel="noreferrer">Consultar</Button></article>)}</div> : <div className="business-section-empty"><Empty image={<ToolOutlined />} description={<p>El comercio todavía no publicó sus servicios. Escribinos para conocer las opciones disponibles para tu vehículo.</p>}><Button type="primary" icon={<WhatsAppOutlined />} href={contact} target="_blank" rel="noreferrer">Consultar servicios</Button></Empty></div>}
          </section>)}
        </div>
      </div>
      <a className="business-floating-contact" href={contact} target="_blank" rel="noreferrer" aria-label="Contactar por WhatsApp"><WhatsAppOutlined /></a>
    </main>
  </ConfigProvider>;
}
