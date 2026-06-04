'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';

type FootprintGroup = {
  id: number;
  name: string;
  isDefault: number;
  sortOrder: number;
  itemCount: number;
  createdAt?: string;
};

type FootprintItem = {
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
  listId: number | null;
  listName: string | null;
  addedAt: string;
};

export default function TestCssPage() {
  const [groups, setGroups] = useState<FootprintGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [items, setItems] = useState<FootprintItem[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadGroups() {
      setGroupsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/footprints/groups', { credentials: 'include' });
        if (!response.ok) {
          throw new Error(`groups request failed: ${response.status}`);
        }
        const data = await response.json();
        if (cancelled) return;
        const nextGroups = Array.isArray(data.groups) ? data.groups : [];
        setGroups(nextGroups);
        setSelectedGroupId((current) => current ?? nextGroups[0]?.id ?? null);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : '加载足迹组失败');
      } finally {
        if (!cancelled) {
          setGroupsLoading(false);
        }
      }
    }

    void loadGroups();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedGroupId) {
      setItems([]);
      return;
    }

    let cancelled = false;

    async function loadItems() {
      setItemsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/footprints/groups/${selectedGroupId}/items`, {
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error(`items request failed: ${response.status}`);
        }
        const data = await response.json();
        if (cancelled) return;
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : '加载足迹组条目失败');
      } finally {
        if (!cancelled) {
          setItemsLoading(false);
        }
      }
    }

    void loadItems();
    return () => {
      cancelled = true;
    };
  }, [selectedGroupId]);

  const poiItems = useMemo(
    () => items.filter((item) => item.sourceType === 'map' || item.poiId != null),
    [items],
  );

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const poiJson = useMemo(() => JSON.stringify(poiItems, null, 2), [poiItems]);

  async function copyPoiJson() {
    try {
      await navigator.clipboard.writeText(poiJson);
    } catch {
      setError('复制失败，请检查浏览器权限');
    }
  }

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h1 className={styles.title}>足迹组 POI 诊断页</h1>
          <p className={styles.subtitle}>仅从服务器拉取足迹组与组内 POI 数据，不接排布逻辑。</p>
        </div>

        <div className={styles.statusCard}>
          <div>组数: <strong>{groups.length}</strong></div>
          <div>当前组: <strong>{selectedGroup?.name ?? '未选择'}</strong></div>
          <div>当前组 POI 数: <strong>{poiItems.length}</strong></div>
        </div>

        {groupsLoading ? (
          <div className={styles.placeholder}>正在加载足迹组…</div>
        ) : (
          <div className={styles.groupList}>
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`${styles.groupButton} ${group.id === selectedGroupId ? styles.groupButtonActive : ''}`}
                onClick={() => setSelectedGroupId(group.id)}
              >
                <span className={styles.groupName}>{group.name}</span>
                <span className={styles.groupMeta}>{group.itemCount} 项</span>
              </button>
            ))}
          </div>
        )}
      </aside>

      <main className={styles.main}>
        <div className={styles.toolbar}>
          <div>
            <h2 className={styles.sectionTitle}>POI 原始数据</h2>
            <p className={styles.sectionHint}>只保留 `sourceType === map` 或存在 `poiId` 的条目。</p>
          </div>
          <div className={styles.toolbarActions}>
            <button type="button" className={styles.actionButton} onClick={() => location.reload()}>
              刷新
            </button>
            <button type="button" className={styles.actionButton} onClick={copyPoiJson}>
              复制 POI JSON
            </button>
          </div>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>组内条目概览</span>
            <span>{itemsLoading ? '加载中…' : `${items.length} 条 / POI ${poiItems.length} 条`}</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>标题</th>
                  <th>来源</th>
                  <th>POI ID</th>
                  <th>经度</th>
                  <th>纬度</th>
                  <th>地址</th>
                </tr>
              </thead>
              <tbody>
                {poiItems.map((item) => (
                  <tr key={`${item.sourceType ?? 'unknown'}:${item.id}`}>
                    <td>{item.title}</td>
                    <td>{item.sourceType ?? '-'}</td>
                    <td>{item.poiId ?? '-'}</td>
                    <td>{item.lng ?? '-'}</td>
                    <td>{item.lat ?? '-'}</td>
                    <td>{item.address ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!itemsLoading && poiItems.length === 0 ? (
              <div className={styles.placeholder}>当前组没有 POI 条目。</div>
            ) : null}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>POI JSON</span>
            <span>{selectedGroup ? `groupId=${selectedGroup.id}` : '未选择分组'}</span>
          </div>
          <pre className={styles.codeBlock}>{poiJson}</pre>
        </section>
      </main>
    </div>
  );
}
