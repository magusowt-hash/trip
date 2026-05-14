'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PlanMap, { type MapMarker } from '@/components/PlanMap';
import styles from './footprints.module.css';

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
  cloudCover: string | null;
  cloudFolder: string | null;
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

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchAddToGroupOpen, setBatchAddToGroupOpen] = useState(false);

  // Photo upload & display
  const [photoItem, setPhotoItem] = useState<FootprintItem | null>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [expandedPhotos, setExpandedPhotos] = useState<number | null>(null);
  const router = useRouter();

  // Map
  const mapInstanceRef = useRef<any>(null);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [focusPosition, setFocusPosition] = useState<[number, number] | null>(null);

  const handleMapReady = (map: any) => {
    mapInstanceRef.current = map;
  };

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    if (selectedGroupId) {
      loadItems(selectedGroupId);
      setSelectedIds(new Set());
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

  // Map marker click
  function handleMapMarkerClick(marker: MapMarker) {
    if (marker.position) {
      setFocusPosition(marker.position);
    }
  }

  // Item click -> focus map
  function handleItemClick(item: FootprintItem) {
    if (item.lng && item.lat) {
      const lng = parseFloat(item.lng);
      const lat = parseFloat(item.lat);
      setFocusPosition([lng, lat]);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setZoomAndCenter(12, [lng, lat], true);
      }
    }
  }

  // Photo upload & display
  async function handleUpload(item: FootprintItem) {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';
    input.onchange = async () => {
      if (!input.files?.length) return;
      const form = new FormData();
      form.append('place_title', item.title);
      for (const f of Array.from(input.files)) form.append('files', f);
      try {
        const res = await fetch('/api/storage/upload', { method: 'POST', credentials: 'include', body: form });
        const data = await res.json();
        if (!res.ok) { alert(data.error || '上传失败'); return; }
        if (expandedPhotos === item.listItemId) loadPhotos(item);
      } catch { alert('上传失败'); }
    };
    input.click();
  }

  async function loadPhotos(item: FootprintItem) {
    setPhotosLoading(true);
    try {
      const res = await fetch(`/api/storage/photos?place_title=${encodeURIComponent(item.title)}`, { credentials: 'include' });
      const data = await res.json();
      setPhotos(data.photos || []);
    } catch { setPhotos([]); }
    finally { setPhotosLoading(false); }
  }

  async function handleDeletePhoto(item: FootprintItem, photoId: number) {
    if (!confirm('确定删除该照片？')) return;
    try {
      await fetch(`/api/storage/photos?id=${photoId}`, { method: 'DELETE', credentials: 'include' });
      loadPhotos(item);
    } catch { alert('删除失败'); }
  }

  function togglePhotos(item: FootprintItem) {
    if (expandedPhotos === item.listItemId) {
      setExpandedPhotos(null);
      setPhotos([]);
      setPhotoItem(null);
    } else {
      setExpandedPhotos(item.listItemId);
      setPhotoItem(item);
      loadPhotos(item);
    }
  }

  // Batch operations
  function handleSelectAll() {
    if (items.length === 0) return;
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(it => it.listItemId)));
    }
  }

  function handleToggleSelect(listItemId: number) {
    const next = new Set(selectedIds);
    if (next.has(listItemId)) {
      next.delete(listItemId);
    } else {
      next.add(listItemId);
    }
    setSelectedIds(next);
  }

  async function handleBatchRemove() {
    if (!selectedGroupId || selectedIds.size === 0) return;
    if (!confirm(`确定从本组移除选中的 ${selectedIds.size} 个地点？`)) return;
    const ids = Array.from(selectedIds);
    let success = true;
    for (const listItemId of ids) {
      try {
        await fetch(
          `/api/footprints/groups/${selectedGroupId}/items?item_id=${listItemId}`,
          { method: 'DELETE', credentials: 'include' },
        );
      } catch {
        success = false;
      }
    }
    setSelectedIds(new Set());
    await loadItems(selectedGroupId);
    await loadGroups();
    if (!success) alert('部分移除失败');
  }

  async function handleBatchAddToGroup(targetGroupId: number) {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    let failed = 0;
    for (const listItemId of ids) {
      try {
        const res = await fetch(`/api/footprints/groups/${targetGroupId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ list_item_id: listItemId }),
        });
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
    }
    setBatchAddToGroupOpen(false);
    setSelectedIds(new Set());
    await loadGroups();
    if (failed > 0) {
      alert(`${failed} 个地点添加失败（可能已存在）`);
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
    <div className={styles.root}>
      <div className={styles.split}>
        <div className={styles.mapCol}>
          <PlanMap
            markers={markers}
            focusPosition={focusPosition}
            onMarkerClick={handleMapMarkerClick}
            onMapLoad={handleMapReady}
            autoLoadMarkers={false}
          />
        </div>

        <div className={styles.rightCol}>
          <h1 className={styles.title}>我的足迹</h1>

          {/* Group tabs */}
          <div className={styles.groupTabs}>
            {groups.map(group => (
              <div
                key={group.id}
                onClick={() => setSelectedGroupId(group.id)}
                className={`${styles.groupTab} ${selectedGroupId === group.id ? styles.groupTabActive : ''}`}
              >
                {group.name}
                {group.isDefault === 1 && <span className={styles.defaultBadge}>默认</span>}
              </div>
            ))}
            <div className={styles.groupTabAdd} onClick={() => setShowNewGroupInput(true)}>
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
              <button className={styles.btnPrimary} onClick={handleCreateGroup}>确定</button>
              <button className={styles.btnCancel} onClick={() => { setShowNewGroupInput(false); setNewGroupName(''); }}>取消</button>
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
                  <button className={styles.btnPrimary} onClick={() => handleRenameGroup(selectedGroup.id)}>保存</button>
                  <button className={styles.btnCancel} onClick={() => setEditingGroupId(null)}>取消</button>
                </div>
              ) : (
                <div className={styles.groupTitleRow}>
                  <span className={styles.groupTitle}>{selectedGroup.name}</span>
                  <button className={styles.groupIconBtn} onClick={() => { setEditingGroupId(selectedGroup.id); setEditGroupName(selectedGroup.name); }} title="重命名">✏️</button>
                  {selectedGroup.isDefault !== 1 && (
                    <button className={styles.groupIconBtn} onClick={() => handleSetDefault(selectedGroup.id)} title="设为默认">⭐</button>
                  )}
                  <button className={styles.groupIconDanger} onClick={() => handleDeleteGroup(selectedGroup.id)} title="删除">🗑</button>
                </div>
              )}
              <div className={styles.headerRow}>
                <span className={styles.itemCount}>共 {items.length} 个地点</span>
                {items.length > 0 && selectedIds.size === 0 && (
                  <button className={styles.linkBtn} onClick={handleSelectAll}>选择多个</button>
                )}
                {selectedIds.size > 0 && (
                  <button className={styles.linkBtnMuted} onClick={() => setSelectedIds(new Set())}>取消选择</button>
                )}
              </div>
            </div>
          )}

          {/* Item list */}
          <div className={styles.itemList}>
            {items.map(item => (
              <div
                key={item.id}
                className={`${styles.itemCard} ${selectedIds.has(item.listItemId) ? styles.itemCardSelected : ''}`}
                onClick={() => handleItemClick(item)}
                onContextMenu={e => handleContextMenu(e, item)}
              >
                {/* Checkbox */}
                <div
                  className={`${styles.checkbox} ${selectedIds.has(item.listItemId) ? styles.checkboxChecked : ''}`}
                  onClick={e => { e.stopPropagation(); handleToggleSelect(item.listItemId); }}
                >
                  {selectedIds.has(item.listItemId) && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>

                {((item.cloudCover || item.coverImage)) && (
                  <div className={styles.itemCover} style={{ backgroundImage: `url(${item.cloudCover || item.coverImage})` }} />
                )}
                <div className={styles.itemInfo}>
                  <h3 className={styles.itemTitle}>{item.title}</h3>
                  {item.address && <p className={styles.itemAddress}>{item.address}</p>}
                  {item.listName && <span className={styles.itemBadge}>{item.listName}</span>}
                </div>
                <button className={styles.itemMenuBtn} onClick={e => { e.stopPropagation(); handleContextMenu(e, item); }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="3" cy="8" r="1.5" fill="#9ca3af" />
                    <circle cx="8" cy="8" r="1.5" fill="#9ca3af" />
                    <circle cx="13" cy="8" r="1.5" fill="#9ca3af" />
                  </svg>
                </button>
                {item.cloudFolder && (
                  <button
                    className={styles.itemAlbumBtn}
                    onClick={e => { e.stopPropagation(); router.push(`/albums/${item.listItemId}`); }}
                    title="相册"
                  >
                    🖼
                  </button>
                )}
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

      {/* Photo gallery section */}
      {photoItem && expandedPhotos && (
        <div className={styles.photoSection}>
          <div className={styles.photoHeader}>
            <span className={styles.photoTitle}>{photoItem.title} · 照片</span>
            <div className={styles.photoActions}>
              <button className={styles.photoUploadBtn} onClick={() => handleUpload(photoItem)}>📤 上传</button>
              <button className={styles.photoCloseBtn} onClick={() => { setExpandedPhotos(null); setPhotoItem(null); setPhotos([]); }}>✕</button>
            </div>
          </div>
          {photosLoading ? (
            <div className={styles.emptyHint}>加载中...</div>
          ) : photos.length === 0 ? (
            <div className={styles.emptyHint}>暂无照片，点击上传添加</div>
          ) : (
            <div className={styles.photoGrid}>
              {photos.map((p: any) => (
                <div key={p.id} className={styles.photoItem}>
                  <img src={p.url} alt={p.filename} loading="lazy" />
                  <button className={styles.photoDeleteBtn} onClick={() => handleDeletePhoto(photoItem, p.id)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className={styles.batchBar}>
          <span className={styles.batchLabel}>已选 {selectedIds.size} 项</span>
          <button className={styles.batchBtn} onClick={handleSelectAll}>
            {selectedIds.size === items.length ? '取消全选' : '全选'}
          </button>
          <button className={styles.batchBtnPrimary} onClick={() => setBatchAddToGroupOpen(true)}>
            添加到其他组
          </button>
          <button className={styles.batchBtnDanger} onClick={handleBatchRemove}>
            从本组移除
          </button>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div className={styles.contextMenu} style={{ right: 20, top: contextMenu.y }}>
          <button
            className={styles.contextItem}
            onClick={() => { handleUpload(contextMenu.item); setContextMenu(null); }}
          >
            上传照片
          </button>
          <button
            className={styles.contextItem}
            onClick={() => { togglePhotos(contextMenu.item); setContextMenu(null); }}
          >
            查看照片
          </button>
          <button
            className={styles.contextItem}
            onClick={() => {
              router.push(`/albums/${contextMenu.item.listItemId}`);
              setContextMenu(null);
            }}
          >
            网盘相册
          </button>
          <button className={styles.contextItem} onClick={() => { setTargetItem(contextMenu.item); setAddToGroupOpen(true); setContextMenu(null); }}>
            添加到其他组
          </button>
          <button className={styles.contextItemDanger} onClick={() => { handleRemoveItem(contextMenu.item); setContextMenu(null); }}>
            从本组移除
          </button>
        </div>
      )}

      {/* Single item add-to-group modal */}
      {addToGroupOpen && targetItem && (
        <div className={styles.modalOverlay} onClick={() => { setAddToGroupOpen(false); setTargetItem(null); }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>添加到分类组: {targetItem.title}</h3>
            <div className={styles.modalList}>
              {groups.filter(g => g.id !== selectedGroupId).map(g => (
                <button key={g.id} className={styles.modalBtn} onClick={() => handleAddToGroup(targetItem, g.id)}>
                  {g.name}
                  {g.isDefault === 1 && <span className={styles.defaultBadge}>默认</span>}
                </button>
              ))}
              {groups.filter(g => g.id !== selectedGroupId).length === 0 && (
                <p className={styles.emptyHint}>暂无其他分类组</p>
              )}
            </div>
            <button className={styles.modalClose} onClick={() => { setAddToGroupOpen(false); setTargetItem(null); }}>取消</button>
          </div>
        </div>
      )}

      {/* Batch add-to-group modal */}
      {batchAddToGroupOpen && (
        <div className={styles.modalOverlay} onClick={() => setBatchAddToGroupOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>批量添加到分类组 ({selectedIds.size} 项)</h3>
            <div className={styles.modalList}>
              {groups.filter(g => g.id !== selectedGroupId).map(g => (
                <button key={g.id} className={styles.modalBtn} onClick={() => handleBatchAddToGroup(g.id)}>
                  {g.name}
                  {g.isDefault === 1 && <span className={styles.defaultBadge}>默认</span>}
                </button>
              ))}
              {groups.filter(g => g.id !== selectedGroupId).length === 0 && (
                <p className={styles.emptyHint}>暂无其他分类组</p>
              )}
            </div>
            <button className={styles.modalClose} onClick={() => setBatchAddToGroupOpen(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
