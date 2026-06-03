'use client';

import { useRef, useEffect, useCallback, useMemo } from 'react';
import type { OuterFrameTransform, Point } from '@/lib/outerFrameCoords';
import type { PhotoItem, PoiPoint } from './OuterFrameCanvas';
import type { LineStyle } from './LegendPanel';
import {
  buildGroupGeometryFromLayout,
  buildGroupGeometry,
  GROUP_ENDPOINT_RADIUS_SCREEN,
  type GroupLayoutSnapshot,
} from './localMapGroupGeometry';

const MAX_OVERLAY_SCALE = 2.4;
const MAX_LINE_WIDTH = 4;
const MAX_ANCHOR_RADIUS = 6;
const MAX_POI_LABEL_FONT = 18;

function getOverlayScale(scale: number) {
  return Math.min(scale, MAX_OVERLAY_SCALE);
}

interface Props {
  width: number;
  height: number;
  transform: OuterFrameTransform;
  photos: PhotoItem[];
  groupLayouts?: GroupLayoutSnapshot[];
  poiPoints: PoiPoint[];
  lineStyle: LineStyle;
  showPoiLabels: boolean;
  poiLabelColor: string;
  renderVersion?: string | number;
}

export default function LineCanvas({ width, height, transform, photos, groupLayouts, poiPoints, lineStyle, showPoiLabels, poiLabelColor, renderVersion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasSizeRef = useRef({ width: 0, height: 0, dpr: 0 });

  const getPhotoLogicalSize = useCallback((photo: PhotoItem) => {
    const sourceWidth = photo.pixelWidth ?? 0;
    const sourceHeight = photo.pixelHeight ?? 0;
    if (sourceWidth > 0 && sourceHeight > 0) {
      if (sourceWidth >= sourceHeight) {
        return {
          width: 120,
          height: Math.max(48, (120 * sourceHeight) / sourceWidth),
        };
      }
      return {
        width: Math.max(48, (120 * sourceWidth) / sourceHeight),
        height: 120,
      };
    }
    return { width: 120, height: 120 };
  }, []);

  const logicalToScreen = useCallback((lx: number, ly: number): Point => ({
    x: lx * transform.scale + width / 2 + transform.tx,
    y: ly * transform.scale + height / 2 + transform.ty,
  }), [transform, width, height]);

  const photosByPlaceKey = useMemo(() => {
    const groups = new Map<string, PhotoItem[]>();
    for (const photo of photos) {
      if (photo.frameX == null || photo.frameY == null) continue;
      const arr = groups.get(photo.placeKey) || [];
      arr.push(photo);
      groups.set(photo.placeKey, arr);
    }
    return groups;
  }, [photos, renderVersion]);

  const resolvedGeometryMap = useMemo(() => {
    const entries: Array<{ id: string; geometry: NonNullable<ReturnType<typeof buildGroupGeometry>> }> = [];
    for (const [placeKey, groupPhotos] of photosByPlaceKey) {
      const geometry = buildGroupGeometryFromLayout(placeKey, groupPhotos, getPhotoLogicalSize, transform.scale, groupLayouts ?? []);
      if (!geometry) continue;
      entries.push({ id: placeKey, geometry });
    }
    return new Map(entries.map((entry) => [entry.id, entry.geometry]));
  }, [photosByPlaceKey, groupLayouts, getPhotoLogicalSize, transform.scale]);

  const getGroupAnchorPoint = useCallback((resolvedGeometryMap: Map<string, NonNullable<ReturnType<typeof buildGroupGeometry>>>, groupPhotos: PhotoItem[], poi: PoiPoint) => {
    const placeKey = groupPhotos[0]?.placeKey || '';
    const geometry =
      resolvedGeometryMap.get(placeKey) ??
      buildGroupGeometryFromLayout(placeKey, groupPhotos, getPhotoLogicalSize, transform.scale, groupLayouts ?? []);
    if (!geometry) {
      return { x: poi.logicalX, y: poi.logicalY };
    }
    return { x: geometry.lineAnchorX, y: geometry.lineAnchorY };
  }, [groupLayouts, getPhotoLogicalSize, transform.scale]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const nextCanvasWidth = Math.round(width * dpr);
    const nextCanvasHeight = Math.round(height * dpr);
    const cachedSize = canvasSizeRef.current;
    if (
      cachedSize.width !== nextCanvasWidth ||
      cachedSize.height !== nextCanvasHeight ||
      cachedSize.dpr !== dpr
    ) {
      canvas.width = nextCanvasWidth;
      canvas.height = nextCanvasHeight;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      canvasSizeRef.current = { width: nextCanvasWidth, height: nextCanvasHeight, dpr };
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, height);
    const overlayScale = getOverlayScale(transform.scale);

    for (const poi of poiPoints) {
      const poiScreen = logicalToScreen(poi.logicalX, poi.logicalY);

      const poiPhotos = photosByPlaceKey.get(poi.placeKey) ?? [];
      if (poiPhotos.length === 0) continue;

      const groupAnchor = getGroupAnchorPoint(resolvedGeometryMap, poiPhotos, poi);
      const photoCenter = logicalToScreen(groupAnchor.x, groupAnchor.y);

      ctx.beginPath();
      ctx.moveTo(poiScreen.x, poiScreen.y);
      ctx.lineTo(photoCenter.x, photoCenter.y);
      ctx.strokeStyle = lineStyle.color + 'b3';
      ctx.lineWidth = Math.max(1, Math.min(MAX_LINE_WIDTH, lineStyle.width * overlayScale));
      if (lineStyle.dashed) ctx.setLineDash([8, 4]);
      else ctx.setLineDash([]);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(
        photoCenter.x,
        photoCenter.y,
        Math.max(3, Math.min(MAX_ANCHOR_RADIUS, GROUP_ENDPOINT_RADIUS_SCREEN * overlayScale)),
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = lineStyle.color;
      ctx.fill();
      ctx.strokeStyle = '#c7d2fe';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.stroke();

      // --- POI label at map end ---
      if (showPoiLabels) {
        const offset = 14 * overlayScale;
        ctx.fillStyle = poiLabelColor;
        ctx.font = `${Math.max(10, Math.min(MAX_POI_LABEL_FONT, 11 * overlayScale))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(poi.placeTitle, poiScreen.x, poiScreen.y + offset);
      }
    }
  }, [width, height, transform, poiPoints, lineStyle, showPoiLabels, poiLabelColor, logicalToScreen, getGroupAnchorPoint, photosByPlaceKey, resolvedGeometryMap]);

  useEffect(() => {
    const rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [render, renderVersion]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 2,
      }}
    />
  );
}
