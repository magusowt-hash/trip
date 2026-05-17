'use client';

import { useEffect, useRef } from 'react';

type RailRoute = { p: [number, number][]; c: string; w: number; t: string };

type RailStation = { name: string; lng: number; lat: number; level: string };
type CapitalLabel = { name: string; lng: number; lat: number };

interface RailCanvasProps {
  mapInstance: any;
  routes: RailRoute[];
  stations?: RailStation[];
  capitals?: CapitalLabel[];
  zoom: number;
}

export default function RailCanvas({ mapInstance, routes, stations, capitals, zoom }: RailCanvasProps) {
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

const HUB_CITY_MAP: {[key: string]: string} = {
  '北京':'北京','北京西':'北京','北京南':'北京','北京北':'北京','北京朝阳':'北京','北京丰台':'北京','丰台':'北京','丰台西':'北京',
  '上海':'上海','上海虹桥':'上海','上海南':'上海',
  '广州':'广州','广州南':'广州','深圳北':'深圳',
  '郑州':'郑州','郑州东':'郑州','郑州北':'郑州','圃田西':'郑州',
  '武汉':'武汉','汉口':'武汉','武昌':'武汉',
  '成都':'成都','成都东':'成都','重庆西':'重庆','重庆北':'重庆',
  '西安':'西安','西安北':'西安',
  '沈阳':'沈阳','沈阳北':'沈阳','苏家屯':'沈阳','裕国':'沈阳',
  '哈尔滨':'哈尔滨','哈尔滨西':'哈尔滨',
  '济南':'济南','济南西':'济南','兰州':'兰州','兰州西':'兰州',
  '太原':'太原','南昌':'南昌','福州':'福州','南宁':'南宁','呼和浩特':'呼和浩特',
  '昆明南':'昆明','杭州东':'杭州','南京南':'南京','合肥南':'合肥','长沙南':'长沙',
  '贵阳':'贵阳','石家庄':'石家庄','天津':'天津','青岛':'青岛','乌鲁木齐':'乌鲁木齐',
  '长春':'长春','齐齐哈尔':'齐齐哈尔','牡丹江':'牡丹江','佳木斯':'佳木斯',
  '大同':'大同','厦门北':'厦门','柳州':'柳州','徐州':'徐州','苏州':'苏州',
  '株洲':'株洲','衡阳':'衡阳','襄阳':'襄阳','山海关':'山海关','南仓':'天津',
  '广元':'广元','广元西':'广元','广元南':'广元',
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
        ctx.lineWidth = Math.max(0.5, route.w * 0.8);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';

        const firstPt = map.lngLatToContainer([first[0], first[1]]);
        ctx.moveTo(firstPt.x, firstPt.y);

        for (let i = 1; i < coords.length; i++) {
          const pt = map.lngLatToContainer([coords[i][0], coords[i][1]]);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      }

      // 站点圆点 — 按 zoom 分层（省会显示时跳过）
      if (stations && !(capitals && zoom < 4)) {
        const dotDrawn = new Set<string>();
        for (const st of stations) {
          if (!st.name) continue;
          if (zoom < 6 && st.level !== 'hub') continue;
          if (zoom < 8 && st.level === 'major') continue;
          if (zoom < 9 && st.level === 'local_major') continue;
          if (zoom < 10 && st.level === 'local') continue;
          
          if (st.lng < sw.lng - margin || st.lng > ne.lng + margin ||
              st.lat < sw.lat - margin || st.lat > ne.lat + margin) continue;

          const pt = map.lngLatToContainer([st.lng, st.lat]);
          const cell = 20;
          const key = `${Math.round(pt.x/cell)},${Math.round(pt.y/cell)}`;
          if (dotDrawn.has(key)) continue;
          dotDrawn.add(key);

          const r = st.level === 'hub' ? 4 : st.level === 'major' ? 4 : st.level === 'local_major' ? 2.5 : 2;
          const color = st.level === 'hub' ? '#dc2626' : st.level === 'major' ? '#f59e0b' : st.level === 'local_major' ? '#10b981' : '#9ca3af';
          
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.fillStyle = color;
          ctx.arc(pt.x, pt.y, r * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
        
        // 站点名称 — zoom<7 时枢纽站合并显示城市名
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const cityShown = new Set<string>();
        for (const st of stations) {
          if (!st.name) continue;
          if (zoom < 8 && st.level === 'major') continue;
          if (zoom < 9 && st.level === 'local_major') continue;
          if (zoom < 10 && st.level === 'local') continue;
          
          if (st.lng < sw.lng - margin || st.lng > ne.lng + margin ||
              st.lat < sw.lat - margin || st.lat > ne.lat + margin) continue;

          const pt = map.lngLatToContainer([st.lng, st.lat]);
          const r = st.level === 'hub' ? 4 : st.level === 'major' ? 4 : st.level === 'local_major' ? 2.5 : 2;
          
          let displayName = st.name;
          if (st.level === 'hub' && zoom < 7) {
            const city = HUB_CITY_MAP[st.name] || st.name;
            if (cityShown.has(city)) continue;
            cityShown.add(city);
            displayName = city;
          }
          
          ctx.font = st.level === 'hub' ? 'bold 10px sans-serif' : st.level === 'major' ? 'bold 10px sans-serif' : '9px sans-serif';
          ctx.fillStyle = st.level === 'major' ? '#000' : '#1f2937';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.strokeText(displayName, pt.x, pt.y - r - 4);
          ctx.fillText(displayName, pt.x, pt.y - r - 4);
        }
      }

      // 省会定位名称 — 只在 zoom=3 时显示 (zoom<4)
      if (capitals && zoom < 4) {
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        
        for (const cap of capitals) {
          if (cap.lng < sw.lng - 0.5 || cap.lng > ne.lng + 0.5 ||
              cap.lat < sw.lat - 0.5 || cap.lat > ne.lat + 0.5) continue;
          const pt = map.lngLatToContainer([cap.lng, cap.lat]);
          ctx.strokeText(cap.name, pt.x, pt.y);
          ctx.fillText(cap.name, pt.x, pt.y);
        }
      }
    };

    let rafId = 0;
    let lastCenter = '';
    const loop = () => {
      const c = map.getCenter();
      const key = `zoom${map.getZoom()}-${c.lng.toFixed(3)}-${c.lat.toFixed(3)}`;
      if (key !== lastCenter) {
        lastCenter = key;
        draw();
      }
      rafId = requestAnimationFrame(loop);
    };

    resize();
    rafId = requestAnimationFrame(loop);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      if (canvasRef.current && canvasRef.current.parentElement) {
        canvasRef.current.parentElement.removeChild(canvasRef.current);
        canvasRef.current = null;
      }
    };
  }, [mapInstance, routes, stations, capitals, zoom]);

  return null;
}
