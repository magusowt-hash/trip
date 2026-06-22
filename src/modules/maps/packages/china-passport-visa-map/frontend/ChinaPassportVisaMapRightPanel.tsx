'use client';

import { useMemo, useState } from 'react';
import { passportVisaCountries } from '../data/passportVisaCountries';
import type { PassportVisaCountry } from '../data/passportVisaTypes';
import {
  buildPassportVisaLegendCounts,
  filterPassportVisaCountries,
  findPassportVisaCountryByMapCode,
  getPassportVisaRiskBadgeLabel,
} from './passportVisaState';
import {
  getPassportVisaDetailSections,
  getPassportVisaRiskBadgeTone,
  shouldRenderPassportVisaReligiousLawBadge,
  shouldRenderPassportVisaRiskBadge,
} from './passportVisaDetail';
import styles from './ChinaPassportVisaMapRightPanel.module.css';

type ChinaPassportVisaMapRightPanelProps = {
  selectedCountryCode: string | null;
  onCountrySelect: (countryCode: string) => void;
};

function SelectedCountryCard({ country }: { country: PassportVisaCountry | null }) {
  if (!country) {
    return (
      <div className={styles.empty}>
        选择地图上的国家，或在下方搜索国家名称查看入境信息。
      </div>
    );
  }

  return (
    <section className={styles.detailCard}>
      <h3 className={styles.detailTitle}>{country.chineseName}</h3>
      <p className={styles.detailSub}>{country.englishName}</p>

      <div className={styles.badgeRow}>
        <span className={styles.badge}>{country.visaCategoryRaw}</span>
        {!country.mapCountryCode ? <span className={styles.badge}>地图未覆盖</span> : null}
        <span className={`${styles.badge} ${country.isHighRisk ? styles.dangerBadge : styles.safeBadge}`}>
          {getPassportVisaRiskBadgeLabel(country.isHighRisk)}
        </span>
        {shouldRenderPassportVisaRiskBadge(country.riskLevel) ? (
          <span className={`${styles.badge} ${styles[`riskBadge${getPassportVisaRiskBadgeTone(country.riskLevel)}`]}`}>
            {country.riskLevel}
          </span>
        ) : null}
        {shouldRenderPassportVisaReligiousLawBadge(country.religiousLawRestrictions) ? (
          <span className={`${styles.badge} ${styles.religiousBadge}`}>教法约束</span>
        ) : null}
      </div>

      <div className={styles.metaGrid}>
        <div>
          <p className={styles.metaLabel}>停留/有效信息</p>
          <p className={styles.metaValue}>{country.stayDuration || '未提供'}</p>
        </div>
        <div>
          <p className={styles.metaLabel}>签证费</p>
          <p className={styles.metaValue}>{country.visaFee || '未提供'}</p>
        </div>
        {country.highRiskNote ? (
          <div>
            <p className={styles.metaLabel}>风险备注</p>
            <p className={styles.metaValue}>{country.highRiskNote}</p>
          </div>
        ) : null}
        {country.officialVisaUrl ? (
          <div>
            <p className={styles.metaLabel}>官方签证网站</p>
            <p className={styles.metaValue}>
              <a className={styles.link} href={country.officialVisaUrl} target="_blank" rel="noreferrer">
                {country.officialVisaUrl}
              </a>
            </p>
          </div>
        ) : null}
        {country.embassyUrl ? (
          <div>
            <p className={styles.metaLabel}>中国驻当地使馆</p>
            <p className={styles.metaValue}>
              <a className={styles.link} href={country.embassyUrl} target="_blank" rel="noreferrer">
                {country.embassyUrl}
              </a>
            </p>
          </div>
        ) : null}
      </div>

      <div className={styles.detailSections}>
        {getPassportVisaDetailSections(country).map((section) => (
          <div key={section.title} className={styles.detailSection}>
            <p className={styles.metaLabel}>{section.title}</p>
            <p className={styles.detailText}>{section.content || section.emptyLabel}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ChinaPassportVisaMapRightPanel({
  selectedCountryCode,
  onCountrySelect,
}: ChinaPassportVisaMapRightPanelProps) {
  const [query, setQuery] = useState('');
  const legendCounts = useMemo(
    () => buildPassportVisaLegendCounts(passportVisaCountries),
    [],
  );
  const results = useMemo(
    () => filterPassportVisaCountries(passportVisaCountries, query).slice(0, 12),
    [query],
  );
  const selectedCountry = useMemo(
    () => findPassportVisaCountryByMapCode(passportVisaCountries, selectedCountryCode),
    [selectedCountryCode],
  );

  return (
    <div className={styles.panel}>
      <section className={styles.hero}>
        <span className={styles.eyebrow}>Passport Visa</span>
        <h2 className={styles.title}>中国护照签证地图</h2>
        <p className={styles.copy}>
          基于静态签证资料和世界轮廓图展示中国普通护照的全球入境便利度。颜色表示签证类型，点击国家可查看详细说明。
        </p>
      </section>

      <div className={styles.searchWrap}>
        <input
          className={styles.searchInput}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索国家/地区，如 日本、Japan"
        />
      </div>

      <div className={styles.legend}>
        {legendCounts.filter((item) => item.count > 0).map((item) => (
          <div key={item.group} className={styles.legendRow}>
            <span className={styles.legendDot} style={{ background: item.color }} />
            <span className={styles.legendLabel}>{item.label}</span>
            <span className={styles.legendCount}>{item.count}</span>
          </div>
        ))}
      </div>

      <SelectedCountryCard country={selectedCountry} />

      {query.trim() ? (
        <div className={styles.results}>
          {results.length === 0 ? <div className={styles.empty}>未找到匹配国家。</div> : null}
          {results.map((country) => (
            <button
              key={country.entrySlug}
              type="button"
              className={styles.resultButton}
              onClick={() => country.mapCountryCode && onCountrySelect(country.mapCountryCode)}
            >
              <article className={styles.resultCard}>
                <h3 className={styles.resultTitle}>{country.chineseName}</h3>
                <p className={styles.resultMeta}>
                  {country.englishName} · {country.visaCategoryRaw}
                </p>
              </article>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
