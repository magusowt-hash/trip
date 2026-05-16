'use client';

import { useEffect, useRef } from 'react';

type RailRoute = { p: [number, number][]; c: string; w: number; t: string };
type RailStation = { name: string; lng: number; lat: number };

interface Props {
  routes: RailRoute[];
  stations: RailStation[];
  zoom?: number;
}

export default function LeafletRailMap({ routes, stations, zoom = 5 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (document.getElementById('leaflet-css')) {
      initMap();
      return;
    }
    const css = document.createElement('link');
    css.id = 'leaflet-css';
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = initMap;
    document.head.appendChild(s);
  }, []);

  const initMap = () => {
    const L = (window as any).L;
    if (!L || !containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [35, 105], zoom, zoomControl: true, attributionControl: false,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    mapRef.current = map;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:1000;';
    map.getContainer().appendChild(canvas);

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const size = map.getSize();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = size.x * dpr;
      canvas.height = size.y * dpr;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const z = map.getZoom();
      let filtered = routes;
      if (z < 6) filtered = routes.filter((r) => r.p.length >= 5);
      else if (z < 8) filtered = routes.filter((r) => r.p.length >= 3);

      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();

      for (const r of filtered) {
        if (r.p.length < 2) continue;
        const f = r.p[0], l = r.p[r.p.length - 1];
        if ((f[0] < sw.lng - 0.5 || f[0] > ne.lng + 0.5 || f[1] < sw.lat - 0.5 || f[1] > ne.lat + 0.5) &&
            (l[0] < sw.lng - 0.5 || l[0] > ne.lng + 0.5 || l[1] < sw.lat - 0.5 || l[1] > ne.lat + 0.5)) continue;

        ctx.beginPath();
        ctx.strokeStyle = r.c;
        ctx.lineWidth = Math.max(0.5, r.w * 0.5);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        const fp = map.latLngToContainerPoint([f[1], f[0]]);
        ctx.moveTo(fp.x, fp.y);
        for (let i = 1; i < r.p.length; i++) {
          const pt = map.latLngToContainerPoint([r.p[i][1], r.p[i][0]]);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      }

      if (stations && z >= 7) {
        ctx.font = z >= 10 ? '11px sans-serif' : '9px sans-serif';
        ctx.fillStyle = '#1f2937';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const drawn = new Set<string>();
        for (const st of stations) {
          if (!st.name) continue;
          if (st.lng < sw.lng - 0.5 || st.lng > ne.lng + 0.5 || st.lat < sw.lat - 0.5 || st.lat > ne.lat + 0.5) continue;
          const pt = map.latLngToContainerPoint([st.lat, st.lng]);
          const key = `${Math.round(pt.x/60)},${Math.round(pt.y/60)}`;
          if (drawn.has(key)) continue;
          drawn.add(key);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.strokeText(st.name, pt.x, pt.y - 2);
          ctx.fillText(st.name, pt.x, pt.y - 2);
        }
      }
    };

    map.on('zoomend', draw);
    map.on('moveend', draw);
    draw();
  };

  return <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden' }} />;
}
