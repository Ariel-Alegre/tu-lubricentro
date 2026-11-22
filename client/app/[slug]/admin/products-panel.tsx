'use client';
import { Alert, Button, Card, Empty, Form, Input, InputNumber, Modal, Popconfirm, Table, Tag, Upload } from 'antd';
import type { TableProps } from 'antd';
import { CameraOutlined, DeleteOutlined, EditOutlined, EyeOutlined, LogoutOutlined, MenuOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice, type Product } from '../../lib/products';
import './products.css';
import ProductPhoto from '../../components/product-photo';

type Values = { nombre: string; descripcion: string; precio: string; stock: number };

export default function ProductsPanel({ slug, nombre, version = 0, onOpenMenu, onLogout }: { slug: string; nombre: string; version?: number; onOpenMenu: () => void; onLogout: () => void }) {
  const router = useRouter();
  const [form] = Form.useForm<Values>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [imageVersion, setImageVersion] = useState(0);
  const selectedPhoto = useRef<File | null>(null);
  const base = `/api/tenant/${slug}/products`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/tenant/${slug}/products`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); }
        if (!response.ok) throw new Error(data.message || 'No se pudieron cargar los productos');
        if (!controller.signal.aborted) { setProducts(data); setError(''); }
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, router, reload, version]);

  function edit(product: Product | null) {
    selectedPhoto.current = null; setPhoto(null); setPreview('');
    setEditing(product); setFormError(''); form.resetFields();
    if (product) form.setFieldsValue({ nombre: product.nombre, descripcion: product.descripcion, precio: String(product.precio), stock: product.stock ?? 0 });
    setOpen(true);
  }
  function choosePhoto(file: File) {
    if (file.size > 5 * 1024 * 1024 || (file.type && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      setFormError('Usá una foto JPG, PNG o WebP de hasta 5 MB'); return Upload.LIST_IGNORE;
    }
    setFormError(''); selectedPhoto.current = file; setPhoto(file);
    const reader = new FileReader();
    reader.onload = () => { if (selectedPhoto.current === file) setPreview(String(reader.result)); };
    reader.readAsDataURL(file);
    return Upload.LIST_IGNORE;
  }
  async function save(values: Values) {
    setSaving(true); setFormError('');
    try {
      const response = await fetch(editing ? `${base}/${editing.id}` : base, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      let data = await response.json();
      if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); }
      if (!response.ok) throw new Error(data.message || 'No se pudo guardar el producto');
      const savedProduct: Product = data;
      setProducts((items) => items.some((item) => item.id === savedProduct.id) ? items.map((item) => item.id === savedProduct.id ? savedProduct : item) : [savedProduct, ...items]);
      // Si falla la foto, el siguiente intento edita el mismo producto en vez de duplicarlo.
      setEditing(savedProduct);
      if (photo) {
        try {
          const body = new FormData(); body.append('image', photo);
          const imageResponse = await fetch(`${base}/${savedProduct.id}/image`, { method: 'POST', body });
          data = await imageResponse.json();
          if (imageResponse.status === 401 || imageResponse.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); }
          if (!imageResponse.ok) throw new Error(data.message || 'No se pudo subir la foto');
          const updated: Product = data;
          setProducts((items) => items.map((item) => item.id === updated.id ? updated : item));
          setImageVersion((value) => value + 1);
        } catch (cause) {
          throw new Error(`El producto se guardó, pero la foto no se pudo subir. ${cause instanceof Error ? cause.message : ''} Podés reintentar o guardar sin la nueva foto.`);
        }
      }
      setOpen(false); form.resetFields(); router.refresh();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'No se pudo guardar'); }
    finally { setSaving(false); }
  }
  async function remove(product: Product) {
    setDeleting(product.id); setError('');
    try {
      const response = await fetch(`${base}/${product.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); }
      if (!response.ok) throw new Error(data.message || 'No se pudo eliminar el producto');
      setProducts((items) => items.filter((item) => item.id !== product.id)); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo eliminar'); }
    finally { setDeleting(null); }
  }
  function actions(product: Product) {
    return <div className="tenant-product-actions"><Button icon={<EditOutlined />} onClick={() => edit(product)} disabled={deleting !== null} aria-label={`Editar ${product.nombre}`}>Editar</Button><Popconfirm title="¿Eliminar este producto?" description="Dejará de mostrarse en el catálogo público." onConfirm={() => remove(product)} okText="Eliminar" cancelText="Cancelar"><Button danger icon={<DeleteOutlined />} loading={deleting === product.id} disabled={deleting !== null} aria-label={`Eliminar ${product.nombre}`}>Eliminar</Button></Popconfirm></div>;
  }
  const filtered = products.filter((product) => `${product.nombre} ${product.descripcion}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')));
  function stockLabel(product: Product) {
    const units = product.stock ?? 0;
    return <Tag color={units === 0 ? 'red' : 'blue'}>{units === 0 ? 'Sin stock · 0 unidades' : `${units.toLocaleString('es-AR')} ${units === 1 ? 'unidad' : 'unidades'}`}</Tag>;
  }
  const columns: TableProps<Product>['columns'] = [
    { title: 'Producto', key: 'nombre', render: (_, product) => <div className="tenant-product-cell"><ProductPhoto slug={slug} product={product} version={imageVersion + version} /><div className="tenant-product-name"><strong>{product.nombre}</strong><span>{product.descripcion}</span></div></div> },
    { title: 'Precio (ARS)', dataIndex: 'precio', key: 'precio', render: (value: string) => formatPrice(value), width: 160 },
    { title: 'Stock', key: 'stock', render: (_, product) => stockLabel(product), width: 180, sorter: (a, b) => (a.stock ?? 0) - (b.stock ?? 0) },
    { title: 'Acciones', key: 'acciones', render: (_, product) => actions(product), width: 260 },
  ];
  const empty = <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={search ? 'No encontramos productos con esa búsqueda.' : 'Todavía no agregaste productos.'} />;

  return <div className="tenant-products-page business-page business-page-editor">
    <header className="business-topbar"><div className="business-topbar-inner"><div className="business-platform-brand"><Button className="business-mobile-menu-button" type="text" icon={<MenuOutlined />} aria-label="Abrir menú administrativo" onClick={onOpenMenu} /><Image src="/tu-lubricentro-logo.png" alt="" width={36} height={36} /><strong>Tu Lubricentro</strong></div><div className="business-editor-top-actions"><Link href={`/${slug}`} target="_blank" className="business-admin-link"><EyeOutlined /><span>Ver perfil público</span></Link><Button icon={<LogoutOutlined />} onClick={onLogout}>Salir</Button></div></div></header>
    <main className="tenant-products-content">
      <div className="tenant-products-title"><div><span>CATÁLOGO DE {nombre.toUpperCase()}</span><h1>Productos</h1><p>Administrá los productos, precios y stock de tu lubricentro.</p></div><Button type="primary" icon={<PlusOutlined />} onClick={() => edit(null)} disabled={loading || Boolean(error)}>Agregar producto</Button></div>
      {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => { setLoading(true); setReload((value) => value + 1); }}>Reintentar</Button>} style={{ marginBottom: 24 }} />}
      <Card className="tenant-products-list" styles={{ body: { padding: 0 } }}>
        <div className="tenant-products-toolbar"><div><h2>Todos los productos</h2><p>{loading ? 'Cargando catálogo...' : `${products.length} ${products.length === 1 ? 'producto registrado' : 'productos registrados'}`}</p></div><Input allowClear prefix={<SearchOutlined />} aria-label="Buscar productos" placeholder="Buscar por nombre o descripción" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        {!error && <><div className="tenant-products-table"><Table<Product> rowKey="id" columns={columns} dataSource={filtered} loading={loading} pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: empty }} /></div><div className="tenant-products-mobile">{loading ? <p>Cargando productos...</p> : filtered.length ? filtered.map((product) => <article className="tenant-product-card" key={product.id}><ProductPhoto slug={slug} product={product} version={imageVersion + version} className="product-photo-large" /><div className="tenant-product-name"><strong>{product.nombre}</strong><p>{product.descripcion}</p></div><span className="tenant-product-price">{formatPrice(product.precio)} <small>ARS</small></span><div className="tenant-product-stock">Stock: {stockLabel(product)}</div>{actions(product)}</article>) : empty}</div></>}
      </Card>
    </main>
    <Modal className="tenant-product-modal" title={editing ? 'Editar producto' : 'Agregar producto'} open={open} forceRender onCancel={() => { if (!saving) setOpen(false); }} onOk={() => form.submit()} okText={editing ? 'Guardar cambios' : 'Agregar producto'} cancelText="Cancelar" confirmLoading={saving} cancelButtonProps={{ disabled: saving }}>
      {formError && <Alert type="error" showIcon title={formError} style={{ marginBottom: 20 }} />}
      <Form form={form} layout="vertical" onFinish={save} requiredMark={false} initialValues={{ stock: 0 }}>
        <Form.Item label="Foto del producto (opcional)">
          <div className="tenant-product-photo-editor">{preview ? <div className="product-photo product-photo-form"><Image src={preview} alt="Vista previa de la foto seleccionada" fill unoptimized style={{ objectFit: 'contain' }} /></div> : editing ? <ProductPhoto slug={slug} product={editing} version={imageVersion + version} className="product-photo-form" /> : null}
            <Upload accept="image/jpeg,image/png,image/webp" beforeUpload={choosePhoto} showUploadList={false} disabled={saving}><Button icon={<CameraOutlined />} disabled={saving}>{photo || editing?.hasImage ? 'Cambiar foto' : 'Seleccionar foto'}</Button></Upload>
            {photo && <Button type="text" disabled={saving} onClick={() => { selectedPhoto.current = null; setPhoto(null); setPreview(''); }}>Descartar nueva foto</Button>}
            <p>JPG, PNG o WebP · Hasta 5 MB. La foto se sube al guardar el producto.</p>
          </div>
        </Form.Item>
        <Form.Item label="Nombre del producto" name="nombre" rules={[{ required: true, whitespace: true, message: 'Ingresá el nombre del producto' }, { max: 120 }]}><Input placeholder="Ej. Aceite de motor 10W-40" maxLength={120} /></Form.Item>
        <Form.Item label="Descripción (opcional)" name="descripcion" rules={[{ max: 1000 }]}><Input.TextArea rows={3} maxLength={1000} showCount placeholder="Presentación, marca o características" /></Form.Item>
        <Form.Item label="Precio en pesos argentinos (ARS)" name="precio" rules={[{ required: true, message: 'Ingresá el precio' }]}><InputNumber<string> stringMode min="0" max="9999999999.99" precision={2} prefix="$" placeholder="0.00" style={{ width: '100%' }} /></Form.Item>
        <Form.Item label="Stock disponible (unidades)" name="stock" rules={[{ required: true, message: 'Ingresá las unidades disponibles' }, { type: 'integer', min: 0, max: 2147483647, message: 'Ingresá una cantidad entera mayor o igual a 0' }]}><InputNumber min={0} max={2147483647} precision={0} placeholder="0" style={{ width: '100%' }} /></Form.Item>
      </Form>
    </Modal>
  </div>;
}
