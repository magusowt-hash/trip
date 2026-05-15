'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import PlanMap, { MapMarker } from '@/components/PlanMap';
import styles from './maps-page.module.css';

type MapTab = 'standard' | 'china-rail';

type SearchResult = {
  poiId?: number;
  amapPoiId?: string | null;
  name: string;
  lng: string;
  lat: string;
  address?: string;
  city?: string;
  district?: string;
  type?: string;
};

type FavoriteItem = {
  poiId: number;
};

type FootprintItem = {
  poiId: number;
};

export default function MapsPage() {
  const [activeTab, setActiveTab] = useState<MapTab>('standard');
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedPoi, setSelectedPoi] = useState<SearchResult | null>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [footprints, setFootprints] = useState<Set<number>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'standard') return;

    void Promise.all([
      fetch('/api/maps/favorites', { credentials: 'include' }),
      fetch('/api/maps/footprints', { credentials: 'include' }),
    ])
      .then(async ([favoritesRes, footprintsRes]) => {
        if (favoritesRes.ok) {
          const data = await favoritesRes.json();
          setFavorites(new Set((data.favorites || []).map((item: FavoriteItem) => item.poiId)));
        }
        if (footprintsRes.ok) {
          const data = await footprintsRes.json();
          setFootprints(new Set((data.footprints || []).map((item: FootprintItem) => item.poiId)));
        }
      })
      .catch(() => {});
  }, [activeTab]);

  const markers = useMemo<MapMarker[]>(
    () =>
      results
        .filter((item) => item.lng && item.lat)
        .map((item) => ({
          id: item.poiId,
          position: [parseFloat(item.lng), parseFloat(item.lat)],
          title: item.name,
          address: item.address,
          description: [item.city, item.district].filter(Boolean).join(' '),
        })),
    [results],
  );

  const focusPosition = selectedPoi
    ? ([parseFloat(selectedPoi.lng), parseFloat(selectedPoi.lat)] as [number, number])
    : null;

  async function handleSearch(event?: FormEvent) {
    event?.preventDefault();

    const trimmed = query.trim();
    if (!trimmed) {
      setSearchError('请输入地点名称');
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      const params = new URLSearchParams({ q: trimmed });
      if (city.trim()) params.set('city', city.trim());
      const res = await fetch(`/api/maps/search?${params.toString()}`, { credentials: 'include' });
      const data = await res.json();

      if (!res.ok) {
        setSearchError(data.error || '搜索失败');
        setResults([]);
        return;
      }

      setResults(data.results || []);
      setSelectedPoi(data.results?.[0] || null);
      if (!data.results?.length) {
        setSearchError('没有找到匹配地点');
      }
    } catch {
      setSearchError('搜索失败，请稍后重试');
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleFavorite(poi: SearchResult) {
    const key = `fav:${poi.amapPoiId || poi.name}:${poi.lng}:${poi.lat}`;
    setSavingKey(key);

    try {
      const res = await fetch('/api/maps/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ poi }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '收藏失败');
        return;
      }

      const poiId = data.poi?.id;
      if (poiId) {
        setFavorites((prev) => new Set(prev).add(poiId));
        setResults((prev) => prev.map((item) => samePoi(item, poi) ? { ...item, poiId } : item));
        setSelectedPoi((prev) => (prev && samePoi(prev, poi) ? { ...prev, poiId } : prev));
      }
    } catch {
      alert('收藏失败');
    } finally {
      setSavingKey(null);
    }
  }

  async function handleFootprint(poi: SearchResult) {
    const key = `fp:${poi.amapPoiId || poi.name}:${poi.lng}:${poi.lat}`;
    setSavingKey(key);

    try {
      const res = await fetch('/api/maps/footprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ poi }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '加入足迹失败');
        return;
      }

      const poiId = data.poi?.id;
      if (poiId) {
        setFootprints((prev) => new Set(prev).add(poiId));
        setResults((prev) => prev.map((item) => samePoi(item, poi) ? { ...item, poiId } : item));
        setSelectedPoi((prev) => (prev && samePoi(prev, poi) ? { ...prev, poiId } : prev));
      }
    } catch {
      alert('加入足迹失败');
    } finally {
      setSavingKey(null);
    }
  }

  function handleMapPoiSelect(poi: SearchResult) {
    setActiveTab('standard');
    setSearchError(null);
    setResults((prev) => {
      const merged = [poi, ...prev.filter((item) => !samePoi(item, poi))];
      return merged.slice(0, 20);
    });
    setSelectedPoi(poi);
  }

  function handleMapMarkerClick(marker: MapMarker) {
    const matched = results.find(
      (item) =>
        item.lng === String(marker.position[0]) &&
        item.lat === String(marker.position[1]) &&
        item.name === marker.title,
    );
    if (matched) setSelectedPoi(matched);
  }

  return (
    <div className={styles.root}>
      <div className={styles.split}>
        <section className={styles.mapCol} aria-label="地图区域">
          <div className={styles.panel}>
            <div className={styles.tabs}>
              <button
                type="button"
                className={`${styles.tab} ${activeTab === 'standard' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('standard')}
              >
                普通地图
              </button>
              <button
                type="button"
                className={`${styles.tab} ${activeTab === 'china-rail' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('china-rail')}
              >
                中国铁路
              </button>
            </div>

            {activeTab === 'standard' ? (
              <>
                <form className={styles.searchRow} onSubmit={handleSearch}>
                  <input
                    className={styles.searchInput}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索已知地点名称"
                  />
                  <input
                    className={styles.cityInput}
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="城市"
                  />
                  <button className={styles.searchButton} type="submit" disabled={searching}>
                    {searching ? '搜索中' : '搜索'}
                  </button>
                </form>
                <p className={styles.helper}>支持搜索后定位，也支持直接点击地图识别明确 POI 再收藏或加入足迹。</p>
              </>
            ) : (
              <>
                <h2 className={styles.sectionTitle}>中国铁路地图</h2>
                <p className={styles.sectionDesc}>
                  这一版先预留独立专题视图入口。下一阶段可在这里接入铁路站点、线路和专题图层，而不与普通 POI 地图混杂在一起。
                </p>
              </>
            )}
          </div>

          <div className={styles.mapFrame}>
            {activeTab === 'standard' ? (
              <PlanMap
                markers={markers}
                focusPosition={focusPosition}
                onMarkerClick={handleMapMarkerClick}
                onMapPoiSelect={handleMapPoiSelect}
                autoLoadMarkers={false}
              />
            ) : (
              <div className={styles.status} style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                中国铁路地图专题视图待接入
              </div>
            )}
          </div>
        </section>

        <aside className={styles.listCol} aria-label="地图结果列表">
          <div className={styles.listPanel}>
            <h2 className={styles.sectionTitle}>{activeTab === 'standard' ? '地点结果' : '专题说明'}</h2>

            {activeTab === 'china-rail' ? (
              <div className={styles.status}>
                当前仅保留独立页签和视图位置。后续如果确定铁路数据来源，我会在这里补站点列表、线路筛选和地图联动。
              </div>
            ) : searchError && results.length === 0 ? (
              <div className={styles.status}>{searchError}</div>
            ) : results.length === 0 ? (
              <div className={styles.status}>搜索地点后，结果会显示在这里。点击地图也可以补充识别到的地点。</div>
            ) : (
              results.map((poi) => {
                const active = samePoi(poi, selectedPoi);
                const favorited = poi.poiId ? favorites.has(poi.poiId) : false;
                const visited = poi.poiId ? footprints.has(poi.poiId) : false;
                return (
                  <article
                    key={`${poi.amapPoiId || poi.name}-${poi.lng}-${poi.lat}`}
                    className={`${styles.poiCard} ${active ? styles.poiCardActive : ''}`}
                    onClick={() => setSelectedPoi(poi)}
                  >
                    <div className={styles.poiTop}>
                      <div>
                        <h3 className={styles.poiTitle}>{poi.name}</h3>
                        <p className={styles.poiAddress}>
                          {[poi.city, poi.district, poi.address].filter(Boolean).join(' ')}
                        </p>
                      </div>
                      <span className={styles.poiMeta}>{poi.type?.split(';')[0] || 'POI'}</span>
                    </div>
                    <div className={styles.poiActions}>
                      <button
                        type="button"
                        className={`${styles.ghostButton} ${favorited ? styles.saved : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!favorited) void handleFavorite(poi);
                        }}
                        disabled={favorited || savingKey === `fav:${poi.amapPoiId || poi.name}:${poi.lng}:${poi.lat}`}
                      >
                        {favorited ? '已收藏' : '收藏'}
                      </button>
                      <button
                        type="button"
                        className={`${styles.primaryButton} ${visited ? styles.saved : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!visited) void handleFootprint(poi);
                        }}
                        disabled={visited || savingKey === `fp:${poi.amapPoiId || poi.name}:${poi.lng}:${poi.lat}`}
                      >
                        {visited ? '已加入足迹' : '加入足迹'}
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function samePoi(a: SearchResult | null | undefined, b: SearchResult | null | undefined) {
  if (!a || !b) return false;
  return (a.amapPoiId && b.amapPoiId && a.amapPoiId === b.amapPoiId) || (a.name === b.name && a.lng === b.lng && a.lat === b.lat);
}
