'use client';

import { useMemo, useState } from 'react';

type Styles = Record<string, string>;

type RailStation = {
  name: string;
  lng: number;
  lat: number;
};

type RailMapRightPanelProps = {
  styles: Styles;
  stations: RailStation[];
  query: string;
  onQueryChange: (value: string) => void;
};

export function RailMapRightPanel({ styles, stations, query, onQueryChange }: RailMapRightPanelProps) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return stations
      .filter((station) => station.name && station.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [stations, query]);

  return (
    <div className={styles.searchStack}>
      <div className={styles.searchInputWrap}>
        <input
          className={styles.searchInput}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="搜索铁路站点"
        />
      </div>
      {!query.trim() ? (
        <div className={styles.status} style={{ color: '#6b7280', fontSize: 13 }}>
          输入关键词搜索站点（共 {stations.length.toLocaleString()} 站）
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.status}>未找到匹配站点</div>
      ) : (
        filtered.map((station, index) => (
          <article key={`${station.name}-${station.lng}-${station.lat}-${index}`} className={styles.poiCard}>
            <div className={styles.poiTop}>
              <div>
                <h3 className={styles.poiTitle}>{station.name}</h3>
              </div>
            </div>
          </article>
        ))
      )}
    </div>
  );
}

export function useRailMapPanelController() {
  const [query, setQuery] = useState('');

  return {
    query,
    setQuery,
  };
}

