'use client';

import { useEffect, useRef } from 'react';

type RailRoute = { p: [number, number][]; c: string; w: number; t: string };

type RailStation = { name: string; lng: number; lat: number; level: string };
type CapitalLabel = { name: string; lng: number; lat: number };

interface RailSettings {
  // 渐显门槛
  majorShowZoom?: string;
  majorFadeStart?: string;
  localMajorShowZoom?: string;
  localMajorFadeStart?: string;
  localShowZoom?: string;
  localFadeStart?: string;
  mtShowZoom?: string;
  mtFadeStart?: string;
  // 线路过滤
  routeMinPointsZ1?: number;
  routeMinPointsZ2?: number;
  lineWidthScale?: string;
  // 聚类 (6档)
  clusterRZ1?: number; clusterRZ2?: number; clusterRZ3?: number;
  clusterRZ4?: number; clusterRZ5?: number; clusterRZ6?: number;
  majorClusterRatio?: string;
  // 去重 (6档)
  dedupZ1?: number; dedupZ2?: number; dedupZ3?: number;
  dedupZ4?: number; dedupZ5?: number; dedupZ6?: number;
  // 圆点
  hubRadius?: number; majorRadius?: number;
  localMajorRadius?: string; localRadius?: string; mtRadius?: string;
  dotScalePerZoom?: string;
  // 颜色
  hubColor?: string; majorColor?: string;
  localMajorColor?: string; localColor?: string; mtColor?: string;
}

interface StationOverride {
  stationName: string;
  displayName?: string | null;
  levelOverride?: string | null;
  displayLevel?: string | null;
}

interface RailCanvasProps {
  mapInstance: any;
  routes: RailRoute[];
  stations?: RailStation[];
  capitals?: CapitalLabel[];
  zoom: number;
  settings?: RailSettings | null;
  overrides?: StationOverride[] | null;
}

