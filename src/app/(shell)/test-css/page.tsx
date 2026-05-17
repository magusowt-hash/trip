'use client';

import { useEffect, useRef, useState } from 'react';
import PlanMap from '@/components/PlanMap';
import RailCanvas from '@/components/RailCanvas';

const MAP_STYLE = 'amap://styles/080d656368975ea57344000114d78388';

type RailRoute = { p: [number, number][]; c: string; w: number; t: string };

export default function TestRailPage() {
  const [routes, setRoutes] = useState<RailRoute[]>([]);
  const [zoom, setZoom] = useState(4);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    fetch('/data/railways.json')
      .then((r) => r.json())
      .then(setRoutes)
      .catch(console.error);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <PlanMap
        mapStyle={MAP_STYLE}
        autoLoadMarkers={false}
        onMapLoad={(m: any) => {
          mapRef.current = m;
          setZoom(m.getZoom());
          m.on('zoomend', () => setZoom(m.getZoom()));
        }}
      />
      {mapRef.current && (
        <RailCanvas mapInstance={mapRef.current} routes={routes} zoom={zoom} />
      )}
    </div>
  );
}
