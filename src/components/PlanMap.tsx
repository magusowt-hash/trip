'use client';

import { useEffect, useRef, useState } from 'react';

export interface MapMarker {
  id?: number;
  position: [number, number];
  title?: string;
  address?: string;
  description?: string;
  type?: string;
}

export interface PlanMapProps {
  markers?: MapMarker[];
  routes?: any[];
  overlays?: any[];
  onMarkerClick?: (marker: MapMarker) => void;
  onMapLoad?: (map: any) => void;
  autoLoadMarkers?: boolean;
}

declare global {
  interface Window {
    AMap: any;
    AMapLoader: {
      load: (options: {
        key: string;
        version?: string;
        securityJsCode?: string;
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
  onMarkerClick,
  onMapLoad,
  autoLoadMarkers = false,
}: PlanMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [dbMarkers, setDbMarkers] = useState<any[]>([]);
  const markers = [...initialMarkers, ...dbMarkers];

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (autoLoadMarkers && loaded) {
      fetch('/api/markers?status=1')
        .then(res => res.json())
        .then(data => {
          if (data.markers) {
            const validMarkers = data.markers
              .filter((m: any) => m.lng && m.lat)
              .map((m: any) => ({
                id: m.id,
                position: [parseFloat(m.lng), parseFloat(m.lat)] as [number, number],
                title: m.name,
                address: m.address,
                description: m.description,
                type: m.type,
              }));
            setDbMarkers(validMarkers);
          }
        })
        .catch(err => console.error('Load markers error:', err));
    }
  }, [autoLoadMarkers, loaded]);

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
const markerContent = `
        <div style="position:relative;width:25px;height:34px;">
          <img src="//a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-red.png" style="width:100%;height:100%;">
        </div>
      `;

      const amapMarker = new window.AMap.Marker({
        position: new window.AMap.LngLat(marker.position[0], marker.position[1]),
        content: markerContent,
        offset: new window.AMap.Pixel(-13, -30),
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
  }, [markers, loaded, onMarkerClick, dbMarkers]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !loaded) return;

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