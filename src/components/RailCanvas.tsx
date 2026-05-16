'use client';

import { useEffect, useRef } from 'react';

type RailRoute = { p: [number, number][]; c: string; w: number; t: string };

interface RailCanvasProps {
  mapInstance: any;
  routes: RailRoute[];
  zoom: number;
}

export default function RailCanvas({ mapInstance, routes, zoom }: RailCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const map = mapInstance;
    if (!map) return;

    const container = map.getContainer?.() as HTMLElement;
    if (!container) return;

    // 创建 canvas 并注入到地图容器内
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:10;';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      draw();
    };

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const margin = 0.5;

      // zoom 分层：小 zoom 减少线条密度
      let filtered: RailRoute[];
      if (zoom < 6) {
        filtered = routes.filter((r) => r.p.length >= 5);
      } else if (zoom < 8) {
        filtered = routes.filter((r) => r.p.length >= 3);
      } else {
        filtered = routes;
      }

      for (const route of filtered) {
        const coords = route.p;
        if (coords.length < 2) continue;

        const first = coords[0];
        const last = coords[coords.length - 1];
        if (
          first[0] < sw.lng - margin || first[0] > ne.lng + margin ||
          first[1] < sw.lat - margin || first[1] > ne.lat + margin
        ) {
          if (
            last[0] < sw.lng - margin || last[0] > ne.lng + margin ||
            last[1] < sw.lat - margin || last[1] > ne.lat + margin
          ) {
            continue;
          }
        }

        ctx.beginPath();
        ctx.strokeStyle = route.c;
        ctx.lineWidth = route.w * (zoom < 6 ? 0.8 : 1);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const firstPt = map.lngLatToContainer([first[0], first[1]]);
        ctx.moveTo(firstPt.x, firstPt.y);

        for (let i = 1; i < coords.length; i++) {
          const pt = map.lngLatToContainer([coords[i][0], coords[i][1]]);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      }
    };

    let timer: ReturnType<typeof setTimeout>;
    const scheduleDraw = () => {
      clearTimeout(timer);
      timer = setTimeout(draw, 16);
    };

    resize();
    map.on('zoomend', scheduleDraw);
    map.on('moveend', scheduleDraw);
    window.addEventListener('resize', resize);

    return () => {
      clearTimeout(timer);
      map.off('zoomend', scheduleDraw);
      map.off('moveend', scheduleDraw);
      window.removeEventListener('resize', resize);
      if (canvasRef.current && canvasRef.current.parentElement) {
        canvasRef.current.parentElement.removeChild(canvasRef.current);
        canvasRef.current = null;
      }
    };
  }, [mapInstance, routes, zoom]);

  return null;
}
