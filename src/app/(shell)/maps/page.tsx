'use client';

import { useEffect, useRef, useState } from 'react';
import PlanMap from '@/components/PlanMap';
import RailCanvas from '@/components/RailCanvas';
import {
  getMapPackage,
  pickInitialActiveMapSlug,
  useRailMapPanelController,
  type StandardMapSearchResult,
  useStandardMapPanelController,
} from '@/modules/maps';
import styles from './maps-page.module.css';

type RailRoute = { p: [number, number][]; c: string; w: number; t: string };
type RailStation = { name: string; lng: number; lat: number };
type PublicMapPackageItem = {
  slug: string;
  name: string;
  description: string;
  isEnabled: boolean;
  sortOrder: number;
};

export default function MapsPage() {
  const [packageItems, setPackageItems] = useState<PublicMapPackageItem[]>([]);
  const [packageLoading, setPackageLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [railRoutes, setRailRoutes] = useState<RailRoute[]>([]);
  const [railStations, setRailStations] = useState<RailStation[]>([]);
  const [railSettings, setRailSettings] = useState<any>(null);
  const [stationOverrides, setStationOverrides] = useState<any[]>([]);
  const [capitalLabels, setCapitalLabels] = useState<any[]>([]);
  const [railLoaded, setRailLoaded] = useState(false);
  const [railZoom, setRailZoom] = useState(4);
  const railMapRef = useRef<any>(null);
  const standardController = useStandardMapPanelController(activeTab === 'standard');
  const railController = useRailMapPanelController();

  useEffect(() => {
    let active = true;

    fetch('/api/public/maps/packages')
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        const list = Array.isArray(data.list) ? data.list : [];
        setPackageItems(list);
        setActiveTab((current) => {
          if (current && list.some((item: PublicMapPackageItem) => item.slug === current)) {
            return current;
          }
          return pickInitialActiveMapSlug(list);
        });
      })
      .catch(() => {
        if (!active) return;
        setPackageItems([]);
        setActiveTab(null);
      })
      .finally(() => {
        if (active) {
          setPackageLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'rail' || railLoaded) return;
    setRailLoaded(true);
    fetch('/data/railways.json')
      .then((r) => r.json())
      .then(setRailRoutes)
      .catch(console.error);
    fetch('/data/stations.json').then(r => r.json()).then(d => { setRailStations(d.stations); setCapitalLabels(d.capitals) })
      .catch(console.error);
  }, [activeTab, railLoaded]);

  useEffect(() => {
    if (activeTab !== 'rail') return;
    fetch('/api/public/rail-settings').then(r => r.json()).then(d => d.settings && setRailSettings(d.settings))
      .catch(() => {});
    fetch('/api/public/station-overrides').then(r => r.json()).then(setStationOverrides)
      .catch(() => {});
  }, [activeTab]);

  const standardMapPackage = getMapPackage('standard');
  const railMapPackage = getMapPackage('rail');
  const StandardRightPanel = standardMapPackage?.frontend?.rightPanel;
  const RailRightPanel = railMapPackage?.frontend?.rightPanel;
  const activePackage = packageItems.find((item) => item.slug === activeTab) ?? null;

  return (
    <div className={styles.root}>
      <div className={styles.split}>
        <section className={styles.mapCol} aria-label="地图区域">
          <div className={styles.mapFrame}>
            {activeTab === 'standard' ? (
              <PlanMap
                markers={standardController.markers}
                focusPosition={standardController.focusPosition}
                onMarkerClick={standardController.handleMapMarkerClick}
                onMapPoiSelect={(poi) => standardController.handleMapPoiSelect(poi as StandardMapSearchResult)}
                selectedMapPoi={standardController.mapPopupPoi}
                onMapPoiFavorite={(poi) => standardController.handleMapPoiFavorite(poi as StandardMapSearchResult)}
                onMapPoiFootprint={(poi) => standardController.handleMapPoiFootprint(poi as StandardMapSearchResult)}
                autoLoadMarkers={false}
              />
            ) : activeTab === 'rail' ? (
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <PlanMap
                  autoLoadMarkers={false}
                  mapStyle="amap://styles/080d656368975ea57344000114d78388"
                  onMapLoad={(m: any) => {
                    railMapRef.current = m;
                    m.setMapStyle('amap://styles/080d656368975ea57344000114d78388');
                    setRailZoom(m.getZoom());
                    m.on('zoomend', () => setRailZoom(m.getZoom()));
                  }}
                />
                {railMapRef.current && (
                  <RailCanvas
                    mapInstance={railMapRef.current}
                    routes={railRoutes}
                    stations={railStations}
                    capitals={capitalLabels}
                    zoom={railZoom}
                    settings={railSettings}
                    overrides={stationOverrides}
                  />
                )}
              </div>
            ) : (
              <div className={styles.emptyState}>暂无可用地图类型，请先在后台启用地图包。</div>
            )}
          </div>
        </section>

        <aside className={styles.listCol} aria-label="地图结果列表">
          <div className={styles.listPanel}>
            <div className={styles.topRow}>
              <div className={styles.scrollTabs}>
                <div className={styles.tabs}>
                  {packageItems.map((item) => (
                    <button
                      key={item.slug}
                      type="button"
                      className={`${styles.tab} ${activeTab === item.slug ? styles.tabActive : ''}`}
                      onClick={() => setActiveTab(item.slug)}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className={styles.toolButtonDetail}
                onClick={() => setDetailOpen(true)}
                aria-label="查看全部地图种类"
                disabled={packageItems.length === 0}
              >
                &#x22ef;
              </button>
            </div>

            {packageLoading ? <div className={styles.panelState}>加载中</div> : null}
            {activeTab === 'rail' ? (
              RailRightPanel ? (
                <RailRightPanel
                  styles={styles}
                  stations={railStations}
                  query={railController.query}
                  onQueryChange={railController.setQuery}
                />
              ) : null
            ) : (
              StandardRightPanel ? (
                <StandardRightPanel
                  styles={styles}
                  query={standardController.query}
                  searching={standardController.searching}
                  searchError={standardController.searchError}
                  results={standardController.results}
                  selectedPoi={standardController.selectedPoi}
                  favorites={standardController.favorites}
                  footprints={standardController.footprints}
                  savingKey={standardController.savingKey}
                  setQuery={standardController.setQuery}
                  onSearch={standardController.handleSearch}
                  onResultClick={standardController.handleResultClick}
                  onFavorite={standardController.handleMapPoiFavorite}
                  onFootprint={standardController.handleMapPoiFootprint}
                />
              ) : null
            )}
            {!packageLoading && !activePackage ? (
              <div className={styles.panelState}>当前没有可展示的地图列表。</div>
            ) : null}
          </div>
        </aside>
      </div>

      {detailOpen && packageItems.length > 0 ? (
        <div className={styles.detailModalOverlay} onClick={() => setDetailOpen(false)}>
          <div className={styles.detailModalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.detailModalHeader}>
              <h3 className={styles.detailModalTitle}>全部地图种类</h3>
              <button type="button" className={styles.detailModalClose} onClick={() => setDetailOpen(false)}>
                &#x2715;
              </button>
            </div>
            <div className={styles.detailGrid}>
              {packageItems.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  className={`${styles.mapTypeCard} ${activeTab === item.slug ? styles.mapTypeCardActive : ''}`}
                  onClick={() => {
                    setActiveTab(item.slug);
                    setDetailOpen(false);
                  }}
                >
                  <span className={styles.mapTypeCardName}>{item.name}</span>
                  <span className={styles.mapTypeCardDesc}>{item.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
