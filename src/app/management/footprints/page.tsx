'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '../admin-auth';

interface StorageStat {
  userId: number;
  userPhone: string;
  userNickname: string | null;
  fileCount: number;
  totalSize: number;
  placeCount: number;
}

interface StorageFile {
  id: number;
  userId: number;
  placeTitle: string;
  filename: string;
  size: number;
  createdAt: string;
}

interface CloudHintItem {
  folderId: string;
  folderName: string;
  assetCount: number;
  status: string;
  reason: string;
  sampleThumbnailUrl: string | null;
}

interface UserCloudHintGroup {
  mountId: number;
  footprintItemId: number;
  itemName: string;
  rootPath: string;
  connectionState: string;
  totalFolders: number;
  totalAssets: number;
  hints: CloudHintItem[];
}

export default function FootprintsPage() {
  const [storage, setStorage] = useState<StorageStat[]>([]);
  const [storageDetail, setStorageDetail] = useState<StorageFile[]>([]);
  const [detailUser, setDetailUser] = useState<number | null>(null);
  const [cloudHints, setCloudHints] = useState<UserCloudHintGroup[]>([]);
  const [cloudHintUser, setCloudHintUser] = useState<number | null>(null);
  const [syncingMountId, setSyncingMountId] = useState<number | null>(null);
  const [bindingHintKey, setBindingHintKey] = useState<string | null>(null);
  const [rollingBackItemId, setRollingBackItemId] = useState<number | null>(null);
  const { token } = useAdminAuth();

  useEffect(() => { loadStorage(); }, [token]);

  async function loadStorage() {
    try {
      const res = await fetch('/api/admin/footprints?type=storage', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setStorage(data.storage || []);
    } catch (err) { console.error(err); }
  }

  async function loadStorageDetail(uid: number) {
    try {
      const res = await fetch(`/api/admin/footprints?type=storage_detail&user_id=${uid}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setStorageDetail(data.files || []);
      setDetailUser(uid);
    } catch (err) { console.error(err); }
  }

  async function handleDeleteFile(fileId: number) {
    if (!confirm('确定删除该文件？')) return;
    await fetch(`/api/admin/footprints?type=storage_delete&file_id=${fileId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    loadStorage();
    if (detailUser) loadStorageDetail(detailUser);
  }

  async function loadCloudHints(uid: number) {
    try {
      const res = await fetch(`/api/admin/footprints?type=cloud_hints&user_id=${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCloudHints(data.hints || []);
      setCloudHintUser(uid);
    } catch (err) { console.error(err); }
  }

  async function handleAdminSync(uid: number, itemId: number) {
    try {
      setSyncingMountId(itemId);
      const res = await fetch('/api/admin/footprints', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'cloud_sync', user_id: uid, item_id: itemId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '同步失败');
        return;
      }
      await loadStorage();
      await loadCloudHints(uid);
    } catch (err) {
      console.error(err);
      alert('同步失败');
    } finally {
      setSyncingMountId(null);
    }
  }

  async function handleAdminBindHint(uid: number, itemId: number, folderId: string) {
    const key = `${itemId}:${folderId}`;
    try {
      setBindingHintKey(key);
      const res = await fetch('/api/admin/footprints', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'cloud_bind_hint', user_id: uid, item_id: itemId, folder_id: folderId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '绑定失败');
        return;
      }
      await loadStorage();
      await loadCloudHints(uid);
    } catch (err) {
      console.error(err);
      alert('绑定失败');
    } finally {
      setBindingHintKey(null);
    }
  }

  async function handleAdminRollback(uid: number, itemId: number) {
    try {
      setRollingBackItemId(itemId);
      const res = await fetch('/api/admin/footprints', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'cloud_rollback_hint', user_id: uid, item_id: itemId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '回退失败');
        return;
      }
      await loadStorage();
      await loadCloudHints(uid);
    } catch (err) {
      console.error(err);
      alert('回退失败');
    } finally {
      setRollingBackItemId(null);
    }
  }

  function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 20 }}>存储管理</h1>

      {storage.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', background: '#fff', borderRadius: 12 }}>暂无存储数据</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>{storage.length}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>有上传的用户</div>
            </div>
            <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>
                {formatSize(storage.reduce((s, u) => s + u.totalSize, 0))}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>总存储量</div>
            </div>
            <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>
                {storage.reduce((s, u) => s + u.fileCount, 0)}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>总文件数</div>
            </div>
            <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#8b5cf6' }}>
                {storage.reduce((s, u) => s + u.placeCount, 0)}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>覆盖地点数</div>
            </div>
          </div>

          {/* Per-user table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#374151', fontSize: 12 }}>用户</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#374151', fontSize: 12 }}>地点数</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#374151', fontSize: 12 }}>文件数</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#374151', fontSize: 12 }}>存储用量</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#374151', fontSize: 12 }}>配额</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#374151', fontSize: 12 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {storage.map(s => (
                  <>
                    <tr key={s.userId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px', color: '#374151' }}>
                        {s.userNickname || s.userPhone}
                        <span style={{ color: '#9ca3af', fontSize: 11, marginLeft: 8 }}>ID:{s.userId}</span>
                      </td>
                      <td style={{ padding: '12px', color: '#374151' }}>{s.placeCount}</td>
                      <td style={{ padding: '12px', color: '#374151' }}>{s.fileCount}</td>
                      <td style={{ padding: '12px', color: '#374151' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden', maxWidth: 120 }}>
                            <div style={{ height: '100%', width: `${Math.min(100, (s.totalSize / (5 * 1024 * 1024 * 1024)) * 100)}%`, background: s.totalSize > 4.5 * 1024 * 1024 * 1024 ? '#ef4444' : '#3b82f6', borderRadius: 3, minWidth: s.totalSize > 0 ? 4 : 0 }} />
                          </div>
                          <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatSize(s.totalSize)}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px', color: '#374151' }}><span style={{ fontSize: 11, color: '#9ca3af' }}>5 GB</span></td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => detailUser === s.userId ? (setDetailUser(null), setStorageDetail([])) : loadStorageDetail(s.userId)}
                            style={{ padding: '4px 10px', fontSize: 11, background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                          >
                            {detailUser === s.userId ? '收起文件' : '文件详情'}
                          </button>
                          <button
                            onClick={() => cloudHintUser === s.userId ? (setCloudHintUser(null), setCloudHints([])) : loadCloudHints(s.userId)}
                            style={{ padding: '4px 10px', fontSize: 11, background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                          >
                            {cloudHintUser === s.userId ? '收起挂载网盘提示' : '挂载网盘提示'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {detailUser === s.userId && (
                      <tr>
                        <td colSpan={6} style={{ padding: '0 16px 12px' }}>
                          {storageDetail.length === 0 ? (
                            <p style={{ color: '#9ca3af', fontSize: 12, padding: 8 }}>无文件</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 240, overflowY: 'auto' }}>
                              {storageDetail.map(f => (
                                <div key={f.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 12,
                                  padding: '6px 10px', background: '#f9fafb', borderRadius: 4, fontSize: 12,
                                }}>
                                  <span style={{ fontWeight: 500, minWidth: 100 }}>{f.placeTitle}</span>
                                  <span style={{ color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</span>
                                  <span style={{ color: '#9ca3af', whiteSpace: 'nowrap' }}>{formatSize(f.size)}</span>
                                  <span style={{ color: '#9ca3af', whiteSpace: 'nowrap' }}>{new Date(f.createdAt).toLocaleDateString()}</span>
                                  <button
                                    onClick={() => handleDeleteFile(f.id)}
                                    style={{ padding: '2px 6px', fontSize: 10, background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 3, cursor: 'pointer' }}
                                  >
                                    删除
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    {cloudHintUser === s.userId && (
                      <tr>
                        <td colSpan={6} style={{ padding: '0 16px 16px' }}>
                          {cloudHints.length === 0 ? (
                            <p style={{ color: '#9ca3af', fontSize: 12, padding: 8 }}>当前没有未匹配目录</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {cloudHints.map(group => (
                                <div key={group.mountId} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 12 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8, fontSize: 12 }}>
                                    <div>
                                      <div style={{ fontWeight: 600, color: '#78350f' }}>{group.itemName}</div>
                                      <div style={{ color: '#a16207', marginTop: 2 }}>当前挂载网盘：{group.rootPath}</div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                                      <div style={{ color: group.connectionState === 'connected' ? '#15803d' : '#b91c1c', whiteSpace: 'nowrap' }}>
                                        {group.connectionState === 'connected' ? '连接正常' : '连接异常'}
                                      </div>
                                      <button
                                        onClick={() => handleAdminSync(s.userId, group.footprintItemId)}
                                        disabled={syncingMountId === group.footprintItemId}
                                        style={{ padding: '4px 10px', fontSize: 11, background: '#dcfce7', color: '#166534', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                      >
                                        {syncingMountId === group.footprintItemId ? '同步中...' : '重试同步挂载网盘'}
                                      </button>
                                      <button
                                        onClick={() => handleAdminRollback(s.userId, group.footprintItemId)}
                                        disabled={rollingBackItemId === group.footprintItemId}
                                        style={{ padding: '4px 10px', fontSize: 11, background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                      >
                                        {rollingBackItemId === group.footprintItemId ? '回退中...' : '回退已绑定图片'}
                                      </button>
                                    </div>
                                  </div>
                                  <div style={{ fontSize: 12, color: '#92400e', marginBottom: 8 }}>
                                    当前挂载网盘下有 {group.totalFolders} 条未匹配提示，涉及 {group.totalAssets} 张图片
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {group.hints.map(hint => (
                                      <div key={`${group.mountId}-${hint.folderId}`} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 8, padding: 8 }}>
                                        {hint.sampleThumbnailUrl ? (
                                          <img src={hint.sampleThumbnailUrl} alt={hint.folderName} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                                        ) : (
                                          <div style={{ width: 44, height: 44, borderRadius: 6, background: '#f3f4f6', flexShrink: 0 }} />
                                        )}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{hint.folderName}</div>
                                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                                            {hint.assetCount} 张 · {hint.reason === 'no_place_match' ? '未匹配地点' : hint.reason}
                                          </div>
                                        </div>
                                        <button
                                          onClick={() => handleAdminBindHint(s.userId, group.footprintItemId, hint.folderId)}
                                          disabled={bindingHintKey === `${group.footprintItemId}:${hint.folderId}`}
                                          style={{ padding: '5px 10px', fontSize: 11, background: '#eff6ff', color: '#1d4ed8', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                        >
                                          {bindingHintKey === `${group.footprintItemId}:${hint.folderId}` ? '绑定中...' : '绑定到当前足迹项'}
                                        </button>
                                        <span style={{ fontSize: 10, color: '#b45309', background: '#fef3c7', borderRadius: 999, padding: '3px 8px' }}>
                                          {hint.status}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
