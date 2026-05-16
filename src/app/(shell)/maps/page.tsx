'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import PlanMap, { MapMarker } from '@/components/PlanMap';
import RailCanvas from '@/components/RailCanvas';
import styles from './maps-page.module.css';

type MapTab = 'standard' | 'china-rail';

type RailRoute = { p: [number, number][]; c: string; w: number; t: string };
type RailStation = { name: string; lng: number; lat: number; 'name:en'?: string };

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

type SavedFavorite = { poiId: number };
type SavedFootprint = { poiId: number };

export default function MapsPage() {
  const [activeTab, setActiveTab] = useState<MapTab>('standard');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedPoi, setSelectedPoi] = useState<SearchResult | null>(null);
  const [mapSelectedPoi, setMapSelectedPoi] = useState<SearchResult | null>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [footprints, setFootprints] = useState<Set<number>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // 中国铁路
  const [railRoutes, setRailRoutes] = useState<RailRoute[]>([]);
  const [railStations, setRailStations] = useState<RailStation[]>([]);
  const [stationQuery, setStationQuery] = useState('');
  const [railLoaded, setRailLoaded] = useState(false);
  const [railZoom, setRailZoom] = useState(4);
  const railMapRef = useRef<any>(null);

  useEffect(() => {
    if (activeTab !== 'standard') return;

    void Promise.all([
      fetch('/api/maps/favorites', { credentials: 'include' }),
      fetch('/api/maps/footprints', { credentials: 'include' }),
    ])
      .then(async ([favoritesRes, footprintsRes]) => {
        if (favoritesRes.ok) {
          const data = await favoritesRes.json();
          setFavorites(new Set((data.favorites || []).map((item: SavedFavorite) => item.poiId)));
        }
        if (footprintsRes.ok) {
          const data = await footprintsRes.json();
          setFootprints(new Set((data.footprints || []).map((item: SavedFootprint) => item.poiId)));
        }
      })
      .catch(() => {});
  }, [activeTab]);

  // 加载中国铁路数据
  useEffect(() => {
    if (activeTab !== 'china-rail' || railLoaded) return;
    setRailLoaded(true);
    fetch('/data/railways.json')
      .then((r) => r.json())
      .then(setRailRoutes)
      .catch(console.error);
    fetch('/data/stations.json')
      .then((r) => r.json())
      .then(setRailStations)
      .catch(console.error);
  }, [activeTab, railLoaded]);

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
    setMapSelectedPoi(null);

    try {
      const params = new URLSearchParams({ q: trimmed });
      const res = await fetch(`/api/maps/search?${params.toString()}`, { credentials: 'include' });
      const data = await res.json();

      if (!res.ok) {
        setSearchError(data.error || '搜索失败');
        setResults([]);
        return;
      }

      const nextResults = (data.results || []).slice(0, 8);
      setResults(nextResults);
      setSelectedPoi(nextResults.length === 1 ? nextResults[0] : null);
      if (!nextResults.length) {
        setSearchError('没有找到匹配地点');
      }
    } catch {
      setSearchError('搜索失败，请稍后重试');
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function savePoi(mode: 'favorite' | 'footprint', poi: SearchResult) {
    const key = `${mode}:${poi.amapPoiId || poi.name}:${poi.lng}:${poi.lat}`;
    setSavingKey(key);

    try {
      const res = await fetch(`/api/maps/${mode === 'favorite' ? 'favorites' : 'footprints'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ poi }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || (mode === 'favorite' ? '收藏失败' : '加入足迹失败'));
        return;
      }

      const poiId = data.poi?.id;
      if (!poiId) return;

      if (mode === 'favorite') {
        setFavorites((prev) => new Set(prev).add(poiId));
      } else {
        setFootprints((prev) => new Set(prev).add(poiId));
      }

      const updater = (item: SearchResult) => samePoi(item, poi) ? { ...item, poiId } : item;
      setResults((prev) => prev.map(updater));
      setSelectedPoi((prev) => (prev && samePoi(prev, poi) ? { ...prev, poiId } : prev));
      setMapSelectedPoi((prev) => (prev && samePoi(prev, poi) ? { ...prev, poiId } : prev));
    } catch {
      alert(mode === 'favorite' ? '收藏失败' : '加入足迹失败');
    } finally {
      setSavingKey(null);
    }
  }

  function handleResultClick(poi: SearchResult) {
    setSelectedPoi(poi);
    setMapSelectedPoi(null);
  }

  function handleMapPoiSelect(poi: SearchResult) {
    setMapSelectedPoi(attachSavedState(poi, favorites, footprints));
  }

  function handleMapMarkerClick(marker: MapMarker) {
    const matched = results.find(
      (item) =>
        item.lng === String(marker.position[0]) &&
        item.lat === String(marker.position[1]) &&
        item.name === marker.title,
    );
    if (matched) {
      setSelectedPoi(matched);
      setMapSelectedPoi(null);
    }
  }

  const mapPopupPoi = mapSelectedPoi ? attachSavedState(mapSelectedPoi, favorites, footprints) : null;

  return (
    <div className={styles.root}>
      <div className={styles.split}>
        <section className={styles.mapCol} aria-label="地图区域">
          <div className={styles.mapFrame}>
            {activeTab === 'standard' ? (
              <PlanMap
                markers={markers}
                focusPosition={focusPosition}
                onMarkerClick={handleMapMarkerClick}
                onMapPoiSelect={handleMapPoiSelect}
                selectedMapPoi={mapPopupPoi}
                onMapPoiFavorite={(poi) => void savePoi('favorite', poi)}
                onMapPoiFootprint={(poi) => void savePoi('footprint', poi)}
                autoLoadMarkers={false}
              />
            ) : (
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <PlanMap
                  autoLoadMarkers={false}
                  onMapLoad={(m: any) => {
                    railMapRef.current = m;
                    setRailZoom(m.getZoom());
                    m.on('zoomend', () => setRailZoom(m.getZoom()));
                  }}
                />
                {railMapRef.current && (
                  <RailCanvas
                    mapInstance={railMapRef.current}
                    routes={railRoutes}
                    zoom={railZoom}
                  />
                )}
              </div>
            )}
          </div>
        </section>

        <aside className={styles.listCol} aria-label="地图结果列表">
          <div className={styles.listPanel}>
            <div className={styles.topRow}>
              <div className={styles.scrollTabs}>
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
                <button type="button" className={styles.tab}>
                  种类C
                </button>
                <button type="button" className={styles.tab}>
                  种类D
                </button>
              </div>
              </div>
              <button
                type="button"
                className={styles.toolButtonDetail}
                onClick={() => setDetailOpen(true)}
                aria-label="查看全部地图种类"
              >
                &#x22ef;
              </button>
            </div>

            {activeTab === 'china-rail' ? (
              <RailPanel
                stations={railStations}
                query={stationQuery}
                onQueryChange={setStationQuery}
              />
            ) : (
              <>
                <form className={styles.searchStack} onSubmit={handleSearch}>
                  <div className={styles.searchInputWrap}>
                    <input
                      className={styles.searchInput}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="搜索地点"
                    />
                    <button
                      type="submit"
                      className={styles.searchIcon}
                      disabled={searching}
                      aria-label="搜索"
                    >
                      <span className={styles.searchGlyph} />
                    </button>
                  </div>
                </form>

                {searchError && results.length === 0 ? (
                  <div className={styles.status}>{searchError}</div>
                ) : results.length === 0 ? null : (
                  results.map((poi) => {
                    const active = samePoi(poi, selectedPoi);
                    const favorited = poi.poiId ? favorites.has(poi.poiId) : false;
                    const visited = poi.poiId ? footprints.has(poi.poiId) : false;
                    return (
                      <article
                        key={`${poi.amapPoiId || poi.name}-${poi.lng}-${poi.lat}`}
                        className={`${styles.poiCard} ${active ? styles.poiCardActive : ''}`}
                        onClick={() => handleResultClick(poi)}
                      >
                        <div className={styles.poiTop}>
                          <div>
                            <h3 className={styles.poiTitle}>{poi.name}</h3>
                            <p className={styles.poiAddress}>
                              {[poi.city, poi.district, poi.address].filter(Boolean).join(' ')}
                            </p>
                          </div>
                        </div>
                        <div className={styles.poiActions}>
                          <button
                            type="button"
                            className={`${styles.ghostButton} ${favorited ? styles.saved : ''}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!favorited) void savePoi('favorite', poi);
                            }}
                            disabled={favorited || savingKey === `favorite:${poi.amapPoiId || poi.name}:${poi.lng}:${poi.lat}`}
                          >
                            {favorited ? '已收藏' : '收藏'}
                          </button>
                          <button
                            type="button"
                            className={`${styles.primaryButton} ${visited ? styles.saved : ''}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!visited) void savePoi('footprint', poi);
                            }}
                            disabled={visited || savingKey === `footprint:${poi.amapPoiId || poi.name}:${poi.lng}:${poi.lat}`}
                          >
                            {visited ? '已加入足迹' : '加入足迹'}
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      {detailOpen ? (
        <div className={styles.detailModalOverlay} onClick={() => setDetailOpen(false)}>
          <div className={styles.detailModalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.detailModalHeader}>
              <h3 className={styles.detailModalTitle}>全部地图种类</h3>
              <button type="button" className={styles.detailModalClose} onClick={() => setDetailOpen(false)}>
                &#x2715;
              </button>
            </div>
            <div className={styles.detailGrid}>
              <button
                type="button"
                className={`${styles.mapTypeCard} ${activeTab === 'standard' ? styles.mapTypeCardActive : ''}`}
                onClick={() => {
                  setActiveTab('standard');
                  setDetailOpen(false);
                }}
              >
                <span className={styles.mapTypeCardName}>普通地图</span>
                <span className={styles.mapTypeCardDesc}>地点搜索、地图点击识别已有 POI、收藏与足迹。</span>
              </button>
              <button
                type="button"
                className={`${styles.mapTypeCard} ${activeTab === 'china-rail' ? styles.mapTypeCardActive : ''}`}
                onClick={() => {
                  setActiveTab('china-rail');
                  setDetailOpen(false);
                }}
              >
                <span className={styles.mapTypeCardName}>中国铁路地图</span>
                <span className={styles.mapTypeCardDesc}>铁路专题视图入口，后续可接线路、站点和专题筛选。</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function attachSavedState(poi: SearchResult, favorites: Set<number>, footprints: Set<number>) {
  return {
    ...poi,
    favorited: poi.poiId ? favorites.has(poi.poiId) : false,
    visited: poi.poiId ? footprints.has(poi.poiId) : false,
  };
}

function samePoi(a: SearchResult | null | undefined, b: SearchResult | null | undefined) {
  if (!a || !b) return false;
  return (a.amapPoiId && b.amapPoiId && a.amapPoiId === b.amapPoiId) || (a.name === b.name && a.lng === b.lng && a.lat === b.lat);
}

// ─── 中国铁路右侧面板 ────────────────────────────────────
function RailPanel({
  stations,
  query,
  onQueryChange,
}: {
  stations: RailStation[];
  query: string;
  onQueryChange: (v: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return stations
      .filter((s) => s.name && (s.name.toLowerCase().includes(q) || (s['name:en'] || '').toLowerCase().includes(q)))
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
        filtered.map((s, i) => (
          <article key={`${s.name}-${s.lng}-${s.lat}-${i}`} className={styles.poiCard}>
            <div className={styles.poiTop}>
              <div>
                <h3 className={styles.poiTitle}>{s.name}</h3>
                {s['name:en'] ? (
                  <p className={styles.poiAddress}>{s['name:en']}</p>
                ) : null}
              </div>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
