'use client';

import Link from 'next/link';
import { mapPackages } from '@/modules/maps';
import styles from './page.module.css';

export default function MapsManagementPage() {
  const items = mapPackages
    .filter((item) => item.admin.enabled)
    .map((item) => ({
      path: item.admin.entryPath,
      shortLabel: item.slug === 'rail' ? 'TL' : item.slug.slice(0, 2).toUpperCase(),
      label: item.name,
      desc: item.description,
    }));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>地图管理</h1>
        <p className={styles.description}>管理各地图模块的显示设置、渲染策略和专题数据入口。</p>
      </div>

      <div className={styles.grid}>
        {items.map((item) => (
          <Link key={item.path} href={item.path} className={styles.card}>
            <span className={styles.mark}>{item.shortLabel}</span>
            <div className={styles.cardText}>
              <span className={styles.cardTitle}>{item.label}</span>
              <span className={styles.cardDescription}>{item.desc}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
