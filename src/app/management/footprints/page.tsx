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
  addedAt: string;
}

export default function FootprintsPage() {
  const [groups, setGroups] = useState<FootprintGroup[]>([]);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);
  const [expandedItems, setExpandedItems] = useState<FootprintItem[]>([]);
  const { token } = useAdminAuth();

  useEffect(() => {
    loadGroups();
  }, [token]);

  async function loadGroups() {
    try {
      const res = await fetch('/api/admin/footprints', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setGroups(data.groups || []);
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
  }

  async function loadItems(groupId: number) {
    try {
      const res = await fetch(`/api/admin/footprints?group_id=${groupId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setExpandedItems(data.items || []);
    } catch (err) {
      console.error('Failed to load items:', err);
    }
  }

  async function handleDeleteGroup(groupId: number) {
    if (!confirm('确定删除该分类组？这将同时删除组内所有地点关联。')) return;
    try {
      await fetch(`/api/admin/footprints?group_id=${groupId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (expandedGroup === groupId) {
        setExpandedGroup(null);
        setExpandedItems([]);
      }
      loadGroups();
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  }

  async function handleRemoveItem(itemId: number) {
    if (!confirm('确定从分类组移除该地点？')) return;
    try {
      await fetch(`/api/admin/footprints?item_id=${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (expandedGroup) {
        loadItems(expandedGroup);
      }
      loadGroups();
    } catch (err) {
      console.error('Failed to remove item:', err);
    }
  }

  function handleToggleGroup(groupId: number) {
    if (expandedGroup === groupId) {
      setExpandedGroup(null);
      setExpandedItems([]);
    } else {
      setExpandedGroup(groupId);
      loadItems(groupId);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>足迹分组管理</h1>

      {groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
          暂无足迹数据
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>ID</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>用户</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>分类组名</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>默认</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>地点数</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>创建时间</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <>
                <tr key={group.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151' }}>{group.id}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151' }}>
                    {group.userNickname || group.userPhone}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151' }}>
                    <button
                      onClick={() => handleToggleGroup(group.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontWeight: 500 }}
                    >
                      {expandedGroup === group.id ? '▾ ' : '▸ '}
                      {group.name}
                    </button>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151' }}>{group.isDefault === 1 ? '✅' : '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151' }}>{group.itemCount}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151' }}>{new Date(group.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151' }}>
                    <button
                      onClick={() => handleDeleteGroup(group.id)}
                      style={{ padding: '4px 12px', fontSize: 12, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    >
                      删除
                    </button>
                  </td>
                </tr>
                {expandedGroup === group.id && (
                  <tr key={`items-${group.id}`}>
                    <td colSpan={7} style={{ padding: 16, background: '#f9fafb' }}>
                      {expandedItems.length === 0 ? (
                        <p style={{ color: '#9ca3af', fontSize: 13 }}>暂无地点</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {expandedItems.map(item => (
                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fff', borderRadius: 6 }}>
                              <span style={{ fontSize: 13 }}>
                                地点ID: {item.listItemId} | 添加于: {new Date(item.addedAt).toLocaleString()}
                              </span>
                              <button
                                onClick={() => handleRemoveItem(item.id)}
                                style={{ padding: '2px 10px', fontSize: 11, background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer' }}
                              >
                                移除
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
      )}
    </div>
  );
}
