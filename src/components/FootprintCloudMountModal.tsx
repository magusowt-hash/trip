'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './FootprintCloudMountModal.module.css';

interface FootprintItemLite {
  id: number;
  title: string;
}

interface LastSyncSummary {
  importedAssetCount: number;
  skippedAssetCount: number;
  matchedFolderCount: number;
  unboundFolderCount: number;
}

interface CloudStatus {
  itemId: string;
  itemName: string;
  mountState: 'unmounted' | 'mounted';
  connectionState: 'unknown' | 'connected' | 'disconnected';
  syncState: 'idle' | 'syncing' | 'success' | 'failed';
  unboundFolderCount: number;
  unboundAssetCount: number;
  lastSyncAt: string | null;
  lastSyncStatus: 'success' | 'failed' | null;
  lastSyncSummary: LastSyncSummary | null;
  rootPath?: string | null;
}

interface HintItem {
  folderId: string;
  folderName: string;
  assetCount: number;
  status: string;
  reason: string;
}

interface MountCandidate {
  rootPath: string;
  displayName: string;
  provider: 'alist';
  connectionState: 'connected';
  matched: boolean;
}

interface Props {
  open: boolean;
  item: FootprintItemLite | null;
  onClose: () => void;
  onStatusChange?: (itemId: number, status: CloudStatus) => void;
}

const DEFAULT_MOUNT_PATH = '/';

