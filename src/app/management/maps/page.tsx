'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { buildAdminHeaders, useAdminAuth } from '@/app/management/admin-auth';
import styles from './page.module.css';

type AdminMapPackageItem = {
  slug: string;
  name: string;
  description: string;
  isEnabled: boolean;
  sortOrder: number;
  entryPath: string | null;
  hasFrontend: boolean;
  hasAdmin: boolean;
};

export default function MapsManagementPage() {
  const { token } = useAdminAuth();
  const [items, setItems] = useState<AdminMapPackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { name: string; sortOrder: string }>>({});

  useEffect(() => {
    let active = true;

    fetch('/api/admin/maps/packages', { headers: buildAdminHeaders(token) })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        const nextItems = Array.isArray(data.list) ? data.list : [];
        setItems(nextItems);
        setDrafts(
          nextItems.reduce<Record<string, { name: string; sortOrder: string }>>((acc, item) => {
            acc[item.slug] = {
              name: item.name,
              sortOrder: String(item.sortOrder),
            };
            return acc;
          }, {}),
        );
      })
      .catch(() => {
        if (!active) return;
        setItems([]);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  const cards = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        shortLabel: item.slug === 'rail' ? 'TL' : item.slug.slice(0, 2).toUpperCase(),
      })),
    [items],
  );

  const handleToggle = async (item: AdminMapPackageItem) => {
    setBusySlug(item.slug);
    try {
      const response = await fetch(`/api/admin/maps/packages/${item.slug}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...buildAdminHeaders(token),
        },
        body: JSON.stringify({
          isEnabled: !item.isEnabled,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.item) {
        throw new Error(data.error || '更新失败');
      }
      setItems((current) =>
        current.map((entry) =>
          entry.slug === item.slug
            ? {
                ...entry,
                isEnabled: Boolean(data.item.isEnabled),
              }
            : entry,
        ),
      );
    } finally {
      setBusySlug(null);
    }
  };

  const handleDraftChange = (slug: string, field: 'name' | 'sortOrder', value: string) => {
    setDrafts((current) => ({
      ...current,
      [slug]: {
        ...(current[slug] ?? { name: '', sortOrder: '0' }),
        [field]: value,
      },
    }));
  };

  const handleSave = async (item: AdminMapPackageItem) => {
    const draft = drafts[item.slug];
    if (!draft) return;

    const normalizedName = draft.name.trim();
    const normalizedSortOrder = Number.parseInt(draft.sortOrder, 10);

    if (!normalizedName || !Number.isFinite(normalizedSortOrder)) {
      return;
    }

    setBusySlug(item.slug);
    try {
      const response = await fetch(`/api/admin/maps/packages/${item.slug}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...buildAdminHeaders(token),
        },
        body: JSON.stringify({
          name: normalizedName,
          sortOrder: normalizedSortOrder,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.item) {
        throw new Error(data.error || '保存失败');
      }
      setItems((current) =>
        current
          .map((entry) =>
            entry.slug === item.slug
              ? {
                  ...entry,
                  name: data.item.name,
                  sortOrder: data.item.sortOrder,
                }
              : entry,
          )
          .sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) {
              return a.sortOrder - b.sortOrder;
            }
            return a.slug.localeCompare(b.slug, 'zh-CN');
          }),
      );
      setDrafts((current) => ({
        ...current,
        [item.slug]: {
          name: data.item.name,
          sortOrder: String(data.item.sortOrder),
        },
      }));
    } finally {
      setBusySlug(null);
    }
  };

  return (
    <div className={styles.page}>
      {loading ? <div className={styles.state}>地图包加载中...</div> : null}
      <div className={styles.grid}>
        {cards.map((item) => {
          const draft = drafts[item.slug] ?? { name: item.name, sortOrder: String(item.sortOrder) };
          const nameChanged = draft.name.trim() !== item.name;
          const sortChanged = Number.parseInt(draft.sortOrder, 10) !== item.sortOrder;
          const canSave = draft.name.trim().length > 0 && Number.isFinite(Number.parseInt(draft.sortOrder, 10));

          return (
            <div key={item.slug} className={styles.cardShell}>
              <div className={`${styles.card} ${!item.entryPath || !item.hasAdmin ? styles.cardStatic : ''}`}>
                <div className={styles.cardHead}>
                  <span className={styles.cardShort}>{item.shortLabel}</span>
                  <span className={`${styles.badge} ${item.isEnabled ? styles.badgeEnabled : styles.badgeDisabled}`}>
                    {item.isEnabled ? '已启用' : '已停用'}
                  </span>
                </div>
                <div className={styles.cardText}>
                  <label className={styles.fieldBlock}>
                    <span className={styles.fieldLabel}>名称</span>
                    <input
                      className={styles.fieldInput}
                      value={draft.name}
                      disabled={busySlug === item.slug}
                      onChange={(event) => handleDraftChange(item.slug, 'name', event.target.value)}
                    />
                  </label>
                  <label className={styles.fieldBlock}>
                    <span className={styles.fieldLabel}>排序</span>
                    <input
                      className={styles.fieldInput}
                      type="number"
                      inputMode="numeric"
                      value={draft.sortOrder}
                      disabled={busySlug === item.slug}
                      onChange={(event) => handleDraftChange(item.slug, 'sortOrder', event.target.value)}
                    />
                  </label>
                  <span className={styles.cardDesc}>{item.description}</span>
                  {!item.hasFrontend || !item.hasAdmin ? (
                    <span className={styles.cardHint}>代码注册不完整，前台会自动忽略该地图包。</span>
                  ) : null}
                </div>
                {item.entryPath && item.hasAdmin ? (
                  <Link href={item.entryPath} className={styles.cardArrowLink}>
                    进入
                  </Link>
                ) : (
                  <span className={styles.cardArrowMuted}>未接入</span>
                )}
              </div>
              <button
                type="button"
                className={styles.toggleButton}
                disabled={busySlug === item.slug}
                onClick={() => handleToggle(item)}
              >
                {busySlug === item.slug ? '处理中...' : item.isEnabled ? '停用' : '启用'}
              </button>
              <button
                type="button"
                className={styles.saveButton}
                disabled={busySlug === item.slug || !canSave || (!nameChanged && !sortChanged)}
                onClick={() => handleSave(item)}
              >
                {busySlug === item.slug ? '处理中...' : '保存名称与排序'}
              </button>
            </div>
          );
        })}
      </div>
      {!loading && cards.length === 0 ? <div className={styles.state}>暂无地图包。</div> : null}
    </div>
  );
}
