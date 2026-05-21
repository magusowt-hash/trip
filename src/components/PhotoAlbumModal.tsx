'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './PhotoAlbumModal.module.css';
import { buildFootprintPhotoScopeKey } from '@/lib/footprintPhotoScope';

interface PhotoData {
  id: number;
  url: string;
  filename: string;
  frameX: number | null;
  frameY: number | null;
}

interface Props {
  open: boolean;
  footprintItemId: number | null;
  placeTitle: string;
  onClose: () => void;
}

export default function PhotoAlbumModal({ open, footprintItemId, placeTitle, onClose }: Props) {
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const scopeKey = useMemo(
    () => (footprintItemId ? buildFootprintPhotoScopeKey(footprintItemId) : ''),
    [footprintItemId],
  );

  const loadPhotos = useCallback(async () => {
    if (!scopeKey) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/storage/photos?scope_key=${encodeURIComponent(scopeKey)}&footprint_item_id=${encodeURIComponent(String(footprintItemId ?? ''))}&place_title=${encodeURIComponent(placeTitle)}`,
        { credentials: 'include' },
      );
      if (!res.ok) return;
      const data = await res.json();
      setPhotos(data.photos || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [footprintItemId, placeTitle, scopeKey]);

  useEffect(() => {
    if (open) loadPhotos();
  }, [open, loadPhotos]);

  const handleUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = async () => {
      if (!input.files?.length) { document.body.removeChild(input); return; }
      setUploading(true);
      const form = new FormData();
      form.append('scope_key', scopeKey);
      form.append('footprint_item_id', String(footprintItemId ?? ''));
      form.append('place_title', placeTitle);
      for (const f of Array.from(input.files)) form.append('files', f);
      try {
        const res = await fetch('/api/storage/upload', {
          method: 'POST', credentials: 'include', body: form,
        });
        if (!res.ok) { const d = await res.json(); alert(d.error || '上传失败'); return; }
        await loadPhotos();
      } catch { alert('上传失败'); }
      finally {
        setUploading(false);
        document.body.removeChild(input);
      }
    };
    input.click();
  }, [footprintItemId, placeTitle, scopeKey, loadPhotos]);

  const handleDelete = useCallback(async (photoId: number) => {
    if (!confirm('确定删除该照片？')) return;
    try {
      await fetch(`/api/storage/photos?id=${photoId}`, {
        method: 'DELETE', credentials: 'include',
      });
      loadPhotos();
    } catch { alert('删除失败'); }
  }, [loadPhotos]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
        {uploading && (
          <div className={styles.spinnerOverlay}>
            <div className={styles.spinner} />
          </div>
        )}
        <div className={styles.header}>
          <h2 className={styles.title}>{placeTitle}</h2>
          <div className={styles.headerActions}>
            <button className={styles.actionBtn} onClick={handleUpload} disabled={uploading}>
              {uploading ? '⏳ 上传中...' : '＋ 上传'}
            </button>
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.hint}>加载中...</div>
          ) : photos.length === 0 ? (
            <div className={styles.hint}>暂无照片，点击"上传"添加</div>
          ) : (
            <div className={styles.grid}>
              {photos.map(p => (
                <div key={p.id} className={styles.photoCard}>
                  <img src={p.url} alt={p.filename} loading="lazy" />
                  <button
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(p.id)}
                  >
                    🗑
                  </button>
                  <span className={styles.photoName}>{p.filename}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