export default function FootprintCloudMountModal({ open, item, onClose, onStatusChange }: Props) {
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [hints, setHints] = useState<HintItem[]>([]);
  const [mountPath, setMountPath] = useState(DEFAULT_MOUNT_PATH);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [bindingFolderId, setBindingFolderId] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MountCandidate[]>([]);

  async function loadStatus() {
    if (!item) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/footprints/cloud/mount/status?itemId=${item.id}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取状态失败');
      setStatus(data);
      setMountPath(data.rootPath || DEFAULT_MOUNT_PATH);
      if (typeof onStatusChange === 'function') onStatusChange(item.id, data);
      const candidatesRes = await fetch(`/api/footprints/cloud/mount/candidates?itemId=${item.id}`, { credentials: 'include' });
      const candidatesData = await candidatesRes.json();
      if (candidatesRes.ok) {
        setCandidates(candidatesData.candidates || []);
        if (!data.rootPath) {
          const matched = (candidatesData.candidates || []).find((candidate: MountCandidate) => candidate.matched);
          if (matched) setMountPath(matched.rootPath);
        }
      }
      if ((data.unboundFolderCount || 0) > 0) {
        const hintsRes = await fetch(`/api/footprints/cloud/hints?itemId=${item.id}`, { credentials: 'include' });
        const hintsData = await hintsRes.json();
        if (hintsRes.ok) setHints(hintsData.hints || []);
      } else {
        setHints([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取状态失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && item) void loadStatus();
  }, [open, item?.id]);

  const badgeClass = useMemo(() => {
    if (!status || status.mountState === 'unmounted') return styles.badgeIdle;
    if (status.connectionState === 'connected') return styles.badgeSuccess;
    if (status.connectionState === 'disconnected') return styles.badgeDanger;
    return styles.badgeIdle;
  }, [status]);

  const canSync = !!status && status.mountState === 'mounted' && status.connectionState === 'connected' && !syncing;

  async function handleConnect() {
    if (!item) return;
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/footprints/cloud/mount/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemId: item.id, rootPath: mountPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '挂载失败');
      setStatus(data.status);
      if (typeof onStatusChange === 'function') onStatusChange(item.id, data.status);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '挂载失败');
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync() {
    if (!item) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/footprints/cloud/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemId: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '同步失败');
      if (data.status) {
        setStatus(data.status);
        if (typeof onStatusChange === 'function') onStatusChange(item.id, data.status);
      }
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (!item) return;
    if (!confirm('确定解除当前足迹项的挂载网盘？')) return;
    setDisconnecting(true);
    setError(null);
    try {
      const res = await fetch(`/api/footprints/cloud/mount/connect?itemId=${item.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '解除挂载失败');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '解除挂载失败');
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleBindHint(folderId: string) {
    if (!item) return;
    setBindingFolderId(folderId);
    setError(null);
    try {
      const res = await fetch('/api/footprints/cloud/hints/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemId: item.id, folderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '绑定失败');
      if (data.status) {
        setStatus(data.status);
        if (typeof onStatusChange === 'function') onStatusChange(item.id, data.status);
      }
      setHints(data.hints?.hints || []);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '绑定失败');
    } finally {
      setBindingFolderId(null);
    }
  }

  async function handleRollback() {
    if (!item) return;
    if (!confirm('确定回退当前挂载网盘的已绑定图片，并恢复为未匹配提示？')) return;
    setRollingBack(true);
    setError(null);
    try {
      const res = await fetch('/api/footprints/cloud/hints/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemId: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '回退失败');
      if (data.status) {
        setStatus(data.status);
        if (typeof onStatusChange === 'function') onStatusChange(item.id, data.status);
      }
      setHints(data.hints?.hints || []);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '回退失败');
    } finally {
      setRollingBack(false);
    }
  }

  if (!open || !item) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>挂载网盘</div>
            <div className={styles.subtitle}>{item.title}</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className={styles.loading}>加载中...</div>
        ) : (
          <>
            <section className={styles.section}>
              <div className={styles.sectionTitle}>状态</div>
              <div className={styles.statusRow}>
                <span className={`${styles.badge} ${badgeClass}`}>
                  {!status || status.mountState === 'unmounted'
                    ? '未挂载'
                    : status.connectionState === 'connected'
                      ? '已挂载，连接正常'
                      : status.connectionState === 'disconnected'
                        ? '已挂载，连接异常'
                        : '已挂载，待检测'}
                </span>
                <span className={styles.metaText}>
                  {status?.lastSyncAt ? `最近同步 ${new Date(status.lastSyncAt).toLocaleString()}` : '尚未同步'}
                </span>
              </div>
              {status?.lastSyncSummary ? (
                <div className={styles.summaryGrid}>
                  <div><strong>{status.lastSyncSummary.importedAssetCount}</strong><span>导入图片</span></div>
                  <div><strong>{status.lastSyncSummary.matchedFolderCount}</strong><span>匹配目录</span></div>
                  <div><strong>{status.lastSyncSummary.unboundFolderCount}</strong><span>未匹配目录</span></div>
                  <div><strong>{status.lastSyncSummary.skippedAssetCount}</strong><span>跳过图片</span></div>
                </div>
              ) : (
                <div className={styles.placeholder}>尚未同步</div>
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionTitle}>操作</div>
              <label className={styles.label}>
                当前挂载网盘目录
                <input
                  className={styles.input}
                  value={mountPath}
                  onChange={e => setMountPath(e.target.value)}
                  placeholder="/user_xxx/地点目录"
                />
              </label>
              {candidates.length > 0 && (
                <div className={styles.candidateList}>
                  {candidates.map(candidate => (
                    <button
                      key={candidate.rootPath}
                      className={`${styles.candidateBtn} ${mountPath === candidate.rootPath ? styles.candidateBtnActive : ''}`}
                      onClick={() => setMountPath(candidate.rootPath)}
                    >
                      <span>{candidate.displayName}</span>
                      <span>{candidate.matched ? '推荐目录' : '可选目录'}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className={styles.actionRow}>
                {status?.mountState === 'unmounted' ? (
                  <button className={styles.primaryBtn} onClick={handleConnect} disabled={connecting}>
                    {connecting ? '挂载中...' : '确认挂载网盘'}
                  </button>
                ) : (
                  <>
                    <button className={styles.primaryBtn} onClick={handleConnect} disabled={connecting}>
                      {connecting ? '检测中...' : status?.connectionState === 'disconnected' ? '重试连接' : '更换挂载网盘'}
                    </button>
                    <button className={styles.secondaryBtn} onClick={handleSync} disabled={!canSync}>
                      {syncing ? '同步中...' : '同步挂载网盘'}
                    </button>
                    <button className={styles.secondaryBtn} onClick={handleRollback} disabled={rollingBack}>
                      {rollingBack ? '回退中...' : '回退已绑定图片'}
                    </button>
                    <button className={styles.dangerBtn} onClick={handleDisconnect} disabled={disconnecting}>
                      {disconnecting ? '处理中...' : '解除挂载网盘'}
                    </button>
                  </>
                )}
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionTitle}>未匹配</div>
              {status && status.unboundFolderCount > 0 ? (
                <>
                  <div className={styles.metaText}>待匹配 {status.unboundFolderCount} 个目录，{status.unboundAssetCount} 张图片</div>
                  <div className={styles.hintList}>
                    {hints.map(hint => (
                      <div key={hint.folderId} className={styles.hintItem}>
                        <div className={styles.hintText}>
                          <span>{hint.folderName}</span>
                          <span>{hint.assetCount} 张</span>
                        </div>
                        <button
                          className={styles.hintAction}
                          onClick={() => handleBindHint(hint.folderId)}
                          disabled={bindingFolderId === hint.folderId}
                        >
                          {bindingFolderId === hint.folderId ? '绑定中...' : '绑定到当前足迹项'}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className={styles.placeholder}>当前没有未匹配目录</div>
              )}
            </section>

            {error && <div className={styles.error}>{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}
