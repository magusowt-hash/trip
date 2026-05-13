'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import styles from './album.module.css';

type ViewMode = 'grid' | 'list' | 'waterfall';

interface AlistFile {
  name: string;
  url: string;
  thumb: string;
  size: number;
}

async function findCloudFolder(listItemId: number): Promise<{ title: string; cloudFolder: string | null } | null> {
  const groupRes = await fetch('/api/footprints/groups', { credentials: 'include' });
  const groupData = await groupRes.json();
  for (const g of groupData.groups || []) {
    const itemRes = await fetch(`/api/footprints/groups/${g.id}/items`, { credentials: 'include' });
    const itemData = await itemRes.json();
    const found = (itemData.items || []).find((i: any) => i.listItemId === listItemId);
    if (found) return { title: found.title || '相册', cloudFolder: found.cloudFolder || found.listName || found.title };
  }
  return null;
}

export default function AlbumPage() {
  const params = useParams();
  const router = useRouter();
  const listItemId = parseInt(params.listItemId as string);
  const [files, setFiles] = useState<AlistFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('grid');
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [title, setTitle] = useState('相册');

  useEffect(() => {
    loadData();
  }, [listItemId]);

  async function loadData() {
    setLoading(true);
    try {
      const info = await findCloudFolder(listItemId);
      if (!info) { setLoading(false); return; }
      setTitle(info.title);
      const folderPath = info.cloudFolder || info.title;
      if (folderPath) {
        const res = await fetch(`/api/alist/folders?path=${encodeURIComponent(folderPath)}`, { credentials: 'include' });
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (err) {
      console.error('Failed to load album:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (lightbox === null) return;
      if (e.key === 'ArrowRight' && lightbox < files.length - 1) setLightbox(lightbox + 1);
      if (e.key === 'ArrowLeft' && lightbox > 0) setLightbox(lightbox - 1);
      if (e.key === 'Escape') setLightbox(null);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [lightbox, files.length]);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>← 返回</button>
        <h1 className={styles.topTitle}>{title} · 相册</h1>
        <div className={styles.viewSwitcher}>
          <button className={`${styles.viewBtn} ${view === 'grid' ? styles.viewBtnActive : ''}`} onClick={() => setView('grid')} title="网格">🗔</button>
          <button className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`} onClick={() => setView('list')} title="列表">▦</button>
          <button className={`${styles.viewBtn} ${view === 'waterfall' ? styles.viewBtnActive : ''}`} onClick={() => setView('waterfall')} title="瀑布流">▤</button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>加载中...</div>
      ) : files.length === 0 ? (
        <div className={styles.empty}>暂无云端图片</div>
      ) : (
        <div className={view === 'grid' ? styles.grid : view === 'list' ? styles.list : styles.waterfall}>
          {files.map((file, i) => (
            <div
              key={i}
              className={view === 'grid' ? styles.gridItem : view === 'list' ? styles.listItem : styles.waterfallItem}
              onClick={() => setLightbox(i)}
              style={view === 'waterfall' ? { height: 160 + (i % 3) * 60 } : undefined}
            >
              <img src={file.thumb || file.url} alt={file.name} loading="lazy" />
              {view === 'list' && (
                <div className={styles.listInfo}>
                  <div className={styles.listName}>{file.name}</div>
                  <div className={styles.listMeta}>{formatSize(file.size)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {lightbox !== null && (
        <div className={styles.lightbox} onClick={() => setLightbox(null)}>
          <button className={styles.lbPrev} onClick={e => { e.stopPropagation(); if (lightbox > 0) setLightbox(lightbox - 1); }}>‹</button>
          <img src={files[lightbox].url} alt={files[lightbox].name} onClick={e => e.stopPropagation()} />
          <button className={styles.lbNext} onClick={e => { e.stopPropagation(); if (lightbox < files.length - 1) setLightbox(lightbox + 1); }}>›</button>
          <div className={styles.lbCounter}>{lightbox + 1} / {files.length}</div>
        </div>
      )}
    </div>
  );
}
