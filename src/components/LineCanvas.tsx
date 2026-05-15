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
        p => p.placeTitle === poi.placeTitle && p.frameX != null && p.frameY != null,
      );
      if (poiPhotos.length === 0) continue;

      let cx = 0, cy = 0;
      for (const pp of poiPhotos) { cx += pp.frameX; cy += pp.frameY; }
      cx /= poiPhotos.length;
      cy /= poiPhotos.length;

      const photoCenter = logicalToScreen(cx, cy);

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
  }, [width, height, transform, photos, poiPoints, lineStyle, showPoiLabels, poiLabelColor, logicalToScreen]);

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
