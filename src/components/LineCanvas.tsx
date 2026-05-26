'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { OuterFrameTransform, Point } from '@/lib/outerFrameCoords';
import type { PhotoItem, PoiPoint } from './OuterFrameCanvas';
import type { LineStyle } from './LegendPanel';
import { buildGroupGeometry, type LogicalRect } from './localMapGroupGeometry';

interface Props {
  width: number;
  height: number;
  transform: OuterFrameTransform;
  photos: PhotoItem[];
  poiPoints: PoiPoint[];
  lineStyle: LineStyle;
  showPoiLabels: boolean;
  poiLabelColor: string;
}

export default function LineCanvas({ width, height, transform, photos, poiPoints, lineStyle, showPoiLabels, poiLabelColor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  const intersectRayWithRect = useCallback((fromX: number, fromY: number, rect: LogicalRect) => {
    const centerX = (rect.left + rect.right) / 2;
    const centerY = (rect.top + rect.bottom) / 2;
    const dx = centerX - fromX;
    const dy = centerY - fromY;

    if (dx === 0 && dy === 0) {
      return { x: centerX, y: rect.top };
    }

    const candidates: Array<{ t: number; x: number; y: number }> = [];

    if (dx !== 0) {
      const leftT = (rect.left - fromX) / dx;
      const leftY = fromY + dy * leftT;
      if (leftT >= 0 && leftY >= rect.top && leftY <= rect.bottom) {
        candidates.push({ t: leftT, x: rect.left, y: leftY });
      }

      const rightT = (rect.right - fromX) / dx;
      const rightY = fromY + dy * rightT;
      if (rightT >= 0 && rightY >= rect.top && rightY <= rect.bottom) {
        candidates.push({ t: rightT, x: rect.right, y: rightY });
      }
    }

    if (dy !== 0) {
      const topT = (rect.top - fromY) / dy;
      const topX = fromX + dx * topT;
      if (topT >= 0 && topX >= rect.left && topX <= rect.right) {
        candidates.push({ t: topT, x: topX, y: rect.top });
      }

      const bottomT = (rect.bottom - fromY) / dy;
      const bottomX = fromX + dx * bottomT;
      if (bottomT >= 0 && bottomX >= rect.left && bottomX <= rect.right) {
        candidates.push({ t: bottomT, x: bottomX, y: rect.bottom });
      }
    }

    const hit = candidates.sort((a, b) => a.t - b.t)[0];
    return hit ? { x: hit.x, y: hit.y } : { x: centerX, y: centerY };
  }, []);

  const getGroupAnchorPoint = useCallback((groupPhotos: PhotoItem[], poi: PoiPoint) => {
    const geometry = buildGroupGeometry(groupPhotos, getPhotoLogicalSize, transform.scale);
    if (!geometry) {
      return { x: poi.logicalX, y: poi.logicalY };
    }
    return intersectRayWithRect(poi.logicalX, poi.logicalY, geometry.photoRect);
  }, [getPhotoLogicalSize, intersectRayWithRect, transform.scale]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, height);

    for (const poi of poiPoints) {
      const poiScreen = logicalToScreen(poi.logicalX, poi.logicalY);

      const poiPhotos = photos.filter(
        p => p.placeKey === poi.placeKey && p.frameX != null && p.frameY != null,
      );
      if (poiPhotos.length === 0) continue;

      const groupAnchor = getGroupAnchorPoint(poiPhotos, poi);
      const photoCenter = logicalToScreen(groupAnchor.x, groupAnchor.y);

      ctx.beginPath();
      ctx.moveTo(poiScreen.x, poiScreen.y);
      ctx.lineTo(photoCenter.x, photoCenter.y);
      ctx.strokeStyle = lineStyle.color + 'b3';
      ctx.lineWidth = Math.max(1, lineStyle.width * transform.scale);
      if (lineStyle.dashed) ctx.setLineDash([8, 4]);
      else ctx.setLineDash([]);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(photoCenter.x, photoCenter.y, Math.max(4, 4 * transform.scale), 0, Math.PI * 2);
      ctx.fillStyle = lineStyle.color;
      ctx.fill();
      ctx.strokeStyle = '#c7d2fe';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.stroke();

      // --- POI label at map end ---
      if (showPoiLabels) {
        const offset = 14 * transform.scale;
        ctx.fillStyle = poiLabelColor;
        ctx.font = `${Math.max(10, 11 * transform.scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(poi.placeTitle, poiScreen.x, poiScreen.y + offset);
      }
    }
  }, [width, height, transform, photos, poiPoints, lineStyle, showPoiLabels, poiLabelColor, logicalToScreen, getGroupAnchorPoint]);

  useEffect(() => {
    let rafId: number;
    const loop = () => { render(); rafId = requestAnimationFrame(loop); };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [render]);

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
