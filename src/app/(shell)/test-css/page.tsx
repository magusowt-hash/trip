'use client';

import { ChangeEvent, InputHTMLAttributes, useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';

type ImageItem = {
  id: string;
  name: string;
  relativePath: string;
  folderName: string;
  size: number;
  lastModified: number;
  url: string;
  sortOrder: number;
};

type PersistedImageRecord = {
  relativePath: string;
  folderName: string;
  name: string;
  size: number;
  lastModified: number;
  sortOrder: number;
};

type PersistedSession = {
  version: number;
  rootName: string;
  savedAt: string;
  files: PersistedImageRecord[];
};

type FolderGroup = {
  name: string;
  images: ImageItem[];
};

type DiffSummary = {
  unchanged: number;
  added: PersistedImageRecord[];
  removed: PersistedImageRecord[];
  changed: Array<{
    previous: PersistedImageRecord;
    current: PersistedImageRecord;
  }>;
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

function buildRecordFromImage(image: ImageItem): PersistedImageRecord {
  return {
    relativePath: image.relativePath,
    folderName: image.folderName,
    name: image.name,
    size: image.size,
    lastModified: image.lastModified,
    sortOrder: image.sortOrder,
  };
}

function diffWithSession(images: ImageItem[], session: PersistedSession | null): DiffSummary | null {
  if (!session) return null;

  const currentRecords = images.map(buildRecordFromImage);
  const currentMap = new Map(currentRecords.map((record) => [record.relativePath, record]));
  const previousMap = new Map(session.files.map((record) => [record.relativePath, record]));

  const added: PersistedImageRecord[] = [];
  const removed: PersistedImageRecord[] = [];
  const changed: Array<{ previous: PersistedImageRecord; current: PersistedImageRecord }> = [];
  let unchanged = 0;

  for (const record of currentRecords) {
    const previous = previousMap.get(record.relativePath);
    if (!previous) {
      added.push(record);
      continue;
    }

    if (
      previous.size === record.size &&
      previous.lastModified === record.lastModified &&
      previous.folderName === record.folderName &&
      previous.name === record.name
    ) {
      unchanged += 1;
    } else {
      changed.push({ previous, current: record });
    }
  }

  for (const record of session.files) {
    if (!currentMap.has(record.relativePath)) {
      removed.push(record);
    }
  }

  return { unchanged, added, removed, changed };
}

export default function TestCssPage() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [rootName, setRootName] = useState('');
  const [persistedSession, setPersistedSession] = useState<PersistedSession | null>(null);
  const [knownRootNames, setKnownRootNames] = useState<string[]>([]);
  const [diffSummary, setDiffSummary] = useState<DiffSummary | null>(null);
  const [loadMessage, setLoadMessage] = useState('选择主文件夹后会按主文件夹名称读取记录');
  const [saveMessage, setSaveMessage] = useState('');
  const directoryInputProps = {
    webkitdirectory: '',
  } as InputHTMLAttributes<HTMLInputElement> & { webkitdirectory: string };

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
        images: [...items].sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
          return a.name.localeCompare(b.name, 'zh-CN');
        }),
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

  async function loadSession(nextRootName: string): Promise<PersistedSession | null> {
    const normalizedRootName = nextRootName.trim().replace(/\\/g, '/');
    if (!normalizedRootName) {
      setPersistedSession(null);
      setDiffSummary(null);
      setLoadMessage('选择主文件夹后会按主文件夹名称读取记录');
      return null;
    }

    try {
      const res = await fetch(`/api/test-css/session?rootName=${encodeURIComponent(normalizedRootName)}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        setLoadMessage('读取已保存记录失败');
        return;
      }
      const data = await res.json();
      setPersistedSession(data.session ?? null);
      setKnownRootNames(Array.isArray(data.knownRootNames) ? data.knownRootNames : []);
      setLoadMessage(data.session ? '已读取该主文件夹名称的保存记录' : '该主文件夹名称当前还没有保存记录');
      return data.session ?? null;
    } catch {
      setLoadMessage('读取已保存记录失败');
      return null;
    }
  }

  async function handleFolderPick(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);

    for (const image of images) {
      URL.revokeObjectURL(image.url);
    }

    setSaveMessage('');

    if (selectedFiles.length === 0) {
      setImages([]);
      setRootName('');
      setDiffSummary(null);
      setIsRootMismatch(false);
      return;
    }

    const firstPath = (selectedFiles[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const nextRootName = firstPath.split('/').filter(Boolean)[0] || '';
    setRootName(nextRootName);
    const sessionForRoot = await loadSession(nextRootName);

    const baseRecords = selectedFiles
      .filter((file) => IMAGE_EXT_RE.test(file.name))
      .map((file, index) => {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const segments = relativePath.split('/').filter(Boolean);
        const folderName = segments.length >= 3 ? segments[1] : '根目录';

        return {
          relativePath,
          folderName,
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          sortOrder: index,
          file,
        };
      });

    const savedSortMap = new Map(
      (sessionForRoot?.files ?? []).map((saved) => [saved.relativePath, saved.sortOrder]),
    );
    const sortedRecords = baseRecords.map((record) => ({
      ...record,
      sortOrder: savedSortMap.get(record.relativePath) ?? record.sortOrder,
    }));

    const nextImages = sortedRecords.map((record, index) => ({
      id: `${record.relativePath}-${record.size}-${record.lastModified}-${index}`,
      name: record.name,
      relativePath: record.relativePath,
      folderName: record.folderName,
      size: record.size,
      lastModified: record.lastModified,
      url: URL.createObjectURL(record.file),
      sortOrder: record.sortOrder,
    }));

    setImages(nextImages);
    setDiffSummary(diffWithSession(nextImages, sessionForRoot));
    event.target.value = '';
  }

  function moveImage(folderName: string, imageId: string, direction: -1 | 1) {
    setImages((current) => {
      const folderImages = current
        .filter((image) => image.folderName === folderName)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN'));
      const index = folderImages.findIndex((image) => image.id === imageId);
      const targetIndex = index + direction;

      if (index < 0 || targetIndex < 0 || targetIndex >= folderImages.length) {
        return current;
      }

      const reordered = [...folderImages];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(targetIndex, 0, moved);

      const orderMap = new Map(reordered.map((image, nextIndex) => [image.id, nextIndex]));

      return current.map((image) => {
        if (image.folderName !== folderName) return image;
        const nextOrder = orderMap.get(image.id);
        return nextOrder == null ? image : { ...image, sortOrder: nextOrder };
      });
    });
  }

  async function handleSave() {
    if (!rootName || images.length === 0) {
      setSaveMessage('当前没有可保存的目录内容');
      return;
    }

    setSaveMessage('保存中...');

    const orderedFiles = [...images]
      .sort((a, b) => {
        if (a.folderName !== b.folderName) return a.folderName.localeCompare(b.folderName, 'zh-CN');
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name, 'zh-CN');
      })
      .map(buildRecordFromImage);

    try {
      const res = await fetch('/api/test-css/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rootName,
          files: orderedFiles,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSaveMessage(data.error || '保存失败');
        return;
      }

      setPersistedSession(data.session);
      setKnownRootNames(Array.isArray(data.knownRootNames) ? data.knownRootNames : []);
      setDiffSummary(diffWithSession(images, data.session));
      setSaveMessage(`已保存，时间：${formatTime(new Date(data.session.savedAt).getTime())}`);
    } catch {
      setSaveMessage('保存失败');
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Folder Preview Lab</p>
          <h1>按主文件夹名称保存文本记录，同名目录复用上次位置</h1>
          <p className={styles.description}>
            当前测试版直接用所选主文件夹名称作为记录键。同名主文件夹会复用上次位置，不同主文件夹分别保存。
          </p>
        </div>

        <div className={styles.pickerCard}>
          <div className={styles.persistBox}>
            <span className={styles.persistLabel}>主文件夹记录键</span>
            <strong>{rootName || '未选择主文件夹'}</strong>
            <p>{loadMessage}</p>
            {knownRootNames.length > 0 ? (
              <div className={styles.knownPaths}>
                {knownRootNames.map((item) => (
                  <button
                    key={item}
                    className={styles.pathChip}
                    type="button"
                    onClick={() => {
                      void loadSession(item);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <label className={styles.pickerLabel}>
            <span className={styles.pickerTitle}>选择目录</span>
            <span className={styles.pickerHint}>建议目录结构：根目录 / 地点名 / 图片文件</span>
            <input
              {...directoryInputProps}
              className={styles.fileInput}
              type="file"
              multiple
              onChange={handleFolderPick}
            />
            <span className={styles.pickerButton}>打开文件夹</span>
          </label>

          <div className={styles.persistBox}>
            <span className={styles.persistLabel}>文本记录状态</span>
            <strong>{persistedSession?.rootName || '暂无'}</strong>
            <p>当前以主文件夹名称作为记录键</p>
            {persistedSession?.savedAt ? (
              <p>上次保存：{formatTime(new Date(persistedSession.savedAt).getTime())}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>当前主文件夹名称</span>
          <strong>{rootName || '未选择'}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>已命中记录</span>
          <strong>{persistedSession?.rootName || '暂无'}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>地点分组</span>
          <strong>{summary.folderCount}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>图片数量 / 总大小</span>
          <strong>{summary.imageCount} / {formatBytes(summary.totalSize)}</strong>
        </div>
      </section>

      <section className={styles.toolbar}>
        <button className={styles.primaryAction} onClick={handleSave} type="button">
          保存当前排序
        </button>
        {saveMessage ? <span className={styles.saveMessage}>{saveMessage}</span> : null}
      </section>

      {diffSummary ? (
        <section className={styles.diffPanel}>
          <div className={styles.diffCard}>
            <span className={styles.summaryLabel}>无差异</span>
            <strong>{diffSummary.unchanged}</strong>
          </div>
          <div className={styles.diffCard}>
            <span className={styles.summaryLabel}>新增文件</span>
            <strong>{diffSummary.added.length}</strong>
          </div>
          <div className={styles.diffCard}>
            <span className={styles.summaryLabel}>缺失文件</span>
            <strong>{diffSummary.removed.length}</strong>
          </div>
          <div className={styles.diffCard}>
            <span className={styles.summaryLabel}>已变化</span>
            <strong>{diffSummary.changed.length}</strong>
          </div>
        </section>
      ) : null}

      {diffSummary && (diffSummary.added.length > 0 || diffSummary.removed.length > 0 || diffSummary.changed.length > 0) ? (
        <section className={styles.diffDetails}>
          {diffSummary.added.length > 0 ? (
            <div className={styles.diffList}>
              <h3>新增文件</h3>
              {diffSummary.added.slice(0, 12).map((item) => (
                <code key={`added-${item.relativePath}`}>{item.relativePath}</code>
              ))}
            </div>
          ) : null}
          {diffSummary.removed.length > 0 ? (
            <div className={styles.diffList}>
              <h3>缺失文件</h3>
              {diffSummary.removed.slice(0, 12).map((item) => (
                <code key={`removed-${item.relativePath}`}>{item.relativePath}</code>
              ))}
            </div>
          ) : null}
          {diffSummary.changed.length > 0 ? (
            <div className={styles.diffList}>
              <h3>已变化文件</h3>
              {diffSummary.changed.slice(0, 12).map((item) => (
                <code key={`changed-${item.current.relativePath}`}>{item.current.relativePath}</code>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {groups.length === 0 ? (
        <section className={styles.emptyState}>
          <h2>还没有可展示的图片</h2>
          <p>选择一个文件夹后，这里会按子文件夹名自动分组显示图片，并允许保存组内排序。</p>
        </section>
      ) : (
        <section className={styles.groupList}>
          {groups.map((group) => (
            <article key={group.name} className={styles.groupCard}>
              <div className={styles.groupHeader}>
                <div>
                  <h2>{group.name}</h2>
                  <p>{group.images.length} 张图片，可手动调整顺序</p>
                </div>
              </div>

              <div className={styles.grid}>
                {group.images.map((image, index) => (
                  <figure key={image.id} className={styles.imageCard}>
                    <div className={styles.imageWrap}>
                      <img src={image.url} alt={image.name} className={styles.image} />
                    </div>
                    <figcaption className={styles.meta}>
                      <strong title={image.name}>{image.name}</strong>
                      <span>位置：{index + 1}</span>
                      <span>{formatBytes(image.size)}</span>
                      <span>{formatTime(image.lastModified)}</span>
                      <code title={image.relativePath}>{image.relativePath}</code>
                      <div className={styles.actions}>
                        <button
                          className={styles.sortButton}
                          type="button"
                          onClick={() => moveImage(group.name, image.id, -1)}
                          disabled={index === 0}
                        >
                          上移
                        </button>
                        <button
                          className={styles.sortButton}
                          type="button"
                          onClick={() => moveImage(group.name, image.id, 1)}
                          disabled={index === group.images.length - 1}
                        >
                          下移
                        </button>
                      </div>
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
