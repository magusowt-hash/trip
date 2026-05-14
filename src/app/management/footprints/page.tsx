'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '../admin-auth';

interface FootprintGroup {
  id: number;
  userId: number;
  userPhone: string;
  userNickname: string | null;
  name: string;
  isDefault: number;
  itemCount: number;
  createdAt: string;
}

interface FootprintItem {
  id: number;
  groupId: number;
  listItemId: number;
  title: string | null;
  coverImage: string | null;
  address: string | null;
  addedAt: string;
}

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

export default function FootprintsPage() {
  const [activeTab, setActiveTab] = useState<'groups' | 'storage'>('groups');

  // Groups
  const [groups, setGroups] = useState<FootprintGroup[]>([]);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);
  const [expandedItems, setExpandedItems] = useState<FootprintItem[]>([]);

  // Storage
  const [storage, setStorage] = useState<StorageStat[]>([]);
  const [storageDetail, setStorageDetail] = useState<StorageFile[]>([]);
  const [detailUser, setDetailUser] = useState<number | null>(null);

  const { token } = useAdminAuth();

  useEffect(() => {
    if (activeTab === 'groups') loadGroups();
    else loadStorage();
  }, [activeTab, token]);

  // ───── Groups ─────
  async function loadGroups() {
    try {
      const res = await fetch('/api/admin/footprints', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setGroups(data.groups || []);
    } catch (err) { console.error(err); }
  }

  async function loadItems(groupId: number) {
    try {
      const res = await fetch(`/api/admin/footprints?group_id=${groupId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setExpandedItems(data.items || []);
    } catch (err) { console.error(err); }
  }

  async function handleDeleteGroup(groupId: number) {
    if (!confirm('确定删除该分类组？这将同时删除组内所有地点关联。')) return;
    await fetch(`/api/admin/footprints?group_id=${groupId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (expandedGroup === groupId) { setExpandedGroup(null); setExpandedItems([]); }
    loadGroups();
  }

  async function handleRemoveItem(itemId: number) {
    if (!confirm('确定从分类组移除该地点？')) return;
    await fetch(`/api/admin/footprints?item_id=${itemId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (expandedGroup) loadItems(expandedGroup);
    loadGroups();
  }

  function handleToggleGroup(groupId: number) {
    if (expandedGroup === groupId) { setExpandedGroup(null); setExpandedItems([]); }
    else { setExpandedGroup(groupId); loadItems(groupId); }
  }

  // ───── Storage ─────
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

  function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 20 }}>足迹管理</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #e5e7eb' }}>
        {(['groups', 'storage'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 500,
              border: 'none',
              background: 'none',
              color: activeTab === tab ? '#3b82f6' : '#6b7280',
              borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
            }}
          >
            {tab === 'groups' ? '📋 分类组' : '💾 存储管理'}
          </button>
        ))}
      </div>

      {/* Groups Tab */}
      {activeTab === 'groups' && (
        <div style={cardStyle}>
          {groups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>暂无足迹数据</div>
          ) : (
            groups.map(group => (
              <div key={group.id} style={{ marginBottom: 4 }}>
                <div
                  onClick={() => handleToggleGroup(group.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    background: '#f9fafb', borderRadius: 8, cursor: 'pointer',
                    border: expandedGroup === group.id ? '1px solid #3b82f6' : '1px solid #e5e7eb',
                  }}
                >
                  <span style={{ fontSize: 13, color: '#9ca3af', minWidth: 40 }}>#{group.id}</span>
                  <span style={{ flex: 1, fontWeight: 500 }}>
                    <span style={{ color: '#374151' }}>{group.userNickname || group.userPhone}</span>
                    <span style={{ color: '#9ca3af', margin: '0 6px' }}>/</span>
                    <span style={{ color: expandedGroup === group.id ? '#3b82f6' : '#1f2937' }}>{group.name}</span>
                  </span>
                  {group.isDefault === 1 && <span style={badgeStyle}>默认</span>}
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>{group.itemCount} 项</span>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>{new Date(group.createdAt).toLocaleDateString()}</span>
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                    style={{ padding: '4px 12px', fontSize: 11, background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer' }}
                  >
                    删除组
                  </button>
                </div>

                {expandedGroup === group.id && (
                  <div style={{ marginLeft: 52, marginTop: 4, marginBottom: 8 }}>
                    {expandedItems.length === 0 ? (
                      <p style={{ color: '#9ca3af', fontSize: 13, padding: 12 }}>暂无地点</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {expandedItems.map(item => (
                          <div key={item.id} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 12px', background: '#fff', borderRadius: 6,
                            border: '1px solid #f3f4f6',
                          }}>
                            {item.coverImage ? (
                              <img src={item.coverImage} alt="" width={36} height={36} style={{ borderRadius: 4, objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: 36, height: 36, borderRadius: 4, background: '#f3f4f6' }} />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{item.title || `#${item.listItemId}`}</div>
                              {item.address && <div style={{ fontSize: 11, color: '#9ca3af' }}>{item.address}</div>}
                            </div>
                            <span style={{ fontSize: 11, color: '#9ca3af' }}>
                              {item.addedAt ? new Date(item.addedAt).toLocaleDateString() : ''}
                            </span>
                            <button
                              onClick={() => handleRemoveItem(item.id)}
                              style={{ padding: '2px 8px', fontSize: 11, background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer' }}
                            >
                              移除
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Storage Tab */}
      {activeTab === 'storage' && (
        <div style={cardStyle}>
          {storage.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>暂无存储数据</div>
          ) : (
            <>
              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                <div style={statCardStyle}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>{storage.length}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>有上传的用户</div>
                </div>
                <div style={statCardStyle}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>
                    {formatSize(storage.reduce((s, u) => s + u.totalSize, 0))}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>总存储量</div>
                </div>
                <div style={statCardStyle}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>
                    {storage.reduce((s, u) => s + u.fileCount, 0)}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>总文件数</div>
                </div>
              </div>

              {/* Per-user table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <th style={thStyle}>用户</th>
                      <th style={thStyle}>地点数</th>
                      <th style={thStyle}>文件数</th>
                      <th style={thStyle}>存储用量</th>
                      <th style={thStyle}>配额</th>
                      <th style={thStyle}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storage.map(s => (
                      <>
                        <tr key={s.userId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={tdStyle}>
                            {s.userNickname || s.userPhone}
                            <span style={{ color: '#9ca3af', fontSize: 11, marginLeft: 8 }}>ID:{s.userId}</span>
                          </td>
                          <td style={tdStyle}>{s.placeCount}</td>
                          <td style={tdStyle}>{s.fileCount}</td>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.min(100, (s.totalSize / (5 * 1024 * 1024 * 1024)) * 100)}%`, background: s.totalSize > 4.5 * 1024 * 1024 * 1024 ? '#ef4444' : '#3b82f6', borderRadius: 3, minWidth: s.totalSize > 0 ? 4 : 0 }} />
                              </div>
                              <span style={{ fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>{formatSize(s.totalSize)}</span>
                            </div>
                          </td>
                          <td style={tdStyle}><span style={{ fontSize: 11, color: '#9ca3af' }}>5 GB</span></td>
                          <td style={tdStyle}>
                            <button
                              onClick={() => loadStorageDetail(s.userId)}
                              style={{ padding: '4px 10px', fontSize: 11, background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                            >
                              查看文件
                            </button>
                          </td>
                        </tr>
                        {detailUser === s.userId && (
                          <tr>
                            <td colSpan={6} style={{ padding: '0 16px 12px' }}>
                              {storageDetail.length === 0 ? (
                                <p style={{ color: '#9ca3af', fontSize: 12, padding: 8 }}>无文件</p>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
                                  {storageDetail.map(f => (
                                    <div key={f.id} style={{
                                      display: 'flex', alignItems: 'center', gap: 12,
                                      padding: '6px 10px', background: '#f9fafb', borderRadius: 4, fontSize: 12,
                                    }}>
                                      <span style={{ fontWeight: 500 }}>{f.placeTitle}</span>
                                      <span style={{ color: '#6b7280', flex: 1 }}>{f.filename}</span>
                                      <span style={{ color: '#9ca3af' }}>{formatSize(f.size)}</span>
                                      <span style={{ color: '#9ca3af' }}>{new Date(f.createdAt).toLocaleDateString()}</span>
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
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

const statCardStyle: React.CSSProperties = {
  background: '#f9fafb', borderRadius: 10, padding: 16, border: '1px solid #f3f4f6',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#374151', fontSize: 12,
};

const tdStyle: React.CSSProperties = {
  padding: '12px', color: '#374151', verticalAlign: 'middle',
};

const badgeStyle: React.CSSProperties = {
  fontSize: 11, padding: '2px 6px', background: '#dbeafe', color: '#3b82f6', borderRadius: 4,
};
