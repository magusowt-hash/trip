'use client';

import { useEffect, useRef, useState } from 'react';

export interface MapMarker {
  position: [number, number];
  title?: string;
}

export interface PlanMapProps {
  markers?: MapMarker[];
  routes?: any[];
  overlays?: any[];
  onMarkerClick?: (marker: MapMarker) => void;
  onMapLoad?: (map: any) => void;
}

declare global {
  interface Window {
    AMap: any;
    AMapUI: any;
  }
}

const AMAP_KEY = '0733c564f9c057d7c34d61bf35655e2a';

export default function PlanMap({
  markers = [],
  routes = [],
  overlays = [],
  onMarkerClick,
  onMapLoad,
}: PlanMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadMap = async () => {
      if (window.AMap) {
        initMap();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`;
      script.async = true;
      script.onload = () => {
        initMap();
      };
      document.head.appendChild(script);
    };

    const initMap = () => {
      if (!mapRef.current || mapInstanceRef.current) return;

      const map = new window.AMap.Map(mapRef.current, {
        zoom: 10,
        center: [116.397428, 39.90923],
        mapStyle: 'amap://styles/normal',
        viewMode: '2D',
      });

      mapInstanceRef.current = map;

      map.on('complete', () => {
        setLoaded(true);
        onMapLoad?.(map);
      });
    };

    loadMap();
  }, [onMapLoad]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !loaded) return;

    map.clearMap();

    markers.forEach((marker) => {
      const amapMarker = new window.AMap.Marker({
        position: new window.AMap.LngLat(marker.position[0], marker.position[1]),
        title: marker.title || '',
      });

      if (onMarkerClick) {
        amapMarker.on('click', () => onMarkerClick(marker));
      }

      map.add(amapMarker);
    });

    if (markers.length > 1) {
      map.setFitView();
    }
  }, [markers, loaded, onMarkerClick]);

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
    <div
      ref={mapRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '360px',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    />
  );
}
