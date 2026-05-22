'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { MapMarker } from '@/components/PlanMap';

export type StandardMapSearchResult = {
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
type SavedFootprint = {
  poiId: number;
  amapPoiId?: string | null;
  name?: string | null;
  lng?: string | null;
  lat?: string | null;
};

type Styles = Record<string, string>;

type StandardMapRightPanelProps = {
  styles: Styles;
  query: string;
  searching: boolean;
  searchError: string | null;
  results: StandardMapSearchResult[];
  selectedPoi: StandardMapSearchResult | null;
  favorites: Set<number>;
  footprints: Set<number>;
  savingKey: string | null;
  setQuery: (value: string) => void;
  onSearch: (event?: FormEvent) => void;
  onResultClick: (poi: StandardMapSearchResult) => void;
  onFavorite: (poi: StandardMapSearchResult) => void;
  onFootprint: (poi: StandardMapSearchResult) => void;
};

export function StandardMapRightPanel({
  styles,
  query,
  searching,
  searchError,
  results,
  selectedPoi,
  favorites,
  footprints,
  savingKey,
  setQuery,
  onSearch,
  onResultClick,
  onFavorite,
  onFootprint,
}: StandardMapRightPanelProps) {
  return (
    <>
      <form className={styles.searchStack} onSubmit={onSearch}>
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
              onClick={() => onResultClick(poi)}
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
                    if (!favorited) onFavorite(poi);
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
                    if (!visited) onFootprint(poi);
                  }}
                  disabled={visited || savingKey === `footprint:${poi.amapPoiId || poi.name}:${poi.lng}:${poi.lat}`}
                >
                  已去
                </button>
              </div>
            </article>
          );
        })
      )}
    </>
  );
}

export function useStandardMapPanelController(active: boolean) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<StandardMapSearchResult[]>([]);
  const [selectedPoi, setSelectedPoi] = useState<StandardMapSearchResult | null>(null);
  const [mapSelectedPoi, setMapSelectedPoi] = useState<StandardMapSearchResult | null>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [footprints, setFootprints] = useState<Set<number>>(new Set());
  const [savedFootprints, setSavedFootprints] = useState<SavedFootprint[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;

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
          const nextSaved = (data.footprints || []) as SavedFootprint[];
          setSavedFootprints(nextSaved);
          setFootprints(new Set(nextSaved.map((item) => item.poiId)));
        }
      })
      .catch(() => {});
  }, [active]);

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

      const nextResults = ((data.results || []) as StandardMapSearchResult[])
        .slice(0, 8)
        .map((item) => {
          const matched = savedFootprints.find((saved) => samePoi(item, saved));
          return matched ? { ...item, poiId: matched.poiId } : item;
        });
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

  async function savePoi(mode: 'favorite' | 'footprint', poi: StandardMapSearchResult) {
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
        alert(data.error || (mode === 'favorite' ? '收藏失败' : '设置已去失败'));
        return;
      }

      const poiId = data.poi?.id;
      if (!poiId) return;

      if (mode === 'favorite') {
        setFavorites((prev) => new Set(prev).add(poiId));
      } else {
        setFootprints((prev) => new Set(prev).add(poiId));
        setSavedFootprints((prev) => {
          if (prev.some((item) => item.poiId === poiId)) return prev;
          return [...prev, {
            poiId,
            amapPoiId: poi.amapPoiId,
            name: poi.name,
            lng: poi.lng,
            lat: poi.lat,
          }];
        });
      }

      const updater = (item: StandardMapSearchResult) => (samePoi(item, poi) ? { ...item, poiId } : item);
      setResults((prev) => prev.map(updater));
      setSelectedPoi((prev) => (prev && samePoi(prev, poi) ? { ...prev, poiId } : prev));
      setMapSelectedPoi((prev) => (prev && samePoi(prev, poi) ? { ...prev, poiId } : prev));
    } catch {
      alert(mode === 'favorite' ? '收藏失败' : '设置已去失败');
    } finally {
      setSavingKey(null);
    }
  }

  function handleResultClick(poi: StandardMapSearchResult) {
    setSelectedPoi(poi);
    setMapSelectedPoi(null);
  }

  function handleMapPoiSelect(poi: StandardMapSearchResult) {
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

  return {
    query,
    setQuery,
    searching,
    searchError,
    results,
    selectedPoi,
    favorites,
    footprints,
    savingKey,
    markers,
    focusPosition,
    mapPopupPoi: mapSelectedPoi ? attachSavedState(mapSelectedPoi, favorites, footprints) : null,
    handleSearch,
    handleResultClick,
    handleMapPoiSelect,
    handleMapMarkerClick,
    handleMapPoiFavorite: (poi: StandardMapSearchResult) => void savePoi('favorite', poi),
    handleMapPoiFootprint: (poi: StandardMapSearchResult) => void savePoi('footprint', poi),
  };
}

function attachSavedState(poi: StandardMapSearchResult, favorites: Set<number>, footprints: Set<number>) {
  return {
    ...poi,
    favorited: poi.poiId ? favorites.has(poi.poiId) : false,
    visited: poi.poiId ? footprints.has(poi.poiId) : false,
  };
}

function samePoi(
  a: Pick<StandardMapSearchResult, 'amapPoiId' | 'name' | 'lng' | 'lat'> | null | undefined,
  b: Pick<StandardMapSearchResult, 'amapPoiId' | 'name' | 'lng' | 'lat'> | SavedFootprint | null | undefined,
) {
  if (!a || !b) return false;
  return (a.amapPoiId && b.amapPoiId && a.amapPoiId === b.amapPoiId) || (a.name === b.name && a.lng === b.lng && a.lat === b.lat);
}
