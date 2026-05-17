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

const HUB_CITY_MAP = {
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

      // ─── 站点渲染：空间聚类 + 密度自适应 ──────────────────
      if (stations && !(capitals && zoom < 4)) {
        // 1. 收集当前视野内所有站点并计算像素坐标
        const visible: { st: RailStation; x: number; y: number }[] = [];
        for (const st of stations) {
          if (!st.name) continue;
          if (st.lng < sw.lng - margin || st.lng > ne.lng + margin ||
              st.lat < sw.lat - margin || st.lat > ne.lat + margin) continue;
          const pt = map.lngLatToContainer([st.lng, st.lat]);
           visible.push({ st, x: pt.x, y: pt.y });
        }

        // 2. 像素距离聚类阈值 — zoom 越小阈值越大，合并越激进
        const clusterR = zoom < 6 ? 40 : zoom < 8 ? 28 : zoom < 10 ? 18 : 10;
        const dedupCell = zoom < 6 ? 36 : zoom < 8 ? 24 : zoom < 10 ? 16 : 12;

        // 3. 对 hub 站做空间聚类，相近特等站合并为一个 marker
        const hubs = visible.filter(v => v.st.level === 'hub');
        const hubClusters: { x: number; y: number; name: string; count: number }[] = [];
        const hubUsed = new Set<number>();
        for (let i = 0; i < hubs.length; i++) {
          if (hubUsed.has(i)) continue;
          const group = [i];
          hubUsed.add(i);
          // 以当前站为中心，收集阈值内的同城站
          for (let j = i + 1; j < hubs.length; j++) {
            if (hubUsed.has(j)) continue;
            const dx = hubs[j].x - hubs[i].x;
            const dy = hubs[j].y - hubs[i].y;
            if (Math.sqrt(dx * dx + dy * dy) < clusterR) {
              group.push(j);
              hubUsed.add(j);
            }
          }
          const cx = group.reduce((s, idx) => s + hubs[idx].x, 0) / group.length;
          const cy = group.reduce((s, idx) => s + hubs[idx].y, 0) / group.length;
          const city = HUB_CITY_MAP[hubs[group[0]].st.name] || hubs[group[0]].st.name;
          hubClusters.push({ x: cx, y: cy, name: city, count: group.length });
        }

        // 3b. major 站空间聚类，相近站合并
        const majors = visible.filter(v => v.st.level === 'major');
        const majorClusters: { x: number; y: number; name: string; count: number }[] = [];
        const majorUsed = new Set<number>();
        const majorClusterR = clusterR * 0.7;
        for (let i = 0; i < majors.length; i++) {
          if (majorUsed.has(i)) continue;
          const group = [i];
          majorUsed.add(i);
          for (let j = i + 1; j < majors.length; j++) {
            if (majorUsed.has(j)) continue;
            const dx = majors[j].x - majors[i].x;
            const dy = majors[j].y - majors[i].y;
            if (Math.sqrt(dx * dx + dy * dy) < majorClusterR) {
              group.push(j);
              majorUsed.add(j);
            }
          }
          const cx = group.reduce((s, idx) => s + majors[idx].x, 0) / group.length;
          const cy = group.reduce((s, idx) => s + majors[idx].y, 0) / group.length;
          const name = HUB_CITY_MAP[majors[group[0]].st.name] || majors[group[0]].st.name;
          majorClusters.push({ x: cx, y: cy, name, count: group.length });
        }

        // 4. 绘制 hub 聚类 marker（红底白芯） + major 聚类
        for (const hc of hubClusters) {
          const r = 5;
          ctx.beginPath();
          ctx.arc(hc.x, hc.y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.fillStyle = '#dc2626';
          ctx.arc(hc.x, hc.y, r * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const mc of majorClusters) {
          const r = 4;
          ctx.beginPath();
          ctx.arc(mc.x, mc.y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.fillStyle = '#f59e0b';
          ctx.arc(mc.x, mc.y, r * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }

        // 5. 绘制其余站点 — 自适应网格去重，不再按等级过滤
        const dotDrawn = new Set<string>();
        for (const { st, x, y } of visible) {
          if (st.level === 'hub') continue; // hub 已通过聚类绘制
          if (st.level === 'major') continue; // major 已通过聚类绘制
          let alpha = 1;
          if (st.level === 'local_major') {
            alpha = Math.max(0, Math.min(1, zoom - 7)); // 7→8 淡入
            if (alpha <= 0) continue;
          } else if (st.level === 'local') {
            alpha = Math.max(0, Math.min(1, zoom - 8)); // 8→9 淡入
            if (alpha <= 0) continue;
          }
          const key = `${Math.round(x / dedupCell)},${Math.round(y / dedupCell)}`;
          if (dotDrawn.has(key)) continue;
          dotDrawn.add(key);

          if (alpha < 1) {
            ctx.save();
            ctx.globalAlpha = alpha;
          }
          const r = st.level === 'local_major' ? 2.5 : 2;
          const color = st.level === 'local_major' ? '#10b981' : '#9ca3af';

          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.fillStyle = color;
          ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
          ctx.fill();
          if (alpha < 1) ctx.restore();
        }

        // 6. 站点名称 — hub 聚类显示城市名，其余自适应去重
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const nameDrawn = new Set<string>();

        // hub 聚类名称
        for (const hc of hubClusters) {
          const nk = `${Math.round(hc.x / dedupCell)},${Math.round(hc.y / dedupCell)}`;
          if (nameDrawn.has(nk)) continue;
          nameDrawn.add(nk);
          ctx.font = 'bold 10px sans-serif';
          ctx.fillStyle = '#1f2937';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          const label = hc.count > 1 && zoom >= 10 ? `${hc.name}(${hc.count}站)` : hc.name;
          ctx.strokeText(label, hc.x, hc.y - 7);
          ctx.fillText(label, hc.x, hc.y - 7);
        }

        // major 聚类名称
        for (const mc of majorClusters) {
          const nk = `${Math.round(mc.x / dedupCell)},${Math.round(mc.y / dedupCell)}`;
          if (nameDrawn.has(nk)) continue;
          nameDrawn.add(nk);
          ctx.font = 'bold 10px sans-serif';
          ctx.fillStyle = '#000';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.strokeText(mc.name, mc.x, mc.y - 6);
          ctx.fillText(mc.name, mc.x, mc.y - 6);
        }

        // 其余站点名称
        for (const { st, x, y } of visible) {
          if (st.level === 'hub') continue;
          if (st.level === 'major') continue;
          let alpha = 1;
          if (st.level === 'local_major') {
            alpha = Math.max(0, Math.min(1, zoom - 7));
            if (alpha <= 0) continue;
          } else if (st.level === 'local') {
            alpha = Math.max(0, Math.min(1, zoom - 8));
            if (alpha <= 0) continue;
          }
          const nk = `${Math.round(x / dedupCell)},${Math.round(y / dedupCell)}`;
          if (nameDrawn.has(nk)) continue;
          nameDrawn.add(nk);
          if (alpha < 1) {
            ctx.save();
            ctx.globalAlpha = alpha;
          }
          const r = st.level === 'local_major' ? 2.5 : 2;
          if (st.level === 'local_major') {
            ctx.font = 'bold 10px sans-serif';
            ctx.fillStyle = '#000';
          } else {
            ctx.font = '9px sans-serif';
            ctx.fillStyle = '#6b7280';
          }
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.strokeText(st.name, x, y - r - 4);
          ctx.fillText(st.name, x, y - r - 4);
          if (alpha < 1) ctx.restore();
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