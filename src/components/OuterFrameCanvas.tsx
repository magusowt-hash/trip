'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { OuterFrameTransform, Point } from '@/lib/outerFrameCoords';

export interface PhotoItem {
  id: number | string;
  url: string;
  frameX: number | undefined;
  frameY: number | undefined;
  placeKey: string;
  placeTitle: string;
  footprintItemId?: number;
  filename: string;
  size?: number;
  lastModified?: number;
  sourceType?: 'uploaded' | 'local-mapped';
  relativePath?: string;
  rootName?: string;
  missing?: boolean;
  isGroupLabel?: boolean;
}

export interface PoiPoint {
  placeKey: string;
  placeTitle: string;
  logicalX: number;
  logicalY: number;
}

export interface PlaceRect {
  placeKey: string;
  placeTitle: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Props {
  width: number;
  height: number;
  transform: OuterFrameTransform;
  photos: PhotoItem[];
  showLabels: boolean;
  onPhotoDragEnd?: (photoId: number | string, x: number, y: number) => void;
  onPhotoClick?: (photoId: number | string) => void;
  onPhotoMoved?: () => void;
  onGroupLabelDragEnd?: (placeKey: string, dx: number, dy: number) => void;
}

const PHOTO_SIZE = 80;
const CORNER_RADIUS = 10;
const RECT_PADDING = 40;
const MAP_AREA_RATIO_W = 0.6;
const MAP_AREA_RATIO_H = 0.8;

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function rectContains(r: PlaceRect, x: number, y: number): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function clampGroupAwayFromMap(
  photos: PhotoItem[],
  placeKey: string,
  width: number,
  height: number,
) {
  const group = photos.filter(
    (photo) => photo.placeKey === placeKey && photo.frameX != null && photo.frameY != null,
  );
  if (group.length === 0) return;

  const mapHalfW = (width * MAP_AREA_RATIO_W) / 2;
  const mapHalfH = (height * MAP_AREA_RATIO_H) / 2;
  const photoHalf = PHOTO_SIZE / 2;

  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (const photo of group) {
    left = Math.min(left, photo.frameX! - photoHalf);
    right = Math.max(right, photo.frameX! + photoHalf);
    top = Math.min(top, photo.frameY! - photoHalf);
    bottom = Math.max(bottom, photo.frameY! + photoHalf);
  }

  const overlapsMap =
    right > -mapHalfW &&
    left < mapHalfW &&
    bottom > -mapHalfH &&
    top < mapHalfH;

  if (!overlapsMap) return;

  const dl = right - (-mapHalfW);
  const dr = mapHalfW - left;
  const dt = bottom - (-mapHalfH);
  const db = mapHalfH - top;
  const minD = Math.min(dl, dr, dt, db);

  let shiftX = 0;
  let shiftY = 0;
  if (minD === dl) shiftX = -dl;
  else if (minD === dr) shiftX = dr;
  else if (minD === dt) shiftY = -dt;
  else shiftY = db;

  for (const photo of group) {
    photo.frameX = (photo.frameX ?? 0) + shiftX;
    photo.frameY = (photo.frameY ?? 0) + shiftY;
  }
}

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6',
];

