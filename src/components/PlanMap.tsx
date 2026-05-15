'use client';

import { useEffect, useRef, useState } from 'react';

export interface MapMarker {
  id?: number;
  position: [number, number];
  title?: string;
  address?: string;
  description?: string;
  type?: string;
  groupColor?: string;
}

export interface PlanMapProps {
  markers?: MapMarker[];
  routes?: any[];
  overlays?: any[];
  focusPosition?: [number, number] | null;
  onMarkerClick?: (marker: MapMarker) => void;
  onMapLoad?: (map: any) => void;
  autoLoadMarkers?: boolean;
  markerColor?: string;
  markerShape?: string;
}

declare global {
  interface Window {
    AMap: any;
    AMapLoader: {
      load: (options: {
        key: string;
        version?: string;
        securityJsCode?: string;
        plugins?: string[];
      }) => Promise<any>;
    };
  }
}

const AMAP_KEY = '64138cb3827187cd053ccbb9eaa18fa2';
const AMAP_SECURITY_CODE = 'efc009ad907da44e5b727c1f890050fc';

export default function PlanMap({
  markers: initialMarkers = [],
  routes = [],
  overlays = [],
  focusPosition = null,
  onMarkerClick,
  onMapLoad,
  autoLoadMarkers = false,
  markerColor = '#ef4444',
  markerShape = 'pin',
}: PlanMapProps) {
const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [dbMarkers, setDbMarkers] = useState<any[]>([]);
  const markers = [...initialMarkers, ...dbMarkers];

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initMap = () => {
      if (!mapRef.current || mapInstanceRef.current) return;

      const checkSize = () => {
        if (mapRef.current && mapRef.current.offsetWidth > 0 && mapRef.current.offsetHeight > 0) {
          if (window.AMap) {
            const map = new window.AMap.Map(mapRef.current, {
              zoom: 10,
              center: [116.397428, 39.90923],
              mapStyle: 'amap://styles/normal',
              viewMode: '2D',
              resizeEnable: true,
            });
            mapInstanceRef.current = map;

            window.AMap.plugin(['AMap.Geolocation', 'AMap.Scale'], function () {
              const scale = new window.AMap.Scale({
                position: 'LB',
              });
              map.addControl(scale);

              const geolocation = new window.AMap.Geolocation({
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0,
                convert: true,
                showButton: true,
                buttonPosition: 'LB',
                showMarker: true,
                showCircle: true,
                panToLocation: true,
                zoomToAccuracy: true,
              });
              map.addControl(geolocation);
            });

            setLoaded(true);
            onMapLoad?.(map);
          } else {
            setTimeout(checkSize, 100);
          }
        } else {
          setTimeout(checkSize, 100);
        }
      };

      checkSize();
    };

    const loadMap = async () => {
      if (window.AMap) {
        initMap();
        return;
      }

      if (window.AMapLoader) {
        try {
          const AMap = await window.AMapLoader.load({
            key: AMAP_KEY,
            version: '2.0',
            securityJsCode: AMAP_SECURITY_CODE,
            plugins: ['AMap.Geolocation', 'AMap.Scale'],
          });
          window.AMap = AMap;
          initMap();
        } catch (e) {
          console.error('AMapLoader error:', e);
        }
        return;
      }

      const existingLoader = document.querySelector('script[src*="webapi.amap.com/loader"]');
      if (existingLoader) {
        existingLoader.addEventListener('load', () => {
          if (window.AMapLoader) {
            window.AMapLoader.load({ key: AMAP_KEY, version: '2.0', securityJsCode: AMAP_SECURITY_CODE, plugins: ['AMap.Geolocation', 'AMap.Scale'] })
              .then((AMap: any) => {
                window.AMap = AMap;
                initMap();
              })
              .catch((e: any) => console.error(e));
          }
        });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://webapi.amap.com/loader.js';
      script.async = true;
      script.onerror = () => {
        console.error('Failed to load AMap loader');
      };
      script.onload = () => {
        if (window.AMapLoader) {
          window.AMapLoader.load({ key: AMAP_KEY, version: '2.0', securityJsCode: AMAP_SECURITY_CODE, plugins: ['AMap.Geolocation', 'AMap.Scale'] })
            .then((AMap: any) => {
              window.AMap = AMap;
              initMap();
            })
            .catch((e: any) => console.error(e));
        }
      };
      document.head.appendChild(script);
    };

    loadMap();
  }, [onMapLoad]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !loaded) return;

    map.clearMap();

    let infoWindow: any = null;

    markers.forEach((marker) => {
      const color = marker.groupColor || markerColor;
      let markerContent: string;
      let offset: [number, number];

      switch (markerShape) {
        case 'dot':
          markerContent = `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`;
          offset = [-7, -7];
          break;
        case 'diamond':
          markerContent = `<div style="width:0;height:0;border:8px solid transparent;border-bottom:12px solid ${color};position:relative;top:-6px;"><div style="position:absolute;top:10px;left:-6px;width:12px;height:6px;background:${color};border-radius:50%;opacity:0.3;"></div></div>`;
          offset = [-8, -20];
          break;
        case 'pin':
        default:
          markerContent = `<div style="position:relative;width:25px;height:34px;"><svg width="25" height="34" viewBox="0 0 25 34" xmlns="http://www.w3.org/2000/svg"><path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 34 12.5 34S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="${color}" stroke="#fff" stroke-width="1.5"/><circle cx="12.5" cy="12" r="4" fill="#fff" opacity="0.9"/></svg></div>`;
          offset = [-13, -34];
      }

      const amapMarker = new window.AMap.Marker({
        position: new window.AMap.LngLat(marker.position[0], marker.position[1]),
        content: markerContent,
        offset: new window.AMap.Pixel(offset[0], offset[1]),
        title: marker.title || '',
      });

      amapMarker.on('click', () => {
        if (infoWindow) {
          infoWindow.close();
        }
        const content = `
          <div class="marker-info-window">
            <h3>${marker.title}</h3>
            ${marker.address ? `<p class="address">${marker.address}</p>` : ''}
            ${marker.description ? `<p class="desc">${marker.description}</p>` : ''}
            <button class="detail-btn" data-id="${marker.id}">查看详情</button>
          </div>
        `;
        infoWindow = new window.AMap.InfoWindow({
          content,
          offset: new window.AMap.Pixel(0, -32),
        });
        infoWindow.open(map, amapMarker.getPosition());
      });

      if (onMarkerClick) {
        amapMarker.on('click', () => onMarkerClick(marker));
      }

      map.add(amapMarker);
    });

    if (markers.length > 1) {
      map.setFitView();
    }
  }, [markers, loaded, onMarkerClick, dbMarkers, markerColor, markerShape]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !loaded) return;

    const routesLayer = map.getAllOverlays('polyline');
    routesLayer.forEach((p: any) => map.remove(p));

    routes.forEach((route) => {
      const path = route.path.map(
        (pos: [number, number]) => new window.AMap.LngLat(pos[0], pos[1])
      );
      const polyline = new window.AMap.Polyline({
        path,
        strokeColor: route.color || '#3b82f6',
        strokeWeight: route.width || 4,
      });
      map.add(polyline);
    });
  }, [routes, loaded]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !loaded || !focusPosition) return;
    map.setZoomAndCenter(8, focusPosition, false);
  }, [focusPosition, loaded]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !loaded) return;

    overlays.forEach((overlay) => {
      if (overlay.type === 'circle') {
        const circle = new window.AMap.Circle({
          center: new window.AMap.LngLat(overlay.center[0], overlay.center[1]),
          radius: overlay.radius,
          fillColor: overlay.fillColor || '#3b82f6',
          fillOpacity: overlay.fillOpacity || 0.3,
          strokeColor: overlay.strokeColor || '#3b82f6',
          strokeWeight: 2,
        });
        map.add(circle);
      }
    });
  }, [overlays, loaded]);

  return (
    <>
      <div
        ref={mapRef}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      />
      <style>{`
        .custom-marker {
          position: relative;
          width: 25px;
          height: 34px;
          cursor: pointer;
        }
        .custom-marker img {
          width: 100%;
          height: 100%;
        }
        .marker-info-window {
          padding: 12px;
          max-width: 280px;
        }
        .marker-info-window h3 {
          margin: 0 0 8px;
          font-size: 16px;
          font-weight: 600;
        }
        .marker-info-window .address {
          margin: 0 0 4px;
          font-size: 12px;
          color: #666;
        }
        .marker-info-window .desc {
          margin: 0 0 8px;
          font-size: 13px;
          color: #333;
        }
        .marker-info-window .detail-btn {
          padding: 6px 16px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
        }
        .marker-info-window .detail-btn:hover {
          background: #2563eb;
        }
        .amap-info-content {
          padding: 12px;
        }
      `}</style>
    </>
  );
}