export default function RailCanvas({ mapInstance, routes, stations, capitals, zoom, settings, overrides }: RailCanvasProps) {
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

const HUB_CITY_MAP: Record<string, string> = {
  // 北京枢纽
  '北京':'北京','北京东':'北京','北京丰台':'北京','北京北':'北京','北京南':'北京',
  '北京大兴':'北京','北京朝阳':'北京','北京西':'北京','北京通州':'北京',
  '丰台':'北京','丰台西':'北京',
  // 上海枢纽
  '上海':'上海','上海虹桥':'上海','上海南':'上海','上海西':'上海','上海松江':'上海',
  // 广州枢纽
  '广州':'广州','广州东':'广州','广州北':'广州','广州南':'广州',
  '广州大学城':'广州','广州新塘':'广州','广州白云':'广州',
  '广州莲花山':'广州','广州长隆':'广州',
  // 深圳枢纽
  '深圳':'深圳','深圳东':'深圳','深圳北':'深圳','深圳机场':'深圳',
  '深圳坪山':'深圳','深圳机场北':'深圳',
  // 成都枢纽
  '成都':'成都','成都东':'成都','成都南':'成都','成都西':'成都',
  // 重庆枢纽
  '重庆':'重庆','重庆东':'重庆','重庆北':'重庆','重庆南':'重庆','重庆西':'重庆',
  // 武汉枢纽
  '武汉':'武汉','武汉东':'武汉','汉口':'武汉','武昌':'武汉',
  // 杭州枢纽
  '杭州':'杭州','杭州东':'杭州','杭州南':'杭州','杭州西':'杭州',
  // 西安枢纽
  '西安':'西安','西安北':'西安','西安西':'西安',
  // 郑州枢纽
  '郑州':'郑州','郑州东':'郑州','郑州航空港':'郑州','郑州西':'郑州','圃田西':'郑州',
  // 南京枢纽
  '南京':'南京','南京南':'南京',
  // 天津枢纽
  '天津':'天津','天津北':'天津','天津南':'天津','天津西':'天津','南仓':'天津',
  // 长沙枢纽
  '长沙':'长沙','长沙南':'长沙','长沙西':'长沙',
  // 福州枢纽
  '福州':'福州','福州南':'福州',
  // 合肥枢纽
  '合肥':'合肥','合肥北城':'合肥','合肥南':'合肥','合肥西':'合肥',
  // 南昌枢纽
  '南昌':'南昌','南昌东':'南昌','南昌南':'南昌','南昌西':'南昌',
  // 沈阳枢纽
  '沈阳':'沈阳','沈阳东':'沈阳','沈阳北':'沈阳','沈阳南':'沈阳','沈阳西':'沈阳',
  '苏家屯':'沈阳','裕国':'沈阳',
  // 大连枢纽
  '大连':'大连','大连北':'大连','大连西':'大连',
  // 昆明枢纽
  '昆明':'昆明','昆明南':'昆明',
  // 贵阳枢纽
  '贵阳':'贵阳','贵阳东':'贵阳','贵阳北':'贵阳',
  // 南宁枢纽
  '南宁':'南宁','南宁东':'南宁','南宁北':'南宁','南宁西':'南宁',
  // 海口枢纽
  '海口':'海口','海口东':'海口',
  // 兰州枢纽
  '兰州':'兰州','兰州东':'兰州','兰州新区':'兰州','兰州西':'兰州',
  // 太原枢纽
  '太原':'太原','太原东':'太原','太原南':'太原',
  // 石家庄枢纽
  '石家庄':'石家庄','石家庄东':'石家庄','石家庄北':'石家庄',
  // 济南枢纽
  '济南':'济南','济南东':'济南','济南西':'济南',
  // 青岛枢纽
  '青岛':'青岛','青岛北':'青岛','青岛机场':'青岛','青岛西':'青岛',
  // 哈尔滨枢纽
  '哈尔滨':'哈尔滨','哈尔滨东':'哈尔滨','哈尔滨北':'哈尔滨','哈尔滨西':'哈尔滨',
  // 长春枢纽
  '长春':'长春','长春南':'长春','长春西':'长春',
  // 其他枢纽城市
  '厦门北':'厦门','大同':'大同','柳州':'柳州','徐州':'徐州','苏州':'苏州',
  '株洲':'株洲','衡阳':'衡阳','襄阳':'襄阳','山海关':'山海关',
  '齐齐哈尔':'齐齐哈尔','牡丹江':'牡丹江','佳木斯':'佳木斯',
  '呼和浩特':'呼和浩特','呼和浩特东':'呼和浩特',
  '乌鲁木齐':'乌鲁木齐','乌鲁木齐南':'乌鲁木齐',
  '拉萨':'拉萨','西宁':'西宁','银川':'银川',
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

      const s = settings;

      // zoom 分层：小 zoom 减少线条密度（可配置）
      const minPtsZ1 = s?.routeMinPointsZ1 ?? 5;
      const minPtsZ2 = s?.routeMinPointsZ2 ?? 3;
      let filtered: RailRoute[];
      if (zoom < 6) {
        filtered = routes.filter((r) => r.p.length >= minPtsZ1);
      } else if (zoom < 8) {
        filtered = routes.filter((r) => r.p.length >= minPtsZ2);
      } else {
        filtered = routes;
      }

      // 线宽随 zoom 缩放：zoom 越大线越细
      const lwScale = parseFloat(s?.lineWidthScale ?? '0.8');
      const lwByZoom = zoom < 6 ? 1.2 : zoom < 10 ? 1.0 : 0.8;

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
        ctx.lineWidth = Math.max(0.3, route.w * lwScale * lwByZoom);
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
        // 0. 构建覆盖映射表
        const overrideMap = new Map<string, StationOverride>();
        if (overrides) {
          for (const o of overrides) overrideMap.set(o.stationName, o);
        }

        // 1. 收集当前视野内所有站点并计算像素坐标，应用 overrides
        const visible: { st: RailStation; x: number; y: number; displayLevel: string }[] = [];
        for (const st of stations) {
          if (!st.name) continue;
          
          const ov = overrideMap.get(st.name);
          if (ov?.levelOverride === 'deleted') continue;
          
          const effective: RailStation = {
            name: ov?.displayName || st.name,
            lng: st.lng,
            lat: st.lat,
            level: ov?.levelOverride || st.level,
          };
          const displayLevel = ov?.displayLevel || effective.level;

          if (st.lng < sw.lng - margin || st.lng > ne.lng + margin ||
              st.lat < sw.lat - margin || st.lat > ne.lat + margin) continue;
          const pt = map.lngLatToContainer([st.lng, st.lat]);
          visible.push({ st: effective, x: pt.x, y: pt.y, displayLevel });
        }

        // 2. 聚类/去重阈值 — 6档线性插值，消除跳变
        const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
        const zVals = [s?.clusterRZ1 ?? 44, s?.clusterRZ2 ?? 32, s?.clusterRZ3 ?? 22, s?.clusterRZ4 ?? 14, s?.clusterRZ5 ?? 8, s?.clusterRZ6 ?? 4];
        const dVals = [s?.dedupZ1 ?? 40, s?.dedupZ2 ?? 28, s?.dedupZ3 ?? 20, s?.dedupZ4 ?? 14, s?.dedupZ5 ?? 10, s?.dedupZ6 ?? 6];
        const breaks = [5, 7, 9, 11, 13]; // 分界点
        let clusterR: number, dedupCell: number;
        if (zoom < breaks[0])      { clusterR = lerp(zVals[0], zVals[1], (zoom - (breaks[0]-1)) / 1); dedupCell = lerp(dVals[0], dVals[1], (zoom - (breaks[0]-1)) / 1); }
        else if (zoom < breaks[1]) { clusterR = lerp(zVals[1], zVals[2], (zoom - breaks[0]) / 2); dedupCell = lerp(dVals[1], dVals[2], (zoom - breaks[0]) / 2); }
        else if (zoom < breaks[2]) { clusterR = lerp(zVals[2], zVals[3], (zoom - breaks[1]) / 2); dedupCell = lerp(dVals[2], dVals[3], (zoom - breaks[1]) / 2); }
        else if (zoom < breaks[3]) { clusterR = lerp(zVals[3], zVals[4], (zoom - breaks[2]) / 2); dedupCell = lerp(dVals[3], dVals[4], (zoom - breaks[2]) / 2); }
        else if (zoom < breaks[4]) { clusterR = lerp(zVals[4], zVals[5], (zoom - breaks[3]) / 2); dedupCell = lerp(dVals[4], dVals[5], (zoom - breaks[3]) / 2); }
        else                       { clusterR = zVals[5]; dedupCell = dVals[5]; }

        // 圆点大小随 zoom 缩放
        const dspz = parseFloat(s?.dotScalePerZoom ?? '0.06');
        const dotScale = 1 + (zoom - 5) * dspz;

        // 3. 对 hub 站做空间聚类，相近特等站合并为一个 marker
        const hubs = visible.filter(v => v.st.level === 'CH');
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
        const majors = visible.filter(v => v.st.level === 'RK');
        const majorClusters: { x: number; y: number; name: string; count: number }[] = [];
        const majorUsed = new Set<number>();
        const majorClusterR = clusterR * (s?.majorClusterRatio ? parseFloat(s.majorClusterRatio) : 0.7);
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

        // 4. 绘制 hub 聚类 marker + major 聚类（半径随 zoom 缩放）
        const hubR = (s?.hubRadius ?? 5) * dotScale;
        const hubCol = s?.hubColor ?? '#dc2626';
        for (const hc of hubClusters) {
          ctx.beginPath();
          ctx.arc(hc.x, hc.y, hubR, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.fillStyle = hubCol;
          ctx.arc(hc.x, hc.y, hubR * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
        const majorR = (s?.majorRadius ?? 4) * dotScale;
        const majorCol = s?.majorColor ?? '#f59e0b';
        for (const mc of majorClusters) {
          ctx.beginPath();
          ctx.arc(mc.x, mc.y, majorR, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.fillStyle = majorCol;
          ctx.arc(mc.x, mc.y, majorR * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }

        // 5. 绘制其余站点 — 自适应网格去重，支持 RK/GI/AS/MT 渐显
        const dotDrawn = new Set<string>();
        const mjShowZ = parseFloat(s?.majorShowZoom ?? '5');
        const mjFadeS = parseFloat(s?.majorFadeStart ?? '4');
        const lmShowZ = parseFloat(s?.localMajorShowZoom ?? '8');
        const lmFadeS = parseFloat(s?.localMajorFadeStart ?? '7');
        const lShowZ  = parseFloat(s?.localShowZoom ?? '9');
        const lFadeS  = parseFloat(s?.localFadeStart ?? '8');
        const mtShowZ = parseFloat(s?.mtShowZoom ?? '11');
        const mtFadeS = parseFloat(s?.mtFadeStart ?? '10');
        const lmR = parseFloat(s?.localMajorRadius ?? '2.5') * dotScale;
        const lR  = parseFloat(s?.localRadius ?? '2') * dotScale;
        const mtR = parseFloat(s?.mtRadius ?? '1.5') * dotScale;
        const lmC = s?.localMajorColor ?? '#10b981';
        const lC  = s?.localColor ?? '#9ca3af';
        const mtC = s?.mtColor ?? '#d1d5db';

        const fadeAlpha = (showZ: number, fadeS: number) => {
          if (fadeS >= showZ) return 1;
          return Math.max(0, Math.min(1, (zoom - fadeS) / (showZ - fadeS)));
        };

        for (const { st, x, y, displayLevel } of visible) {
          if (st.level === 'CH') continue;
          if (st.level === 'RK') continue;
          let alpha = 1, r: number, color: string;
          switch (displayLevel) {
            case 'GI':
              alpha = fadeAlpha(lmShowZ, lmFadeS); r = lmR; color = lmC; break;
            case 'AS':
              alpha = fadeAlpha(lShowZ, lFadeS); r = lR; color = lC; break;
            case 'MT':
              alpha = fadeAlpha(mtShowZ, mtFadeS); r = mtR; color = mtC; break;
            default:
              r = lR; color = lC;
          }
          if (alpha <= 0) continue;
          const key = `${Math.round(x / dedupCell)},${Math.round(y / dedupCell)}`;
          if (dotDrawn.has(key)) continue;
          dotDrawn.add(key);

          if (alpha < 1) {
            ctx.save();
            ctx.globalAlpha = alpha;
          }
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.fillStyle = color;
          ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
          ctx.fill();
          if (alpha < 1) ctx.restore();
        }

        // 6. 站点名称 — hub/major 聚类显示城市名，其余自适应去重
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const nameDrawn = new Set<string>();
        // 字号随 zoom 调整
        const fontByZoom = zoom < 6 ? '8px' : zoom < 10 ? '10px' : '12px';
        const fontSmall = zoom < 6 ? '7px' : zoom < 10 ? '9px' : '11px';

        // major 渐显 alpha（用于聚类标签）
        const mjAlpha = fadeAlpha(mjShowZ, mjFadeS);

        // hub 聚类名称
        for (const hc of hubClusters) {
          const nk = `${Math.round(hc.x / dedupCell)},${Math.round(hc.y / dedupCell)}`;
          if (nameDrawn.has(nk)) continue;
          nameDrawn.add(nk);
          ctx.font = `bold ${fontByZoom} sans-serif`;
          ctx.fillStyle = '#1f2937';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          const label = hc.count > 1 && zoom >= 10 ? `${hc.name}(${hc.count}站)` : hc.name;
          ctx.strokeText(label, hc.x, hc.y - 7);
          ctx.fillText(label, hc.x, hc.y - 7);
        }

        // major 聚类名称（带渐隐）
        for (const mc of majorClusters) {
          const nk = `${Math.round(mc.x / dedupCell)},${Math.round(mc.y / dedupCell)}`;
          if (nameDrawn.has(nk)) continue;
          nameDrawn.add(nk);
          if (mjAlpha < 1) {
            ctx.save();
            ctx.globalAlpha = mjAlpha;
          }
          ctx.font = `bold ${fontByZoom} sans-serif`;
          ctx.fillStyle = '#000';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.strokeText(mc.name, mc.x, mc.y - 6);
          ctx.fillText(mc.name, mc.x, mc.y - 6);
          if (mjAlpha < 1) ctx.restore();
        }

        // 其余站点名称（RK/GI/AS/MT，统一带 alpha）
        for (const { st, x, y, displayLevel } of visible) {
          if (st.level === 'CH') continue;
          if (st.level === 'RK') continue;
          let alpha = 1, r: number;
          switch (displayLevel) {
            case 'GI': alpha = fadeAlpha(lmShowZ, lmFadeS); r = lmR; break;
            case 'AS': alpha = fadeAlpha(lShowZ, lFadeS); r = lR; break;
            case 'MT': alpha = fadeAlpha(mtShowZ, mtFadeS); r = mtR; break;
            default: r = lR;
          }
          if (alpha <= 0) continue;
          const nk = `${Math.round(x / dedupCell)},${Math.round(y / dedupCell)}`;
          if (nameDrawn.has(nk)) continue;
          nameDrawn.add(nk);
          if (alpha < 1) {
            ctx.save();
            ctx.globalAlpha = alpha;
          }
          if (displayLevel === 'GI' || displayLevel === 'RK') {
            ctx.font = `bold ${fontByZoom} sans-serif`;
            ctx.fillStyle = '#000';
          } else {
            ctx.font = `${fontSmall} sans-serif`;
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

    // 初始化
    resize();
    window.addEventListener('resize', resize);
    map.on('moveend', draw);
    map.on('zoomend', draw);
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      map.off('moveend', draw);
      map.off('zoomend', draw);
      if (canvasRef.current && canvasRef.current.parentNode) {
        canvasRef.current.parentNode.removeChild(canvasRef.current);
      }
    };
  }, [mapInstance, routes, stations, capitals, zoom, settings, overrides]);

  return null;
}
