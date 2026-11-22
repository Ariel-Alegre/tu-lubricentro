'use client';
import { Button, Upload, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Tenant } from '../../lib/tenant-session';

export default function ImageUpload({ slug, kind, onUpdate }: { slug: string; kind: 'cover' | 'profile'; onUpdate: (tenant: Tenant) => void }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [notice, contextHolder] = message.useMessage();
  async function save(file: File) {
    if (file.size > 5 * 1024 * 1024) { notice.error('La imagen debe pesar como máximo 5 MB'); return Upload.LIST_IGNORE; }
    setUploading(true);
    try {
      const body = new FormData(); body.append('image', file);
      const response = await fetch(`/api/tenant/${slug}/images/${kind}`, { method: 'POST', body });
      const result = await response.json();
      if (response.status === 401 || response.status === 403) { router.replace('/login/admin?reason=revoked'); router.refresh(); return Upload.LIST_IGNORE; }
      if (!response.ok) throw new Error(result.message || 'No se pudo subir la imagen');
      onUpdate(result);
      notice.success(kind === 'cover' ? 'Portada actualizada' : 'Foto de perfil actualizada');
    } catch (cause) { notice.error(cause instanceof Error ? cause.message : 'No se pudo subir la imagen'); }
    finally { setUploading(false); }
    return Upload.LIST_IGNORE;
  }
  return <div className={`business-image-upload business-image-upload-${kind}`}>
    {contextHolder}
    <Upload accept="image/jpeg,image/png,image/webp" showUploadList={false} disabled={uploading} beforeUpload={save}>
      <Button className="business-image-edit-button" icon={<PlusOutlined />} loading={uploading} aria-label={kind === 'cover' ? 'Editar portada' : 'Editar foto de perfil'} title={kind === 'cover' ? 'Cambiar portada · JPG, PNG o WebP hasta 5 MB' : 'Cambiar foto de perfil · JPG, PNG o WebP hasta 5 MB'}>
        {kind === 'cover' && <span>Editar portada</span>}
      </Button>
    </Upload>
  </div>;
}
