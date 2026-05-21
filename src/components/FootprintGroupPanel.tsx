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
  createdAt?: string;
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
  onAddItemToGroup?: (item: FootprintItem, groupId: number) => void;
  onOpenAlbum: (item: FootprintItem) => void;
  onUploadPhoto: (item: FootprintItem) => void;
  onItemClick: (item: FootprintItem) => void;
  onOpenLocalMapForGroup?: () => void;
  onOpenLocalMapForItem?: (item: FootprintItem) => void;
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
  onAddItemToGroup,
  onOpenAlbum,
  onUploadPhoto,
  onItemClick,
  onOpenLocalMapForGroup,
  onOpenLocalMapForItem,
}: Props) {
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [menuItem, setMenuItem] = useState<FootprintItem | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [managementOpen, setManagementOpen] = useState(false);

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

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  const itemDates = items
    .map((item) => item.addedAt)
    .filter((value): value is string => !!value)
    .sort();
  const firstAddedAt = itemDates[0] || selectedGroup?.createdAt || null;
  const lastAddedAt = itemDates[itemDates.length - 1] || selectedGroup?.createdAt || null;

  const formatDate = (value?: string | null) => {
    if (!value) return '未记录';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未记录';
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  return (
    <>
      <div className={`${styles.panel} ${collapsed ? styles.collapsed : ''}`}>
        <div className={styles.headerRow}>
          <button className={styles.toggle} onClick={() => onCollapsedChange(!collapsed)}>
            {collapsed ? '◀' : '▶'} 足迹
          </button>
          {!collapsed && (
            <button
              className={styles.settingsBtn}
              onClick={(e) => {
                e.stopPropagation();
                setManagementOpen(true);
              }}
              disabled={!selectedGroupId}
              title="足迹管理"
            >
              ⚙
            </button>
          )}
        </div>

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
                      </>
                    )}
                  </div>

                  {/* Expanded items list */}
                  {selectedGroupId === g.id && (
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
      {managementOpen && selectedGroupId && createPortal(
        <>
          <div className={styles.menuBackdrop} onClick={() => setManagementOpen(false)} />
          <div className={styles.managementModal} onClick={e => e.stopPropagation()}>
            <div className={styles.managementHeader}>
              <div className={styles.managementTitleWrap}>
                <div className={styles.managementEyebrow}>足迹管理</div>
                <h3 className={styles.managementTitle}>
                  {selectedGroup?.name || '当前足迹组'}
                </h3>
                <div className={styles.managementDate}>
                  足迹日期：{formatDate(firstAddedAt)} 至 {formatDate(lastAddedAt)}
                </div>
              </div>
              <button className={styles.managementClose} onClick={() => setManagementOpen(false)}>
                ✕
              </button>
            </div>

            <div className={styles.managementBody}>
              <div className={styles.managementHero}>
                <div className={styles.managementHeroMain}>
                  <div className={styles.managementHeroLabel}>组内概况</div>
                  <div className={styles.managementHeroValue}>
                    {selectedGroup?.itemCount || 0}
                    <span> 个地点</span>
                  </div>
                  <div className={styles.managementHeroSub}>
                    分组创建于 {formatDate(selectedGroup?.createdAt)}
                  </div>
                </div>
                <div className={styles.managementBadgeWrap}>
                  <span className={`${styles.managementBadge} ${selectedGroup?.isDefault === 1 ? styles.managementBadgeActive : ''}`}>
                    {selectedGroup?.isDefault === 1 ? '默认足迹组' : '普通足迹组'}
                  </span>
                </div>
              </div>

              <div className={styles.managementGrid}>
                <div className={styles.managementCard}>
                  <div className={styles.managementLabel}>起始日期</div>
                  <div className={styles.managementValue}>{formatDate(firstAddedAt)}</div>
                  <div className={styles.managementHint}>当前组内最早加入的足迹项时间</div>
                </div>
                <div className={styles.managementCard}>
                  <div className={styles.managementLabel}>最近日期</div>
                  <div className={styles.managementValue}>{formatDate(lastAddedAt)}</div>
                  <div className={styles.managementHint}>当前组内最近加入的足迹项时间</div>
                </div>
              </div>

              <div className={styles.managementActions}>
                {onOpenLocalMapForGroup ? (
                  <button className={styles.managementBtn} onClick={() => { onOpenLocalMapForGroup(); setManagementOpen(false); }}>
                    映射本地
                  </button>
                ) : null}
                <button className={styles.managementBtn} onClick={() => { onSetDefault(selectedGroupId); setManagementOpen(false); }}>
                  设为默认
                </button>
                <button
                  className={styles.managementBtn}
                  onClick={() => {
                    const g = groups.find(x => x.id === selectedGroupId);
                    if (g) { setEditingId(g.id); setEditName(g.name); }
                    setManagementOpen(false);
                  }}
                >
                  重命名
                </button>
                <button className={styles.managementDanger} onClick={() => { onDeleteGroup(selectedGroupId); setManagementOpen(false); }}>
                  删除此足迹组
                </button>
              </div>

              <div className={styles.managementListCard}>
                <div className={styles.managementListHeader}>
                  <div>
                    <div className={styles.managementLabel}>足迹地点</div>
                    <div className={styles.managementListHint}>这里只展示当前足迹组内的地点与加入日期</div>
                  </div>
                  <div className={styles.managementListCount}>{items.length}</div>
                </div>
                {items.length === 0 ? (
                  <div className={styles.managementEmpty}>当前足迹组还没有地点</div>
                ) : (
                  <div className={styles.managementList}>
                    {items.map((item) => (
                      <div key={item.id} className={styles.managementListItem}>
                        <div className={styles.managementListMain}>
                          <div className={styles.managementListTitle}>{item.title}</div>
                          <div className={styles.managementListMeta}>
                            {item.address || '未记录地点描述'}
                          </div>
                        </div>
                        <div className={styles.managementListDate}>
                          {formatDate(item.addedAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}

      {/* Place context menu */}
      {menuItem && createPortal(
        <>
          <div className={styles.menuBackdrop} onClick={() => setMenuItem(null)} />
          <div className={styles.itemMenu} style={{ left: menuPos.x - 10, top: menuPos.y, transform: 'translate(-100%, 0)' }} onClick={e => e.stopPropagation()}>
            {onOpenLocalMapForItem ? (
              <button className={styles.menuItemBtn} onClick={() => { onOpenLocalMapForItem(menuItem); setMenuItem(null); }}>
                映射本地
              </button>
            ) : null}
            <button className={styles.menuItemBtn} onClick={() => { onOpenAlbum(menuItem); setMenuItem(null); }}>
              相册
            </button>
            <button className={styles.menuItemBtn} onClick={() => { onUploadPhoto(menuItem); setMenuItem(null); }}>
              上传照片
            </button>
            {onAddItemToGroup && groups.filter((group) => group.id !== selectedGroupId).length > 0 ? (
              <>
                <div className={styles.menuSectionLabel}>添加到其他组</div>
                {groups
                  .filter((group) => group.id !== selectedGroupId)
                  .map((group) => (
                    <button
                      key={group.id}
                      className={styles.menuItemBtn}
                      onClick={() => { onAddItemToGroup(menuItem, group.id); setMenuItem(null); }}
                    >
                      {group.name}
                    </button>
                  ))}
              </>
            ) : null}
            <button className={styles.menuItemDanger} onClick={() => { onRemoveItem(menuItem); setMenuItem(null); }}>
              从本组移除
            </button>
          </div>
        </>,
          document.body,
      )}
    </>
  );
}
