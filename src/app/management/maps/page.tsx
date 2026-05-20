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
      <section className={styles.hero}>
        <div className={styles.header}>
          <span className={styles.eyebrow}>MAP PACKAGES</span>
          <h1 className={styles.title}>地图管理</h1>
          <p className={styles.description}>管理各地图模块的显示设置、渲染策略和专题数据入口，按专题地图包分流配置与运维操作。</p>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>已接入模块</span>
          <strong className={styles.summaryValue}>{items.length}</strong>
          <span className={styles.summaryHint}>统一从管理后台进入对应地图包配置页</span>
        </div>
      </section>

      <div className={styles.grid}>
        {items.map((item) => (
          <Link key={item.path} href={item.path} className={styles.card}>
            <span className={styles.mark}>{item.shortLabel}</span>
            <div className={styles.cardText}>
              <span className={styles.cardTitle}>{item.label}</span>
              <span className={styles.cardDescription}>{item.desc}</span>
            </div>
            <span className={styles.cardArrow}>进入</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
