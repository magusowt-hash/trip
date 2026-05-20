'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './FootprintGroupPanel.module.css';

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
  addedAt: string;
}

interface CloudStatusMeta {
  mountState: 'unmounted' | 'mounted';
  connectionState: 'unknown' | 'connected' | 'disconnected';
  unboundFolderCount?: number;
}

interface Props {
  groups: FootprintGroup[];
  selectedGroupId: number | null;
  items: FootprintItem[];
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  onSelectGroup: (id: number) => void;
  onNewGroup: (name: string) => Promise<void>;
  onRenameGroup: (id: number, name: string) => Promise<void>;
  onDeleteGroup: (id: number) => Promise<void>;
  onSetDefault: (id: number) => Promise<void>;
  onRemoveItem: (item: FootprintItem) => void;
  onOpenAlbum: (item: FootprintItem) => void;
  onUploadPhoto: (item: FootprintItem) => void;
  onOpenCloudMount: (item: FootprintItem) => void;
  onItemClick: (item: FootprintItem) => void;
  cloudStatusMap?: Record<number, CloudStatusMeta>;
}

export default function FootprintGroupPanel({
  groups,
  selectedGroupId,
  items,
  collapsed,
  onCollapsedChange,
  onSelectGroup,
  onNewGroup,
  onRenameGroup,
  onDeleteGroup,
  onSetDefault,
  onRemoveItem,
  onOpenAlbum,
  onUploadPhoto,
  onOpenCloudMount,
  onItemClick,
  cloudStatusMap = {},
}: Props) {
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [menuItem, setMenuItem] = useState<FootprintItem | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await onNewGroup(newName.trim());
    setNewName('');
    setShowNewInput(false);
  };

  const handleRename = async (id: number) => {
    if (!editName.trim()) return;
    await onRenameGroup(id, editName.trim());
    setEditingId(null);
  };

  const handleContextMenu = (e: React.MouseEvent, item: FootprintItem) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuItem(item);
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  const getMountClassName = (item: FootprintItem) => {
    const status = cloudStatusMap[item.id];
    if (!status || status.mountState === 'unmounted') return styles.menuItemBtn;
    if (status.connectionState === 'connected') return `${styles.menuItemBtn} ${styles.menuItemSuccess}`;
    if (status.connectionState === 'disconnected') return `${styles.menuItemBtn} ${styles.menuItemDangerSoft}`;
    return styles.menuItemBtn;
  };

  const selectedPanelItem = selectedGroupId
    ? items.find(item => cloudStatusMap[item.id] || item.id === items[0]?.id) ?? items[0] ?? null
    : null;

  return (
    <>
      <div className={`${styles.panel} ${collapsed ? styles.collapsed : ''}`}>
        <button className={styles.toggle} onClick={() => onCollapsedChange(!collapsed)}>
          {collapsed ? '◀' : '▶'} 足迹
        </button>

        {!collapsed && (
          <>
            <div className={styles.groupList}>
              {groups.map(g => (
                <div key={g.id} className={styles.groupWrap}>
                  <div
                    className={`${styles.groupItem} ${selectedGroupId === g.id ? styles.active : ''}`}
                    onClick={() => onSelectGroup(g.id)}
                  >
                    {editingId === g.id ? (
                      <div className={styles.editRow}>
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleRename(g.id)}
                          className={styles.editInput}
                          autoFocus
                          onClick={e => e.stopPropagation()}
                        />
                        <button className={styles.miniBtn} onClick={e => { e.stopPropagation(); handleRename(g.id); }}>✓</button>
                        <button className={styles.miniBtn} onClick={e => { e.stopPropagation(); setEditingId(null); }}>✕</button>
                      </div>
                    ) : (
                      <>
                        <span className={styles.expandIcon}>
                          {selectedGroupId === g.id ? '▼' : '▶'}
                        </span>
                        <span className={styles.groupName}>{g.name}</span>
                        <span className={styles.groupCount}>{g.itemCount}</span>
                        {g.isDefault === 1 && <span className={styles.defaultBadge}>默认</span>}
                        {selectedGroupId === g.id && (
                          <button
                            className={styles.groupMoreBtn}
                            onClick={e => {
                              e.stopPropagation();
                              setGroupMenuOpen(v => !v);
                            }}
                          >
                            ⋯
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Expanded items list */}
                  {selectedGroupId === g.id && items.length > 0 && (
                    <div className={styles.itemList}>
                      {items.map(item => (
                        <div
                          key={item.id}
                          className={styles.panelItem}
                          onClick={() => onItemClick(item)}
                          onContextMenu={e => handleContextMenu(e, item)}
                        >
                          <span className={styles.itemTitle}>{item.title}</span>
                          <button
                            className={styles.itemMoreBtn}
                            onClick={e => { e.stopPropagation(); handleContextMenu(e, item); }}
                          >
                            ⋯
                          </button>
                        </div>
                      ))}
                      {items.length === 0 && (
                        <div className={styles.emptyHint}>暂无地点</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {showNewInput ? (
              <div className={styles.newRow}>
                <input
                  placeholder="分类组名称"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  className={styles.newInput}
                  autoFocus
                />
                <button className={styles.miniBtn} onClick={handleCreate}>✓</button>
                <button className={styles.miniBtn} onClick={() => { setShowNewInput(false); setNewName(''); }}>✕</button>
              </div>
            ) : (
              <button className={styles.addBtn} onClick={() => setShowNewInput(true)}>＋ 新建分类</button>
            )}

          </>
        )}
      </div>

      {/* Item context menu (portal to body to escape stacking context) */}
      {groupMenuOpen && selectedGroupId && createPortal(
        <>
          <div className={styles.menuBackdrop} onClick={() => setGroupMenuOpen(false)} />
          <div className={styles.itemMenu} style={{ right: 24, bottom: 24, left: 'auto', top: 'auto', transform: 'none' }} onClick={e => e.stopPropagation()}>
            <button className={styles.menuItemBtn} onClick={() => { onSetDefault(selectedGroupId); setGroupMenuOpen(false); }}>
              设为默认
            </button>
            <button className={styles.menuItemBtn} onClick={() => {
              const g = groups.find(x => x.id === selectedGroupId);
              if (g) { setEditingId(g.id); setEditName(g.name); }
              setGroupMenuOpen(false);
            }}>
              重命名
            </button>
            <button
              className={selectedPanelItem ? getMountClassName(selectedPanelItem) : styles.menuItemBtn}
              onClick={() => {
                if (selectedPanelItem) onOpenCloudMount(selectedPanelItem);
                setGroupMenuOpen(false);
              }}
              disabled={!selectedPanelItem}
            >
              挂载网盘
            </button>
            <button className={styles.menuItemDanger} onClick={() => { onDeleteGroup(selectedGroupId); setGroupMenuOpen(false); }}>
              删除
            </button>
          </div>
        </>,
        document.body,
      )}

      {/* Place context menu */}
      {menuItem && createPortal(
        <>
          <div className={styles.menuBackdrop} onClick={() => setMenuItem(null)} />
          <div className={styles.itemMenu} style={{ left: menuPos.x - 10, top: menuPos.y, transform: 'translate(-100%, 0)' }} onClick={e => e.stopPropagation()}>
            <button className={styles.menuItemBtn} onClick={() => { onOpenAlbum(menuItem); setMenuItem(null); }}>
              相册
            </button>
            <button className={styles.menuItemBtn} onClick={() => { onUploadPhoto(menuItem); setMenuItem(null); }}>
              上传照片
            </button>
            <button className={styles.menuItemDanger} onClick={() => { onRemoveItem(menuItem); setMenuItem(null); }}>
              删除
            </button>
          </div>
        </>,
          document.body,
      )}
    </>
  );
}
