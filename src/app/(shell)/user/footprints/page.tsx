'use client';

import { useState, useEffect } from 'react';

interface FootprintGroup {
  id: number;
  name: string;
  isDefault: number;
  sortOrder: number;
  itemCount: number;
}

interface FootprintItem {
  id: number;
  listItemId: number;
  title: string;
  coverImage: string | null;
  description: string | null;
  lng: string | null;
  lat: string | null;
  address: string | null;
  listId: number | null;
  listName: string | null;
  addedAt: string;
}

export default function UserFootprintsPage() {
  const [groups, setGroups] = useState<FootprintGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [items, setItems] = useState<FootprintItem[]>([]);
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    item: FootprintItem;
    x: number;
    y: number;
  } | null>(null);
  const [addToGroupOpen, setAddToGroupOpen] = useState(false);
  const [targetItem, setTargetItem] = useState<FootprintItem | null>(null);

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    if (selectedGroupId) {
      loadItems(selectedGroupId);
    } else {
      setItems([]);
    }
  }, [selectedGroupId]);

  async function loadGroups() {
    try {
      const res = await fetch('/api/footprints/groups', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setGroups(data.groups || []);
      if (data.groups?.length > 0 && !selectedGroupId) {
        const defaultGroup = data.groups.find((g: FootprintGroup) => g.isDefault === 1);
        setSelectedGroupId(defaultGroup?.id ?? data.groups[0].id);
      }
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
  }

  async function loadItems(groupId: number) {
    try {
      const res = await fetch(`/api/footprints/groups/${groupId}/items`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error('Failed to load items:', err);
    }
  }

  async function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    try {
      const res = await fetch('/api/footprints/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newGroupName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '创建失败');
        return;
      }
      setNewGroupName('');
      setShowNewGroupInput(false);
      await loadGroups();
    } catch {
      alert('创建失败');
    }
  }

  async function handleSetDefault(groupId: number) {
    try {
      await fetch(`/api/footprints/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_default: true }),
      });
      await loadGroups();
    } catch {
      alert('设置默认失败');
    }
  }

  async function handleRenameGroup(groupId: number) {
    if (!editGroupName.trim()) return;
    try {
      await fetch(`/api/footprints/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: editGroupName.trim() }),
      });
      setEditingGroupId(null);
      await loadGroups();
    } catch {
      alert('重命名失败');
    }
  }

  async function handleDeleteGroup(groupId: number) {
    if (!confirm('确定删除此分类组及其所有地点？')) return;
    try {
      await fetch(`/api/footprints/groups/${groupId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (selectedGroupId === groupId) {
        setSelectedGroupId(null);
      }
      await loadGroups();
    } catch {
      alert('删除失败');
    }
  }

  async function handleRemoveItem(item: FootprintItem) {
    if (!selectedGroupId) return;
    try {
      await fetch(
        `/api/footprints/groups/${selectedGroupId}/items?item_id=${item.listItemId}`,
        { method: 'DELETE', credentials: 'include' },
      );
      await loadItems(selectedGroupId);
      await loadGroups();
    } catch {
      alert('移除失败');
    }
  }

  async function handleAddToGroup(item: FootprintItem, targetGroupId: number) {
    try {
      const res = await fetch(`/api/footprints/groups/${targetGroupId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ list_item_id: item.listItemId }),
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 409) {
          alert('该地点已在此分类组中');
        } else {
          alert(err.error || '添加失败');
        }
        return;
      }
      setAddToGroupOpen(false);
      setTargetItem(null);
      await loadGroups();
    } catch {
      alert('添加失败');
    }
  }

  function handleContextMenu(e: React.MouseEvent, item: FootprintItem) {
    e.preventDefault();
    setContextMenu({ item, x: e.clientX, y: e.clientY });
  }

  useEffect(() => {
    function handleClick() {
      setContextMenu(null);
    }
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 600 }}>我的足迹</h1>

      {/* Group tabs */}
      <div style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        paddingBottom: 8,
        marginBottom: 12,
        flexWrap: 'wrap',
      }}>
        {groups.map(group => (
          <div
            key={group.id}
            onClick={() => setSelectedGroupId(group.id)}
            style={{
              flexShrink: 0,
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 16,
              background: selectedGroupId === group.id ? '#3b82f6' : '#f3f4f6',
              color: selectedGroupId === group.id ? '#fff' : '#374151',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {group.name}
            {group.isDefault === 1 && (
              <span style={{
                fontSize: 10,
                background: 'rgba(255,255,255,0.3)',
                padding: '1px 4px',
                borderRadius: 4,
              }}>默认</span>
            )}
          </div>
        ))}
        <div
          onClick={() => setShowNewGroupInput(true)}
          style={{
            flexShrink: 0,
            padding: '6px 12px',
            fontSize: 12,
            borderRadius: 16,
            background: 'transparent',
            color: '#6b7280',
            border: '1px dashed #d1d5db',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          ＋新建
        </div>
      </div>

      {/* New group input */}
      {showNewGroupInput && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
          <input
            placeholder="输入分类组名称"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
            autoFocus
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: 12,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              outline: 'none',
            }}
          />
          <button
            onClick={handleCreateGroup}
            style={{ padding: '4px 12px', fontSize: 12, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            确定
          </button>
          <button
            onClick={() => { setShowNewGroupInput(false); setNewGroupName(''); }}
            style={{ padding: '4px 12px', fontSize: 12, background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            取消
          </button>
        </div>
      )}

      {/* Selected group header */}
      {selectedGroup && (
        <div style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6', marginBottom: 12 }}>
          {editingGroupId === selectedGroup.id ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <input
                value={editGroupName}
                onChange={e => setEditGroupName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRenameGroup(selectedGroup.id)}
                autoFocus
                style={{ flex: 1, padding: '4px 8px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 6, outline: 'none' }}
              />
              <button onClick={() => handleRenameGroup(selectedGroup.id)} style={{ padding: '4px 10px', fontSize: 12, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                保存
              </button>
              <button onClick={() => setEditingGroupId(null)} style={{ padding: '4px 10px', fontSize: 12, background: '#f3f4f6', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                取消
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2937', flex: 1 }}>{selectedGroup.name}</span>
              <button
                onClick={() => { setEditingGroupId(selectedGroup.id); setEditGroupName(selectedGroup.name); }}
                title="重命名"
                style={{ padding: '2px 6px', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 4 }}
              >
                ✏️
              </button>
              {selectedGroup.isDefault !== 1 && (
                <button
                  onClick={() => handleSetDefault(selectedGroup.id)}
                  title="设为默认"
                  style={{ padding: '2px 6px', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 4 }}
                >
                  ⭐
                </button>
              )}
              <button
                onClick={() => handleDeleteGroup(selectedGroup.id)}
                title="删除"
                style={{ padding: '2px 6px', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 4 }}
              >
                🗑
              </button>
            </div>
          )}
          <div style={{ fontSize: 12, color: '#9ca3af' }}>共 {items.length} 个地点</div>
        </div>
      )}

      {/* Item list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <div
            key={item.id}
            onContextMenu={e => handleContextMenu(e, item)}
            style={{
              display: 'flex',
              gap: 12,
              padding: 12,
              background: '#fff',
              borderRadius: 8,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              position: 'relative',
            }}
          >
            {item.coverImage && (
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 8,
                  background: `url(${item.coverImage}) center/cover`,
                  flexShrink: 0,
                  backgroundColor: '#f3f4f6',
                }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{
                margin: '0 0 4px',
                fontSize: 15,
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {item.title}
              </h3>
              {item.address && (
                <p style={{ margin: '0 0 4px', fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.address}
                </p>
              )}
              {item.listName && (
                <span style={{ fontSize: 10, color: '#3b82f6', background: '#eff6ff', padding: '1px 6px', borderRadius: 4 }}>
                  {item.listName}
                </span>
              )}
            </div>
            <button
              onClick={e => { e.stopPropagation(); handleContextMenu(e, item); }}
              style={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                cursor: 'pointer',
                borderRadius: '50%',
                border: 'none',
                background: 'none',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="3" cy="8" r="1.5" fill="#9ca3af" />
                <circle cx="8" cy="8" r="1.5" fill="#9ca3af" />
                <circle cx="13" cy="8" r="1.5" fill="#9ca3af" />
              </svg>
            </button>
          </div>
        ))}
        {items.length === 0 && selectedGroup && (
          <p style={{ textAlign: 'center', padding: 24, color: '#9ca3af', fontSize: 13 }}>
            暂无地点，在榜单中点击已去即可添加
          </p>
        )}
        {!selectedGroup && groups.length === 0 && (
          <p style={{ textAlign: 'center', padding: 24, color: '#9ca3af', fontSize: 13 }}>
            暂无分类组，点击上方"+ 新建"创建
          </p>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            zIndex: 1000,
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'white',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            overflow: 'hidden',
            minWidth: 140,
          }}
        >
          <button
            onClick={() => { setTargetItem(contextMenu.item); setAddToGroupOpen(true); setContextMenu(null); }}
            style={{ display: 'block', width: '100%', padding: '10px 16px', fontSize: 13, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: '#374151' }}
          >
            添加到其他组
          </button>
          <button
            onClick={() => { handleRemoveItem(contextMenu.item); setContextMenu(null); }}
            style={{ display: 'block', width: '100%', padding: '10px 16px', fontSize: 13, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}
          >
            从本组移除
          </button>
        </div>
      )}

      {/* Add to group modal */}
      {addToGroupOpen && targetItem && (
        <div
          onClick={() => { setAddToGroupOpen(false); setTargetItem(null); }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: 12,
              padding: 20,
              width: 320,
              maxHeight: '60vh',
              overflowY: 'auto',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px', color: '#1f2937' }}>
              添加到分类组: {targetItem.title}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {groups
                .filter(g => g.id !== selectedGroupId)
                .map(g => (
                  <button
                    key={g.id}
                    onClick={() => handleAddToGroup(targetItem, g.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      fontSize: 13,
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      background: 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: '#374151',
                    }}
                  >
                    {g.name}
                    {g.isDefault === 1 && (
                      <span style={{ fontSize: 10, background: '#f3f4f6', padding: '1px 4px', borderRadius: 4 }}>
                        默认
                      </span>
                    )}
                  </button>
                ))}
              {groups.filter(g => g.id !== selectedGroupId).length === 0 && (
                <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>暂无其他分类组</p>
              )}
            </div>
            <button
              onClick={() => { setAddToGroupOpen(false); setTargetItem(null); }}
              style={{ display: 'block', width: '100%', padding: 8, fontSize: 13, border: 'none', background: '#f3f4f6', borderRadius: 8, cursor: 'pointer', color: '#6b7280' }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
