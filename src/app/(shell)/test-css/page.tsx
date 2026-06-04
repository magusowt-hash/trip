'use client';

import { useMemo, useState } from 'react';
import rawReplaySnapshot from './fixtures/1-mapped-layout.json';
import { buildReplaySnapshot } from './replayData';
import styles from './page.module.css';

function downloadJsonFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function TestCssPage() {
  const replaySnapshot = buildReplaySnapshot(rawReplaySnapshot);
  const [selectedTab, setSelectedTab] = useState<'items' | 'poi' | 'layouts' | 'photos' | 'solver'>('photos');
  const { selectedGroupId, selectedGroupName, exportedAt, pageState, solverInputSnapshot } = replaySnapshot;

  const photoGroups = useMemo(() => {
    const counts = new Map<string, { placeTitle: string; photoCount: number }>();
    for (const photo of pageState.photos) {
      const current = counts.get(photo.placeKey) ?? { placeTitle: photo.placeTitle, photoCount: 0 };
      current.photoCount += 1;
      counts.set(photo.placeKey, current);
    }
    return Array.from(counts.entries())
      .map(([placeKey, value]) => ({ placeKey, ...value }))
      .sort((left, right) => right.photoCount - left.photoCount);
  }, [pageState.photos]);

  const previewJson = useMemo(() => {
    if (selectedTab === 'items') return JSON.stringify(pageState.items.slice(0, 20), null, 2);
    if (selectedTab === 'poi') return JSON.stringify(pageState.poiPoints, null, 2);
    if (selectedTab === 'layouts') return JSON.stringify(pageState.groupLayouts, null, 2);
    if (selectedTab === 'solver') return JSON.stringify(solverInputSnapshot, null, 2);
    return JSON.stringify(pageState.photos.slice(0, 30), null, 2);
  }, [pageState.groupLayouts, pageState.items, pageState.photos, pageState.poiPoints, selectedTab, solverInputSnapshot]);

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h1 className={styles.title}>映射布局重放页</h1>
          <p className={styles.subtitle}>`test-css` 现直接内置真实导出的 mapped-layout JSON，用于稳定复现正式页布局输入。</p>
        </div>

        <div className={styles.statusCard}>
          <div>导出时间: <strong>{new Date(exportedAt).toLocaleString('zh-CN')}</strong></div>
          <div>组 ID: <strong>{selectedGroupId}</strong></div>
          <div>组名: <strong>{selectedGroupName}</strong></div>
          <div>条目数: <strong>{pageState.items.length}</strong></div>
          <div>POI 数: <strong>{pageState.poiPoints.length}</strong></div>
          <div>布局数: <strong>{pageState.groupLayouts.length}</strong></div>
          <div>照片数: <strong>{pageState.photos.length}</strong></div>
          <div>Locked 组: <strong>{solverInputSnapshot.lockedGroups.length}</strong></div>
          <div>Pending 组: <strong>{solverInputSnapshot.pendingGroups.length}</strong></div>
        </div>

        <div className={styles.groupList}>
          {photoGroups.slice(0, 12).map((group) => (
            <div key={group.placeKey} className={styles.groupButton}>
              <span className={styles.groupName}>{group.placeTitle}</span>
              <span className={styles.groupMeta}>{group.placeKey} · {group.photoCount} 张</span>
            </div>
          ))}
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.toolbar}>
          <div>
            <h2 className={styles.sectionTitle}>真实导出快照</h2>
            <p className={styles.sectionHint}>这里不再请求服务器，页面仅重放 `pageState + solverInputSnapshot`，便于我们对正式页布局链路做一致性排查。</p>
          </div>
          <div className={styles.toolbarActions}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => downloadJsonFile(`${selectedGroupName}-embedded-mapped-layout.json`, replaySnapshot)}
            >
              下载内置 JSON
            </button>
          </div>
        </div>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>数据切片</span>
            <div className={styles.tabRow}>
              <button type="button" className={`${styles.tabButton} ${selectedTab === 'items' ? styles.tabButtonActive : ''}`} onClick={() => setSelectedTab('items')}>items</button>
              <button type="button" className={`${styles.tabButton} ${selectedTab === 'poi' ? styles.tabButtonActive : ''}`} onClick={() => setSelectedTab('poi')}>poi</button>
              <button type="button" className={`${styles.tabButton} ${selectedTab === 'layouts' ? styles.tabButtonActive : ''}`} onClick={() => setSelectedTab('layouts')}>layouts</button>
              <button type="button" className={`${styles.tabButton} ${selectedTab === 'photos' ? styles.tabButtonActive : ''}`} onClick={() => setSelectedTab('photos')}>photos</button>
              <button type="button" className={`${styles.tabButton} ${selectedTab === 'solver' ? styles.tabButtonActive : ''}`} onClick={() => setSelectedTab('solver')}>solver</button>
            </div>
          </div>
          <pre className={styles.codeBlock}>{previewJson}</pre>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>布局关键输入概览</span>
            <span>mapRect / gap / scale</span>
          </div>
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>mapRect</div>
              <div className={styles.metricValue}>{`${solverInputSnapshot.mapRect.left}, ${solverInputSnapshot.mapRect.top} → ${solverInputSnapshot.mapRect.right}, ${solverInputSnapshot.mapRect.bottom}`}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>safeGap</div>
              <div className={styles.metricValue}>{solverInputSnapshot.safeGap}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>labelGapBoost</div>
              <div className={styles.metricValue}>{solverInputSnapshot.labelGapBoost}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>collisionScale</div>
              <div className={styles.metricValue}>{solverInputSnapshot.collisionScale}</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
