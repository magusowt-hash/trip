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
      <div className={styles.grid}>
        {items.map((item) => (
          <Link key={item.path} href={item.path} className={styles.card}>
            <div className={styles.cardText}>
              <span className={styles.cardTitle}>{item.label}</span>
            </div>
            <span className={styles.cardArrow}>进入</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
