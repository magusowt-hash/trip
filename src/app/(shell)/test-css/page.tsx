'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';

type ImageItem = {
  id: string;
  name: string;
  relativePath: string;
  folderName: string;
  size: number;
  lastModified: number;
  url: string;
};

type FolderGroup = {
  name: string;
  images: ImageItem[];
};

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|svg|avif)$/i;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(timestamp);
  } catch {
    return '-';
  }
}

export default function TestCssPage() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [rootName, setRootName] = useState('');

  useEffect(() => {
    return () => {
      for (const image of images) {
        URL.revokeObjectURL(image.url);
      }
    };
  }, [images]);

  const groups = useMemo<FolderGroup[]>(() => {
    const map = new Map<string, ImageItem[]>();

    for (const image of images) {
      const list = map.get(image.folderName) ?? [];
      list.push(image);
      map.set(image.folderName, list);
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
      .map(([name, items]) => ({
        name,
        images: items.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
      }));
  }, [images]);

  const summary = useMemo(() => {
    const totalSize = images.reduce((sum, image) => sum + image.size, 0);
    return {
      folderCount: groups.length,
      imageCount: images.length,
      totalSize,
    };
  }, [groups.length, images]);

  function handleFolderPick(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);

    for (const image of images) {
      URL.revokeObjectURL(image.url);
    }

    if (selectedFiles.length === 0) {
      setImages([]);
      setRootName('');
      return;
    }

    const firstPath = (selectedFiles[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const nextRootName = firstPath.split('/').filter(Boolean)[0] || '';
    setRootName(nextRootName);

    const nextImages = selectedFiles
      .filter((file) => IMAGE_EXT_RE.test(file.name))
      .map((file, index) => {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const segments = relativePath.split('/').filter(Boolean);
        const folderName = segments.length >= 3 ? segments[1] : '根目录';

        return {
          id: `${relativePath}-${file.size}-${file.lastModified}-${index}`,
          name: file.name,
          relativePath,
          folderName,
          size: file.size,
          lastModified: file.lastModified,
          url: URL.createObjectURL(file),
        };
      });

    setImages(nextImages);

    event.target.value = '';
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Folder Preview Lab</p>
          <h1>选择一个本地文件夹，直接在前端按子文件夹展示图片</h1>
          <p className={styles.description}>
            这个页面只验证浏览器侧目录选择、图片读取和按子文件夹分组展示，不上传文件、不写数据库。
          </p>
        </div>

        <label className={styles.pickerCard}>
          <span className={styles.pickerTitle}>选择目录</span>
          <span className={styles.pickerHint}>建议目录结构：根目录 / 地点名 / 图片文件</span>
          <input
            className={styles.fileInput}
            type="file"
            multiple
            webkitdirectory=""
            onChange={handleFolderPick}
          />
          <span className={styles.pickerButton}>打开文件夹</span>
        </label>
      </section>

      <section className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>根目录</span>
          <strong>{rootName || '未选择'}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>地点分组</span>
          <strong>{summary.folderCount}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>图片数量</span>
          <strong>{summary.imageCount}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>总大小</span>
          <strong>{formatBytes(summary.totalSize)}</strong>
        </div>
      </section>

      {groups.length === 0 ? (
        <section className={styles.emptyState}>
          <h2>还没有可展示的图片</h2>
          <p>选择一个文件夹后，这里会按子文件夹名自动分组显示图片。</p>
        </section>
      ) : (
        <section className={styles.groupList}>
          {groups.map((group) => (
            <article key={group.name} className={styles.groupCard}>
              <div className={styles.groupHeader}>
                <div>
                  <h2>{group.name}</h2>
                  <p>{group.images.length} 张图片</p>
                </div>
              </div>

              <div className={styles.grid}>
                {group.images.map((image) => (
                  <figure key={image.id} className={styles.imageCard}>
                    <div className={styles.imageWrap}>
                      <img src={image.url} alt={image.name} className={styles.image} />
                    </div>
                    <figcaption className={styles.meta}>
                      <strong title={image.name}>{image.name}</strong>
                      <span>{formatBytes(image.size)}</span>
                      <span>{formatTime(image.lastModified)}</span>
                      <code title={image.relativePath}>{image.relativePath}</code>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