function placeColor(placeTitle: string): string {
  let hash = 0;
  for (let i = 0; i < placeTitle.length; i++) {
    hash = placeTitle.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function OuterFrameCanvas({
  width,
  height,
  transform,
  photos,
  showLabels,
  onPhotoDragEnd,
  onPhotoClick,
  onPhotoMoved,
  onGroupLabelDragEnd,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCache = useRef<Map<number | string, HTMLImageElement>>(new Map());
  const dragRef = useRef<{
    photoId: number | string;
    startX: number;
    startY: number;
    origFrameX: number;
    origFrameY: number;
    placeTitle: string;
    placeKey: string;
    dragKind: 'photo' | 'group';
  } | null>(null);
  const hoveredPhotoRef = useRef<number | string | null>(null);
  const placeRectsRef = useRef<PlaceRect[]>([]);
  const didDragRef = useRef(false);

  // --- Compute place rects from current photo positions ---
  const computePlaceRects = useCallback((): PlaceRect[] => {
    const groups = new Map<string, PhotoItem[]>();
    for (const p of photos) {
      if (p.frameX == null || p.frameY == null) continue;
      const arr = groups.get(p.placeKey) || [];
      arr.push(p);
      groups.set(p.placeKey, arr);
    }
    const rects: PlaceRect[] = [];
    for (const [placeKey, items] of groups) {
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const p of items) {
        left = Math.min(left, p.frameX! - PHOTO_SIZE / 2);
        top = Math.min(top, p.frameY! - PHOTO_SIZE / 2);
        right = Math.max(right, p.frameX! + PHOTO_SIZE / 2);
        bottom = Math.max(bottom, p.frameY! + PHOTO_SIZE / 2);
      }
      rects.push({
        placeKey,
        placeTitle: items[0]?.placeTitle || '',
        left: left - RECT_PADDING,
        top: top - RECT_PADDING,
        right: right + RECT_PADDING,
        bottom: bottom + RECT_PADDING + 20,
      });
    }
    return rects;
  }, [photos]);

  // --- Coordinate helpers ---
  const logicalToScreen = useCallback((lx: number, ly: number): Point => ({
    x: lx * transform.scale + width / 2 + transform.tx,
    y: ly * transform.scale + height / 2 + transform.ty,
  }), [transform, width, height]);

  const screenToLogical = useCallback((sx: number, sy: number): Point => ({
    x: (sx - width / 2 - transform.tx) / transform.scale,
    y: (sy - height / 2 - transform.ty) / transform.scale,
  }), [transform, width, height]);

  // --- Image loading ---
  const loadImage = useCallback((photo: PhotoItem): HTMLImageElement | null => {
    const cached = imageCache.current.get(photo.id);
    if (cached) return cached;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = photo.url;
    imageCache.current.set(photo.id, img);
    return img;
  }, []);

  // --- Hit test ---
  const hitTest = useCallback((sx: number, sy: number): number | string | null => {
    const half = (PHOTO_SIZE / 2) * transform.scale;
    const margin = 10 * transform.scale;
    for (let i = photos.length - 1; i >= 0; i--) {
      const p = photos[i];
      if (p.frameX == null || p.frameY == null) continue;
      const s = logicalToScreen(p.frameX, p.frameY);
      if (sx >= s.x - half - margin && sx <= s.x + half + margin &&
          sy >= s.y - half - margin && sy <= s.y + half + margin) {
        return p.id;
      }
    }
    return null;
  }, [photos, transform, logicalToScreen]);

  // --- Render ---
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

    // Recompute place rects from current (possibly dragged) positions
    const currentRects = computePlaceRects();
    placeRectsRef.current = currentRects;

    const displaySize = PHOTO_SIZE * transform.scale;

    // --- Draw photos (no per-photo labels) ---
    for (const photo of photos) {
      if (photo.frameX == null || photo.frameY == null) continue;

      const s = logicalToScreen(photo.frameX, photo.frameY);
      const half = displaySize / 2;
      const cr = Math.max(4, CORNER_RADIUS * transform.scale);

      if (s.x + half < -PHOTO_SIZE || s.x - half > width + PHOTO_SIZE ||
          s.y + half < -PHOTO_SIZE || s.y - half > height + PHOTO_SIZE) {
        continue;
      }

      const color = placeColor(photo.placeTitle);
      const isHovered = hoveredPhotoRef.current === photo.id;
      const img = loadImage(photo);

      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        roundedRect(ctx, s.x - half, s.y - half, displaySize, displaySize, cr);
        ctx.clip();
        const srcW = img.naturalWidth;
        const srcH = img.naturalHeight;
        const sc = Math.max(displaySize / srcW, displaySize / srcH);
        ctx.drawImage(img, s.x - (srcW * sc) / 2, s.y - (srcH * sc) / 2, srcW * sc, srcH * sc);
        ctx.restore();
      } else {
        roundedRect(ctx, s.x - half, s.y - half, displaySize, displaySize, cr);
        ctx.fillStyle = color;
        ctx.fill();
      }

      roundedRect(ctx, s.x - half, s.y - half, displaySize, displaySize, cr);
      ctx.strokeStyle = isHovered ? '#fff' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = isHovered ? 2.5 : 1.5;
      ctx.stroke();
    }

    // --- Draw place labels (one per rectangle) ---
      if (showLabels) {
      for (const rect of currentRects) {
        const left = logicalToScreen(rect.left, rect.bottom);
        const right = logicalToScreen(rect.right, rect.bottom);
        const cx = (left.x + right.x) / 2;
        const cy = logicalToScreen(rect.left, rect.bottom).y + 4 * transform.scale;

        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.font = `${Math.max(11, 12 * transform.scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(rect.placeTitle, cx, cy);
      }
    }
  }, [width, height, transform, photos, showLabels, logicalToScreen, loadImage, computePlaceRects]);

  // Dirty flag
  const dirtyRef = useRef(true);
  const prevKeyRef = useRef('');

  useEffect(() => {
    const key = `${transform.scale},${transform.tx},${transform.ty},${photos.length},${showLabels},${width},${height}`;
    if (key !== prevKeyRef.current) {
      dirtyRef.current = true;
      prevKeyRef.current = key;
    }
  }, [transform, photos, showLabels, width, height]);

  useEffect(() => {
    let rafId: number;
    const loop = () => {
      if (dirtyRef.current || dragRef.current) {
        render();
        dirtyRef.current = false;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [render]);

  // Cleanup image cache
  useEffect(() => {
    const currentIds = new Set(photos.map(p => p.id));
    imageCache.current.forEach((_, id) => {
      if (!currentIds.has(id)) imageCache.current.delete(id);
    });
  }, [photos]);

  // --- Pointer handlers ---
  const getCanvasPos = useCallback((e: React.PointerEvent): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const pos = getCanvasPos(e);
    const hit = hitTest(pos.x, pos.y);
    if (hit) {
      e.stopPropagation();
      e.preventDefault();
      didDragRef.current = false;
      const photo = photos.find(p => p.id === hit);
      if (photo && photo.frameX != null && photo.frameY != null) {
        dragRef.current = {
          photoId: hit,
          startX: pos.x,
          startY: pos.y,
          origFrameX: photo.frameX,
          origFrameY: photo.frameY,
          placeKey: photo.placeKey,
          placeTitle: photo.placeTitle,
          dragKind: 'photo',
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
      return;
    }

    if (showLabels) {
      for (const rect of placeRectsRef.current) {
        const left = logicalToScreen(rect.left, rect.bottom);
        const right = logicalToScreen(rect.right, rect.bottom);
        const cx = (left.x + right.x) / 2;
        const cy = logicalToScreen(rect.left, rect.bottom).y + 4 * transform.scale;
        if (Math.abs(pos.x - cx) <= 60 && Math.abs(pos.y - cy) <= 18) {
          e.stopPropagation();
          e.preventDefault();
          didDragRef.current = false;
          dragRef.current = {
            photoId: `group:${rect.placeTitle}`,
            startX: pos.x,
            startY: pos.y,
            origFrameX: 0,
            origFrameY: 0,
            placeKey: rect.placeKey,
            placeTitle: rect.placeTitle,
            dragKind: 'group',
          };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }
      }
    }
  }, [getCanvasPos, hitTest, photos, showLabels, logicalToScreen]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) {
      e.stopPropagation();
      const pos = getCanvasPos(e);
      const dx = (pos.x - dragRef.current.startX) / transform.scale;
      const dy = (pos.y - dragRef.current.startY) / transform.scale;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        didDragRef.current = true;
      }
      const newX = dragRef.current.origFrameX + dx;
      const newY = dragRef.current.origFrameY + dy;

      if (dragRef.current.dragKind === 'group') {
        for (const photo of photos) {
          if (photo.placeKey !== dragRef.current.placeKey) continue;
          if (photo.frameX == null || photo.frameY == null) continue;
          photo.frameX += dx - ((dragRef.current as any)._lastDx ?? 0);
          photo.frameY += dy - ((dragRef.current as any)._lastDy ?? 0);
        }
        clampGroupAwayFromMap(photos, dragRef.current.placeKey, width, height);
        (dragRef.current as any)._lastDx = dx;
        (dragRef.current as any)._lastDy = dy;
      } else {
        const photo = photos.find(p => p.id === dragRef.current!.photoId);
        if (photo) {
          photo.frameX = newX;
          photo.frameY = newY;

          // Prevent dragging into map area (fixed logical size, independent of zoom)
          const mapHalfW = (width * MAP_AREA_RATIO_W) / 2;
          const mapHalfH = (height * MAP_AREA_RATIO_H) / 2;
          const photoHalf = PHOTO_SIZE / 2;
          const photoLeft = photo.frameX - photoHalf;
          const photoRight = photo.frameX + photoHalf;
          const photoTop = photo.frameY - photoHalf;
          const photoBottom = photo.frameY + photoHalf;
          if (photoRight > -mapHalfW && photoLeft < mapHalfW &&
              photoBottom > -mapHalfH && photoTop < mapHalfH) {
            const dl = photoRight - (-mapHalfW);
            const dr = mapHalfW - photoLeft;
            const dt = photoBottom - (-mapHalfH);
            const db = mapHalfH - photoTop;
            const minD = Math.min(dl, dr, dt, db);
            if (minD === dl) photo.frameX = -mapHalfW - photoHalf;
            else if (minD === dr) photo.frameX = mapHalfW + photoHalf;
            else if (minD === dt) photo.frameY = -mapHalfH - photoHalf;
            else photo.frameY = mapHalfH + photoHalf;
          }
        }
      }
      dirtyRef.current = true;
    } else {
      const pos = getCanvasPos(e);
      const hit = hitTest(pos.x, pos.y);
      hoveredPhotoRef.current = hit;
    }
  }, [getCanvasPos, hitTest, transform, photos]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) {
      if (dragRef.current.dragKind === 'group') {
        const dx = (dragRef.current as any)._lastDx ?? 0;
        const dy = (dragRef.current as any)._lastDy ?? 0;
        onGroupLabelDragEnd?.(dragRef.current.placeKey, dx, dy);
        onPhotoMoved?.();
      } else {
        const photo = photos.find(p => p.id === dragRef.current!.photoId);
        if (photo && photo.frameX != null && photo.frameY != null) {
          onPhotoDragEnd?.(dragRef.current.photoId, photo.frameX, photo.frameY);
          onPhotoMoved?.();
        }
      }
      dragRef.current = null;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, [photos, onPhotoDragEnd, onPhotoMoved, onGroupLabelDragEnd]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (didDragRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (hit) onPhotoClick?.(hit);
  }, [hitTest, onPhotoClick]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'auto', zIndex: 3,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
    />
  );
}
