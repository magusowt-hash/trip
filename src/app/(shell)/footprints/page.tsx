'use client';

import { useState, useEffect, useRef } from 'react';
import PlanMap, { type MapMarker } from '@/components/PlanMap';
import styles from './footprints-page.module.css';

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

export default function FootprintsPage() {
  const [groups, setGroups] = useState<FootprintGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [items, setItems] = useState<FootprintItem[]>([]);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [focusPosition, setFocusPosition] = useState<[number, number] | null>(null);
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

  const mapInstanceRef = useRef<any>(null);

  const handleMapReady = (map: any) => {
    mapInstanceRef.current = map;
  };

  // Load groups on mount
  useEffect(() => {
    loadGroups();
  }, []);

  // Load items when selected group changes
  useEffect(() => {
    if (selectedGroupId) {
      loadItems(selectedGroupId);
    } else {
      setItems([]);
    }
  }, [selectedGroupId]);

  // Derive markers from items
  useEffect(() => {
    const newMarkers: MapMarker[] = items
      .filter(it => it.lng && it.lat)
      .map(it => ({
        id: it.listItemId,
        position: [parseFloat(it.lng!), parseFloat(it.lat!)] as [number, number],
        title: it.title,
        address: it.address || undefined,
        description: it.description || undefined,
      }));
    setMarkers(newMarkers);
  }, [items]);

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

  function handleItemClick(item: FootprintItem) {
    if (item.lng && item.lat) {
      const lng = parseFloat(item.lng);
      const lat = parseFloat(item.lat);
      setFocusPosition([lng, lat]);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setZoomAndCenter(8, [lng, lat], true);
      }
    }
  }

  function handleContextMenu(e: React.MouseEvent, item: FootprintItem) {
    e.preventDefault();
    setContextMenu({ item, x: e.clientX, y: e.clientY });
  }

  // Close context menu on any click
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
    <div className={styles.root}>
      <div className={styles.split}>
        <div className={styles.mapCol}>
          <PlanMap
            markers={markers}
            focusPosition={focusPosition}
            onMapLoad={handleMapReady}
            autoLoadMarkers={false}
          />
        </div>

        <div className={styles.rightCol}>
          {/* Group tabs */}
          <div className={styles.groupTabs}>
            {groups.map(group => (
              <div
                key={group.id}
                className={`${styles.groupTab} ${selectedGroupId === group.id ? styles.groupTabActive : ''}`}
                onClick={() => setSelectedGroupId(group.id)}
              >
                {group.name}
                {group.isDefault === 1 && <span className={styles.defaultBadge}>默认</span>}
              </div>
            ))}
            <div
              className={styles.groupTabAdd}
              onClick={() => setShowNewGroupInput(true)}
            >
              ＋新建
            </div>
          </div>

          {/* New group input */}
          {showNewGroupInput && (
            <div className={styles.newGroupRow}>
              <input
                className={styles.newGroupInput}
                placeholder="输入分类组名称"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
                autoFocus
              />
              <button className={styles.newGroupConfirm} onClick={handleCreateGroup}>
                确定
              </button>
              <button
                className={styles.newGroupCancel}
                onClick={() => {
                  setShowNewGroupInput(false);
                  setNewGroupName('');
                }}
              >
                取消
              </button>
            </div>
          )}

          {/* Selected group header */}
          {selectedGroup && (
            <div className={styles.groupHeader}>
              {editingGroupId === selectedGroup.id ? (
                <div className={styles.editRow}>
                  <input
                    className={styles.editInput}
                    value={editGroupName}
                    onChange={e => setEditGroupName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRenameGroup(selectedGroup.id)}
                    autoFocus
                  />
                  <button
                    className={styles.editConfirm}
                    onClick={() => handleRenameGroup(selectedGroup.id)}
                  >
                    保存
                  </button>
                  <button
                    className={styles.editCancel}
                    onClick={() => setEditingGroupId(null)}
                  >
                    取消
                  </button>
                </div>
              ) : (
                <div className={styles.groupTitleRow}>
                  <span className={styles.groupTitle}>{selectedGroup.name}</span>
                  <button
                    className={styles.groupAction}
                    onClick={() => {
                      setEditingGroupId(selectedGroup.id);
                      setEditGroupName(selectedGroup.name);
                    }}
                    title="重命名"
                  >
                    ✏️
                  </button>
                  {selectedGroup.isDefault !== 1 && (
                    <button
                      className={styles.groupAction}
                      onClick={() => handleSetDefault(selectedGroup.id)}
                      title="设为默认"
                    >
                      ⭐
                    </button>
                  )}
                  <button
                    className={styles.groupActionDanger}
                    onClick={() => handleDeleteGroup(selectedGroup.id)}
                    title="删除"
                  >
                    🗑
                  </button>
                </div>
              )}
              <div className={styles.itemCount}>共 {items.length} 个地点</div>
            </div>
          )}

          {/* Item list */}
          <div className={styles.itemList}>
            {items.map(item => (
              <div
                key={item.id}
                className={styles.itemCard}
                onClick={() => handleItemClick(item)}
                onContextMenu={e => handleContextMenu(e, item)}
              >
                {item.coverImage && (
                  <div
                    className={styles.itemCover}
                    style={{ backgroundImage: `url(${item.coverImage})` }}
                  />
                )}
                <div className={styles.itemInfo}>
                  <h3 className={styles.itemTitle}>{item.title}</h3>
                  {item.address && <p className={styles.itemAddress}>{item.address}</p>}
                  {item.listName && (
                    <span className={styles.itemListName}>{item.listName}</span>
                  )}
                </div>
                <button
                  className={styles.itemMenuBtn}
                  onClick={e => {
                    e.stopPropagation();
                    handleContextMenu(e, item);
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
              <p className={styles.emptyHint}>暂无地点，在榜单中点击已去即可添加</p>
            )}
            {!selectedGroup && groups.length === 0 && (
              <p className={styles.emptyHint}>暂无分类组，点击上方"+ 新建"创建</p>
            )}
          </div>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className={styles.contextMenuItem}
            onClick={() => {
              setTargetItem(contextMenu.item);
              setAddToGroupOpen(true);
              setContextMenu(null);
            }}
          >
            添加到其他组
          </button>
          <button
            className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
            onClick={() => {
              handleRemoveItem(contextMenu.item);
              setContextMenu(null);
            }}
          >
            从本组移除
          </button>
        </div>
      )}

      {/* Add to group modal */}
      {addToGroupOpen && targetItem && (
        <div className={styles.modalOverlay} onClick={() => { setAddToGroupOpen(false); setTargetItem(null); }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>
              添加到分类组: {targetItem.title}
            </h3>
            <div className={styles.modalGroupList}>
              {groups
                .filter(g => g.id !== selectedGroupId)
                .map(g => (
                  <button
                    key={g.id}
                    className={styles.modalGroupBtn}
                    onClick={() => handleAddToGroup(targetItem, g.id)}
                  >
                    {g.name}
                    {g.isDefault === 1 && <span className={styles.defaultBadge}>默认</span>}
                  </button>
                ))}
              {groups.filter(g => g.id !== selectedGroupId).length === 0 && (
                <p className={styles.emptyHint}>暂无其他分类组</p>
              )}
            </div>
            <button
              className={styles.modalClose}
              onClick={() => { setAddToGroupOpen(false); setTargetItem(null); }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
