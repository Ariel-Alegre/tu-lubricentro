'use client';
import Image from 'next/image';
import { ShoppingOutlined } from '@ant-design/icons';
import { useState } from 'react';
import type { Product } from '../lib/products';
import './product-photo.css';

export default function ProductPhoto({ slug, product, version = 0, className = '' }: { slug: string; product: Product; version?: number; className?: string }) {
  const [failedVersion, setFailedVersion] = useState(-1);
  return <div className={`product-photo ${className}`}>
    {product.hasImage && failedVersion !== version ? <Image src={`/api/public/lubricentros/${slug}/products/${product.id}/image?v=${version}`} alt={product.nombre} fill unoptimized onError={() => setFailedVersion(version)} style={{ objectFit: 'contain' }} sizes="(max-width: 760px) 100vw, 300px" /> : <ShoppingOutlined aria-label="Producto sin foto" />}
  </div>;
}
