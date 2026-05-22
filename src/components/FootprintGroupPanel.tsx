'use client';

import { useEffect, useMemo, useState } from 'react';
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
  listItemId: number | null;
  poiId?: number | null;
  albumScopeKey?: string | null;
  sourceType?: 'list' | 'map';
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
  backgroundColor?: string;
  onCollapsedChange: (v: boolean) => void;
  onSelectGroup: (id: number) => void;
  onNewGroup: (name: string) => Promise<void>;
  onRenameGroup: (id: number, name: string) => Promise<void>;
  onDeleteGroup: (id: number) => Promise<void>;
  onSetDefault: (id: number) => Promise<void>;
  onRemoveItem: (item: FootprintItem) => void;
  onRemoveItemFromGroup?: (groupId: number, item: FootprintItem, options?: { skipConfirm?: boolean }) => Promise<void> | void;
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
  backgroundColor,
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
  const [managementGroupId, setManagementGroupId] = useState<number | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [inlineAddMenuItemId, setInlineAddMenuItemId] = useState<number | null>(null);
  const [bulkAddMenuOpen, setBulkAddMenuOpen] = useState(false);
  const [bulkAddMenuPos, setBulkAddMenuPos] = useState({ x: 0, y: 0 });
  const [inlineAddMenuPos, setInlineAddMenuPos] = useState({ x: 0, y: 0 });

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

  useEffect(() => {
    if (!managementOpen) return;
    setManagementGroupId((current) => {
      if (current && groups.some((group) => group.id === current)) return current;
      if (selectedGroupId && groups.some((group) => group.id === selectedGroupId)) return selectedGroupId;
      return groups[0]?.id ?? null;
    });
  }, [managementOpen, groups, selectedGroupId]);

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

  useEffect(() => {
    setSelectedItemIds([]);
    setInlineAddMenuItemId(null);
    setBulkAddMenuOpen(false);
  }, [managementGroupId, managementOpen]);

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

  const managedGroup = groups.find((group) => group.id === managementGroupId) || null;
  const managedItems = useMemo(() => {
    if (!managementGroupId) return [];
    if (managementGroupId === selectedGroupId && items.length > 0) return items;
    return groupItemsMap[managementGroupId] || [];
  }, [managementGroupId, selectedGroupId, items, groupItemsMap]);
  const managedDates = managedItems
    .map((item) => item.addedAt)
    .filter((value): value is string => !!value)
    .sort();
  const managedFirstDate = managedDates[0] || managedGroup?.createdAt || null;
  const managedLastDate = managedDates[managedDates.length - 1] || managedGroup?.createdAt || null;
  const selectedItems = managedItems.filter((item) => selectedItemIds.includes(item.id));
  const allSelected = managedItems.length > 0 && selectedItemIds.length === managedItems.length;
  const bulkTargetGroups = groups.filter((group) => group.id !== managementGroupId);
  const managementModalStyle = backgroundColor
    ? { background: `${backgroundColor}d6` }
    : undefined;

  const toggleItemSelection = (itemId: number) => {
    setSelectedItemIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedItemIds([]);
      return;
    }
    setSelectedItemIds(managedItems.map((item) => item.id));
  };

  const handleBulkDelete = async () => {
    if (!managementGroupId || !onRemoveItemFromGroup || selectedItems.length === 0) return;
    if (!confirm(`确定删除选中的 ${selectedItems.length} 个地点？`)) return;
    for (const item of selectedItems) {
      await onRemoveItemFromGroup(managementGroupId, item, { skipConfirm: true });
    }
    setSelectedItemIds([]);
  };

  const handleBulkAddToGroup = async (targetGroupId: number) => {
    if (!onAddItemToGroup || selectedItems.length === 0) return;
    for (const item of selectedItems) {
      await onAddItemToGroup(item, targetGroupId);
    }
    setSelectedItemIds([]);
    setBulkAddMenuOpen(false);
  };

  const openBulkAddMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setBulkAddMenuPos({ x: rect.left, y: rect.bottom + 8 });
    setBulkAddMenuOpen((current) => !current);
    setInlineAddMenuItemId(null);
  };

  const openInlineAddMenu = (itemId: number, e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setInlineAddMenuPos({ x: rect.left, y: rect.bottom + 8 });
    setInlineAddMenuItemId((current) => current === itemId ? null : itemId);
    setBulkAddMenuOpen(false);
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
              {groups.map((g) => (
                <div key={g.id} className={styles.groupWrap}>
                  <div
                    className={`${styles.groupItem} ${selectedGroupId === g.id ? styles.active : ''}`}
                    onClick={() => onSelectGroup(g.id)}
                  >
                    {editingId === g.id ? (
                      <div className={styles.editRow}>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleRename(g.id)}
                          className={styles.editInput}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button className={styles.miniBtn} onClick={(e) => { e.stopPropagation(); void handleRename(g.id); }}>✓</button>
                        <button className={styles.miniBtn} onClick={(e) => { e.stopPropagation(); setEditingId(null); }}>✕</button>
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

                  {selectedGroupId === g.id && (
                    <div className={styles.itemList}>
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className={styles.panelItem}
                          onClick={() => onItemClick(item)}
                          onContextMenu={(e) => handleContextMenu(e, item)}
                        >
                          <span className={styles.itemTitle}>{item.title}</span>
                          <button
                            className={styles.itemMoreBtn}
                            onClick={(e) => { e.stopPropagation(); handleContextMenu(e, item); }}
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
          </>
        )}
      </div>

      {managementOpen && groups.length > 0 && createPortal(
        <>
          <div className={styles.menuBackdrop} onClick={() => setManagementOpen(false)} />
          <div className={styles.managementModal} style={managementModalStyle} onClick={(e) => e.stopPropagation()}>
            <div className={styles.managementHeader}>
              <div className={styles.managementTitleWrap}>
                <h2 className={styles.managementTitle}>足迹管理</h2>
                <div className={styles.managementDate}>
                  足迹日期：{formatDate(overallFirstDate)} 至 {formatDate(overallLastDate)}
                </div>
              </div>
              <button className={styles.managementClose} onClick={() => setManagementOpen(false)}>
                ✕
              </button>
            </div>

            <div className={styles.managementBody}>
              <aside className={styles.managementSidebar}>
                <div className={styles.managementSidebarTop}>
                  <div className={styles.managementStatRow}>
                    <div className={styles.managementStatBlock}>
                      <div className={styles.managementLabel}>足迹组</div>
                      <div className={styles.managementValue}>{activeGroupCount}</div>
                    </div>
                    <div className={styles.managementStatBlock}>
                      <div className={styles.managementLabel}>地点数</div>
                      <div className={styles.managementValue}>{totalItemCount}</div>
                    </div>
                  </div>
                  <button
                    className={styles.managementPrimaryBtn}
                    onClick={() => setShowNewInput(true)}
                  >
                    新建足迹组
                  </button>
                  {showNewInput ? (
                    <div className={styles.newRow}>
                      <input
                        placeholder="分类组名称"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
                        className={styles.newInput}
                        autoFocus
                      />
                      <button className={styles.miniBtn} onClick={() => void handleCreate()}>✓</button>
                      <button className={styles.miniBtn} onClick={() => { setShowNewInput(false); setNewName(''); }}>✕</button>
                    </div>
                  ) : null}
                </div>

                <div className={styles.managementGroupTabs}>
                  {groups.map((group) => {
                    const count = group.id === selectedGroupId && items.length > 0
                      ? items.length
                      : (groupItemsMap[group.id] || []).length;
                    const active = managementGroupId === group.id;
                    return (
                      <button
                        key={group.id}
                        className={`${styles.managementGroupTab} ${active ? styles.managementGroupTabActive : ''}`}
                        onClick={() => {
                          setManagementGroupId(group.id);
                          onSelectGroup(group.id);
                        }}
                      >
                        <span className={styles.managementGroupTabMain}>
                          <span className={styles.managementGroupTabName}>{group.name}</span>
                          {group.isDefault === 1 ? <span className={styles.managementBadge}>默认</span> : null}
                        </span>
                        <span className={styles.managementGroupTabCount}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <section className={styles.managementContent}>
                {managementLoading ? (
                  <div className={styles.managementEmpty}>正在加载足迹内容...</div>
                ) : !managedGroup ? (
                  <div className={styles.managementEmpty}>当前还没有足迹组</div>
                ) : (
                  <>
                    <div className={styles.managementToolbar}>
                      <div className={styles.managementToolbarMain}>
                        <div className={styles.managementContentTitleRow}>
                          <div className={styles.managementContentTitle}>{managedGroup.name}</div>
                          <div className={styles.managementContentMeta}>
                            {formatDate(managedFirstDate)} 至 {formatDate(managedLastDate)} · {managedItems.length} 个地点
                          </div>
                        </div>
                        <div className={styles.managementToolbarActions}>
                          <button className={styles.managementBtn} onClick={() => onSetDefault(managedGroup.id)}>
                            设为默认
                          </button>
                          {onOpenLocalMapForGroup ? (
                            <button
                              className={styles.managementBtn}
                              onClick={() => {
                                onSelectGroup(managedGroup.id);
                                onOpenLocalMapForGroup();
                                setManagementOpen(false);
                              }}
                            >
                              映射本地
                            </button>
                          ) : null}
                          <button
                            className={styles.managementBtn}
                            onClick={() => {
                              setEditingId(managedGroup.id);
                              setEditName(managedGroup.name);
                              setManagementOpen(false);
                              onSelectGroup(managedGroup.id);
                            }}
                          >
                            重命名
                          </button>
                          <button className={styles.managementDanger} onClick={() => void onDeleteGroup(managedGroup.id)}>
                            删除组
                          </button>
                        </div>
                      </div>

                      <div className={styles.managementBulkBar}>
                        <label className={styles.managementCheckboxLabel}>
                          <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                          全选
                        </label>
                        <span className={styles.managementBulkCount}>已选 {selectedItems.length}</span>
                        {bulkTargetGroups.length > 0 && onAddItemToGroup ? (
                          <button
                            className={styles.managementTextBtn}
                            disabled={selectedItems.length === 0}
                            onClick={openBulkAddMenu}
                          >
                            添加到
                          </button>
                        ) : null}
                        <button
                          className={styles.managementTextDanger}
                          disabled={selectedItems.length === 0}
                          onClick={() => void handleBulkDelete()}
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    {managedItems.length === 0 ? (
                      <div className={styles.managementEmptyInline}>当前组还没有地点</div>
                    ) : (
                      <div className={styles.managementTable}>
                        {managedItems.map((item) => {
                          const checked = selectedItemIds.includes(item.id);
                          return (
                            <div key={item.id} className={styles.managementRow}>
                              <label className={styles.managementCheckboxCell}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleItemSelection(item.id)}
                                />
                              </label>
                              <button
                                className={styles.managementPlaceCell}
                                onClick={() => {
                                  onSelectGroup(managedGroup.id);
                                  onItemClick(item);
                                  setManagementOpen(false);
                                }}
                              >
                                {item.title}
                                {item.albumScopeKey && item.albumScopeKey !== `fpgi_${item.id}` ? (
                                  <span className={styles.managementSharedBadge}>共享</span>
                                ) : null}
                              </button>
                              <div className={styles.managementDateCell}>{formatDate(item.addedAt)}</div>
                              <div className={styles.managementRowActions}>
                                <button className={styles.managementTextBtn} disabled={!item.listItemId} onClick={() => onOpenAlbum(item)}>
                                  相册
                                </button>
                                <button className={styles.managementTextBtn} disabled={!item.listItemId} onClick={() => onUploadPhoto(item)}>
                                  上传图片
                                </button>
                                {onAddItemToGroup && bulkTargetGroups.length > 0 ? (
                                  <div className={styles.managementInlineMenuWrap}>
                                    <button
                                      className={styles.managementTextBtn}
                                      disabled={!item.listItemId}
                                      onClick={(e) => openInlineAddMenu(item.id, e)}
                                    >
                                      添加到
                                    </button>
                                  </div>
                                ) : null}
                                {onRemoveItemFromGroup ? (
                                  <button
                                    className={styles.managementTextDanger}
                                    onClick={() => onRemoveItemFromGroup(managedGroup.id, item)}
                                  >
                                    删除
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          </div>
        </>,
        document.body,
      )}

      {menuItem && createPortal(
        <>
          <div className={styles.menuBackdrop} onClick={() => setMenuItem(null)} />
          <div
            className={styles.itemMenu}
            style={{ left: menuPos.x - 10, top: menuPos.y, transform: 'translate(-100%, 0)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className={styles.menuItemBtn} disabled={!menuItem.listItemId} onClick={() => { onOpenAlbum(menuItem); setMenuItem(null); }}>
              相册
            </button>
            <button className={styles.menuItemBtn} disabled={!menuItem.listItemId} onClick={() => { onUploadPhoto(menuItem); setMenuItem(null); }}>
              上传图片
            </button>
            {onAddItemToGroup && groups.filter((group) => group.id !== selectedGroupId).length > 0 ? (
              <>
                <div className={styles.menuSectionLabel}>添加到</div>
                {groups
                  .filter((group) => group.id !== selectedGroupId)
                  .map((group) => (
                    <button
                      key={group.id}
                      className={styles.menuItemBtn}
                      disabled={!menuItem.listItemId}
                      onClick={() => { void onAddItemToGroup(menuItem, group.id); setMenuItem(null); }}
                    >
                      {group.name}
                    </button>
                  ))}
              </>
            ) : null}
            <button className={styles.menuItemDanger} onClick={() => { onRemoveItem(menuItem); setMenuItem(null); }}>
              删除
            </button>
          </div>
        </>,
        document.body,
      )}

      {managementOpen && bulkAddMenuOpen && bulkTargetGroups.length > 0 && createPortal(
        <>
          <div className={styles.menuBackdrop} onClick={() => setBulkAddMenuOpen(false)} />
          <div
            className={styles.managementFloatingMenu}
            style={{ left: bulkAddMenuPos.x, top: bulkAddMenuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {bulkTargetGroups.map((group) => (
              <button
                key={group.id}
                className={styles.managementInlineMenuBtn}
                onClick={() => void handleBulkAddToGroup(group.id)}
              >
                {group.name}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}

      {managementOpen && inlineAddMenuItemId != null && bulkTargetGroups.length > 0 && onAddItemToGroup && createPortal(
        <>
          <div className={styles.menuBackdrop} onClick={() => setInlineAddMenuItemId(null)} />
          <div
            className={styles.managementFloatingMenu}
            style={{ left: inlineAddMenuPos.x, top: inlineAddMenuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {bulkTargetGroups.map((group) => (
              <button
                key={group.id}
                className={styles.managementInlineMenuBtn}
                onClick={() => {
                  const item = managedItems.find((candidate) => candidate.id === inlineAddMenuItemId);
                  if (!item) return;
                  void onAddItemToGroup(item, group.id);
                  setInlineAddMenuItemId(null);
                }}
              >
                {group.name}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
