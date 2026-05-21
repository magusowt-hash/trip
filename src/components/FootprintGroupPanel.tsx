'use client';

import { useEffect, useState } from 'react';
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
  onRemoveItemFromGroup?: (groupId: number, item: FootprintItem) => void;
  onAddItemToGroup?: (item: FootprintItem, groupId: number) => void;
  onOpenAlbum: (item: FootprintItem) => void;
  onUploadPhoto: (item: FootprintItem) => void;
  onItemClick: (item: FootprintItem) => void;
  onLoadGroupItems?: (groupId: number) => Promise<FootprintItem[]>;
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
  onRemoveItemFromGroup,
  onAddItemToGroup,
  onOpenAlbum,
  onUploadPhoto,
  onItemClick,
  onLoadGroupItems,
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
  const [managementLoading, setManagementLoading] = useState(false);
  const [groupItemsMap, setGroupItemsMap] = useState<Record<number, FootprintItem[]>>({});

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

  useEffect(() => {
    if (!managementOpen || !onLoadGroupItems || groups.length === 0) return;
    let alive = true;
    setManagementLoading(true);

    Promise.all(
      groups.map(async (group) => {
        const loadedItems = await onLoadGroupItems(group.id);
        return [group.id, loadedItems] as const;
      }),
    )
      .then((entries) => {
        if (!alive) return;
        const nextMap: Record<number, FootprintItem[]> = {};
        for (const [groupId, loadedItems] of entries) {
          nextMap[groupId] = loadedItems;
        }
        setGroupItemsMap(nextMap);
      })
      .finally(() => {
        if (alive) setManagementLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [managementOpen, onLoadGroupItems, groups]);

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

  const allManagedItems = groups.flatMap((group) => {
    if (group.id === selectedGroupId && items.length > 0) return items;
    return groupItemsMap[group.id] || [];
  });
  const allItemDates = allManagedItems
    .map((item) => item.addedAt)
    .filter((value): value is string => !!value)
    .sort();
  const overallFirstDate = allItemDates[0] || groups.map((group) => group.createdAt).filter(Boolean).sort()[0] || null;
  const overallLastDate = allItemDates[allItemDates.length - 1] || groups.map((group) => group.createdAt).filter(Boolean).sort().slice(-1)[0] || null;
  const totalItemCount = allManagedItems.length;
  const activeGroupCount = groups.length;

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
              disabled={groups.length === 0}
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
      {managementOpen && groups.length > 0 && createPortal(
        <>
          <div className={styles.menuBackdrop} onClick={() => setManagementOpen(false)} />
          <div className={styles.managementModal} onClick={e => e.stopPropagation()}>
            <div className={styles.managementHeader}>
              <div className={styles.managementTitleWrap}>
                <div className={styles.managementEyebrow}>足迹管理</div>
                <h3 className={styles.managementTitle}>足迹组与地点</h3>
                <div className={styles.managementDate}>
                  足迹日期：{formatDate(overallFirstDate)} 至 {formatDate(overallLastDate)}
                </div>
              </div>
              <button className={styles.managementClose} onClick={() => setManagementOpen(false)}>
                ✕
              </button>
            </div>

            <div className={styles.managementBody}>
              <div className={styles.managementHero}>
                <div className={styles.managementHeroMain}>
                  <div className={styles.managementHeroLabel}>整体概况</div>
                  <div className={styles.managementHeroValue}>
                    {totalItemCount}
                    <span> 个足迹项</span>
                  </div>
                  <div className={styles.managementHeroSub}>
                    共 {activeGroupCount} 个足迹组
                  </div>
                </div>
                <div className={styles.managementBadgeWrap}>
                  <span className={`${styles.managementBadge} ${selectedGroup?.isDefault === 1 ? styles.managementBadgeActive : ''}`}>
                    当前查看：{selectedGroup?.name || '未选择'}
                  </span>
                </div>
              </div>

              <div className={styles.managementListCard}>
                <div className={styles.managementListHeader}>
                  <div>
                    <div className={styles.managementLabel}>全部足迹组</div>
                    <div className={styles.managementListHint}>在这里集中管理所有足迹组与足迹项</div>
                  </div>
                  <div className={styles.managementListHeaderSide}>
                    <div className={styles.managementListCount}>{groups.length}</div>
                    <button
                      className={styles.managementPrimaryBtn}
                      onClick={() => {
                        setManagementOpen(false);
                        setShowNewInput(true);
                      }}
                    >
                      新建足迹组
                    </button>
                  </div>
                </div>
                {managementLoading ? (
                  <div className={styles.managementEmpty}>正在加载足迹内容...</div>
                ) : groups.length === 0 ? (
                  <div className={styles.managementEmpty}>当前还没有足迹组</div>
                ) : (
                  <div className={styles.managementGroupList}>
                    {groups.map((group) => {
                      const managedItems = group.id === selectedGroupId && items.length > 0
                        ? items
                        : (groupItemsMap[group.id] || []);
                      const managedDates = managedItems
                        .map((item) => item.addedAt)
                        .filter((value): value is string => !!value)
                        .sort();
                      const groupFirstDate = managedDates[0] || group.createdAt || null;
                      const groupLastDate = managedDates[managedDates.length - 1] || group.createdAt || null;

                      return (
                        <div key={group.id} className={styles.managementGroupCard}>
                          <div className={styles.managementGroupHeader}>
                            <div className={styles.managementGroupTitleWrap}>
                              <div className={styles.managementGroupTitleRow}>
                                <div className={styles.managementGroupTitle}>{group.name}</div>
                                {group.isDefault === 1 ? (
                                  <span className={`${styles.managementBadge} ${styles.managementBadgeActive}`}>默认</span>
                                ) : null}
                              </div>
                              <div className={styles.managementGroupMeta}>
                                {formatDate(groupFirstDate)} 至 {formatDate(groupLastDate)} · {managedItems.length} 个地点
                              </div>
                            </div>
                            <div className={styles.managementGroupActions}>
                              <button
                                className={styles.managementBtn}
                                onClick={() => {
                                  onSelectGroup(group.id);
                                  setManagementOpen(false);
                                }}
                              >
                                查看此组
                              </button>
                              {onOpenLocalMapForGroup ? (
                                <button
                                  className={styles.managementBtn}
                                  onClick={() => {
                                    onSelectGroup(group.id);
                                    onOpenLocalMapForGroup();
                                    setManagementOpen(false);
                                  }}
                                >
                                  映射本地
                                </button>
                              ) : null}
                              <button className={styles.managementBtn} onClick={() => onSetDefault(group.id)}>
                                设为默认
                              </button>
                              <button
                                className={styles.managementBtn}
                                onClick={() => {
                                  setEditingId(group.id);
                                  setEditName(group.name);
                                  setManagementOpen(false);
                                  onSelectGroup(group.id);
                                }}
                              >
                                重命名
                              </button>
                              <button className={styles.managementDanger} onClick={() => onDeleteGroup(group.id)}>
                                删除组
                              </button>
                            </div>
                          </div>
                          {managedItems.length === 0 ? (
                            <div className={styles.managementEmptyInline}>当前组还没有足迹项</div>
                          ) : (
                            <div className={styles.managementList}>
                              {managedItems.map((item) => (
                                <div key={item.id} className={styles.managementListItem}>
                                  <div className={styles.managementListMain}>
                                    <div className={styles.managementListTitle}>{item.title}</div>
                                    <div className={styles.managementListMeta}>
                                      {item.address || '未记录地点描述'}
                                    </div>
                                  </div>
                                  <div className={styles.managementListAside}>
                                    <div className={styles.managementListDate}>
                                      {formatDate(item.addedAt)}
                                    </div>
                                    <div className={styles.managementItemActions}>
                                      <button
                                        className={styles.managementTextBtn}
                                        onClick={() => {
                                          onSelectGroup(group.id);
                                          onItemClick(item);
                                          setManagementOpen(false);
                                        }}
                                      >
                                        定位
                                      </button>
                                      <button className={styles.managementTextBtn} onClick={() => onOpenAlbum(item)}>
                                        相册
                                      </button>
                                      <button className={styles.managementTextBtn} onClick={() => onUploadPhoto(item)}>
                                        上传
                                      </button>
                                      {onRemoveItemFromGroup ? (
                                        <button
                                          className={styles.managementTextDanger}
                                          onClick={() => onRemoveItemFromGroup(group.id, item)}
                                        >
                                          移出
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
