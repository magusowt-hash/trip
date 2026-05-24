'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { OuterFrameTransform, Point } from '@/lib/outerFrameCoords';
import type { PhotoItem, PoiPoint } from './OuterFrameCanvas';
import type { LineStyle } from './LegendPanel';

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
  const anchorGap = 10;

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

  const getGroupAnchorPoint = useCallback((groupPhotos: PhotoItem[], poi: PoiPoint) => {
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (const photo of groupPhotos) {
      if (photo.frameX == null || photo.frameY == null) continue;
      const size = getPhotoLogicalSize(photo);
      left = Math.min(left, photo.frameX - size.width / 2);
      right = Math.max(right, photo.frameX + size.width / 2);
      top = Math.min(top, photo.frameY - size.height / 2);
      bottom = Math.max(bottom, photo.frameY + size.height / 2);
    }
    if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
      return { x: poi.logicalX, y: poi.logicalY };
    }
    left -= anchorGap;
    right += anchorGap;
    top -= anchorGap;
    bottom += anchorGap;
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const dx = centerX - poi.logicalX;
    const dy = centerY - poi.logicalY;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
      return { x: centerX, y: centerY };
    }
    const tx = Math.abs(dx) > 1e-6
      ? (dx > 0 ? (right - poi.logicalX) / dx : (left - poi.logicalX) / dx)
      : Number.POSITIVE_INFINITY;
    const ty = Math.abs(dy) > 1e-6
      ? (dy > 0 ? (bottom - poi.logicalY) / dy : (top - poi.logicalY) / dy)
      : Number.POSITIVE_INFINITY;
    const t = Math.min(tx, ty);
    return {
      x: poi.logicalX + dx * t,
      y: poi.logicalY + dy * t,
    };
  }, [getPhotoLogicalSize]);

  const logicalToScreen = useCallback((lx: number, ly: number): Point => ({
    x: lx * transform.scale + width / 2 + transform.tx,
    y: ly * transform.scale + height / 2 + transform.ty,
  }), [transform, width, height]);

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
