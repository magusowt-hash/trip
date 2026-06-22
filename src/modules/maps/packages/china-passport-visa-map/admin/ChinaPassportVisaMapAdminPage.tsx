'use client';

import { passportVisaCountries } from '../data/passportVisaCountries';
import { buildPassportVisaLegendCounts, countMappablePassportVisaCountries } from '../frontend/passportVisaState';
import styles from './ChinaPassportVisaMapAdminPage.module.css';

export function ChinaPassportVisaMapAdminPage() {
  const legend = buildPassportVisaLegendCounts(passportVisaCountries);
  const mappableCount = countMappablePassportVisaCountries(passportVisaCountries);
  const unmappableCount = passportVisaCountries.length - mappableCount;

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.title}>中国护照签证地图</h1>
        <p className={styles.copy}>
          当前版本使用包内静态数据。来源为用户提供的 Excel 签证清单与世界 SVG 底图，本页仅做数据概览，不提供在线编辑。
        </p>
      </header>

      <section className={styles.stats}>
        <article className={styles.card}>
          <p className={styles.statValue}>{passportVisaCountries.length}</p>
          <p className={styles.statLabel}>总国家/地区条目</p>
        </article>
        <article className={styles.card}>
          <p className={styles.statValue}>{mappableCount}</p>
          <p className={styles.statLabel}>可在世界图着色</p>
        </article>
        <article className={styles.card}>
          <p className={styles.statValue}>{unmappableCount}</p>
          <p className={styles.statLabel}>仅面板展示条目</p>
        </article>
      </section>

      <section className={styles.card}>
        <div className={styles.legendList}>
          {legend.map((item) => (
            <div key={item.group} className={styles.legendRow}>
              <span className={styles.dot} style={{ background: item.color }} />
              <span className={styles.legendLabel}>{item.label}</span>
              <span className={styles.legendCount}>{item.count}</span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
