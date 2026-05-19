'use client';

import { useEffect, useRef, useState } from 'react';
import PlanMap from '@/components/PlanMap';
import RailCanvas from '@/components/RailCanvas';
import {
  getMapPackage,
  type StandardMapSearchResult,
  useRailMapPanelController,
  useStandardMapPanelController,
} from '@/modules/maps';
import styles from './maps-page.module.css';

type MapTab = 'standard' | 'rail';

type RailRoute = { p: [number, number][]; c: string; w: number; t: string };
type RailStation = { name: string; lng: number; lat: number };

export default function MapsPage() {
  const [activeTab, setActiveTab] = useState<MapTab>('standard');
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
            ) : (
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
                  className={`${styles.tab} ${activeTab === 'rail' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('rail')}
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
                className={`${styles.mapTypeCard} ${activeTab === 'rail' ? styles.mapTypeCardActive : ''}`}
                onClick={() => {
                  setActiveTab('rail');
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
