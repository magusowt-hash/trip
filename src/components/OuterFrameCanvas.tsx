'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { OuterFrameTransform, Point } from '@/lib/outerFrameCoords';
import {
  buildGroupGeometry,
  GROUP_LABEL_FONT_SCREEN_SIZE,
  GROUP_LABEL_MIN_FONT_SCREEN_SIZE,
  type GroupLabelSide,
  resolveGroupGeometryLabels,
} from './localMapGroupGeometry';

export interface PhotoItem {
  id: number | string;
  url: string;
  thumbnailUrl?: string;
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
  pixelWidth?: number;
  pixelHeight?: number;
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
  photoLeft: number;
  photoTop: number;
  photoRight: number;
  photoBottom: number;
  overallLeft: number;
  overallTop: number;
  overallRight: number;
  overallBottom: number;
  labelLeft: number;
  labelTop: number;
  labelRight: number;
  labelBottom: number;
  labelSide: GroupLabelSide;
  labelAnchorX: number;
  labelAnchorY: number;
}

interface Props {
  width: number;
  height: number;
  transform: OuterFrameTransform;
  photos: PhotoItem[];
  scale: number;
  showLabels: boolean;
  onPhotoDragEnd?: (photoId: number | string, x: number, y: number) => void;
  onPhotoClick?: (photoId: number | string) => void;
  onPhotoMoved?: () => void;
  onGroupLabelDragEnd?: (placeKey: string, dx: number, dy: number) => void;
}

const PHOTO_MAX_EDGE = 120;
const PHOTO_MIN_EDGE = 48;
const MAP_AREA_RATIO_W = 0.6;
const MAP_AREA_RATIO_H = 0.8;
const MAX_OVERLAY_SCALE = 2.4;
const HOVER_STROKE_WIDTH = 1.5;

function getOverlayScale(scale: number) {
  return Math.min(scale, MAX_OVERLAY_SCALE);
}

function rectContains(r: PlaceRect, x: number, y: number): boolean {
  return x >= r.overallLeft && x <= r.overallRight && y >= r.overallTop && y <= r.overallBottom;
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

function getMapLogicalBounds(width: number, height: number) {
  return {
    halfW: (width * MAP_AREA_RATIO_W) / 2,
    halfH: (height * MAP_AREA_RATIO_H) / 2,
  };
}

export default function OuterFrameCanvas({
  width,
  height,
  transform,
  photos,
  scale,
  showLabels,
  onPhotoDragEnd,
  onPhotoClick,
  onPhotoMoved,
  onGroupLabelDragEnd,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dirtyRef = useRef(true);
  const prevKeyRef = useRef('');
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
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

  const getRenderUrl = useCallback((photo: PhotoItem) => {
    if (photo.sourceType === 'local-mapped' && photo.thumbnailUrl && scale < 4) {
      return photo.thumbnailUrl;
    }
    return photo.url;
  }, [scale]);

  const getPhotoLogicalSize = useCallback((photo: PhotoItem) => {
    const sourceWidth = photo.pixelWidth ?? 0;
    const sourceHeight = photo.pixelHeight ?? 0;
    if (sourceWidth > 0 && sourceHeight > 0) {
      if (sourceWidth >= sourceHeight) {
        return {
          width: PHOTO_MAX_EDGE,
          height: Math.max(PHOTO_MIN_EDGE, (PHOTO_MAX_EDGE * sourceHeight) / sourceWidth),
        };
      }
      return {
        width: Math.max(PHOTO_MIN_EDGE, (PHOTO_MAX_EDGE * sourceWidth) / sourceHeight),
        height: PHOTO_MAX_EDGE,
      };
    }

    const img = imageCache.current.get(`${photo.id}:${getRenderUrl(photo)}`);
    if (!img || !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
      return { width: PHOTO_MAX_EDGE, height: PHOTO_MAX_EDGE };
    }

    if (img.naturalWidth >= img.naturalHeight) {
      return {
        width: PHOTO_MAX_EDGE,
        height: Math.max(PHOTO_MIN_EDGE, (PHOTO_MAX_EDGE * img.naturalHeight) / img.naturalWidth),
      };
    }

    return {
      width: Math.max(PHOTO_MIN_EDGE, (PHOTO_MAX_EDGE * img.naturalWidth) / img.naturalHeight),
      height: PHOTO_MAX_EDGE,
    };
  }, [getRenderUrl]);

  const getPhotoBounds = useCallback((photo: PhotoItem) => {
    if (photo.frameX == null || photo.frameY == null) return null;
    const size = getPhotoLogicalSize(photo);
    return {
      left: photo.frameX - size.width / 2,
      right: photo.frameX + size.width / 2,
      top: photo.frameY - size.height / 2,
      bottom: photo.frameY + size.height / 2,
      width: size.width,
      height: size.height,
    };
  }, [getPhotoLogicalSize]);

  const clampGroupAwayFromMap = useCallback((placeKey: string) => {
    const group = photos.filter(
      (photo) => photo.placeKey === placeKey && photo.frameX != null && photo.frameY != null,
    );
    if (group.length === 0) return;

    const { halfW: mapHalfW, halfH: mapHalfH } = getMapLogicalBounds(width, height);

    const geometry = buildGroupGeometry(group, getPhotoLogicalSize, transform.scale);
    if (!geometry) return;
    const left = geometry.groupRect.left;
    const right = geometry.groupRect.right;
    const top = geometry.groupRect.top;
    const bottom = geometry.groupRect.bottom;

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
  }, [photos, width, height, getPhotoLogicalSize, transform.scale]);

  // --- Compute place rects from current photo positions ---
  const computePlaceRects = useCallback((): PlaceRect[] => {
    const groups = new Map<string, PhotoItem[]>();
    for (const p of photos) {
      if (p.frameX == null || p.frameY == null) continue;
      const arr = groups.get(p.placeKey) || [];
      arr.push(p);
      groups.set(p.placeKey, arr);
    }
    const geometryEntries: Array<{
      placeKey: string;
      placeTitle: string;
      geometry: NonNullable<ReturnType<typeof buildGroupGeometry>>;
    }> = [];
    for (const [placeKey, items] of groups) {
      const geometry = buildGroupGeometry(items, getPhotoLogicalSize, transform.scale);
      if (!geometry) continue;
      geometryEntries.push({
        placeKey,
        placeTitle: items[0]?.placeTitle || '',
        geometry,
      });
    }
    const { halfW: mapHalfW, halfH: mapHalfH } = getMapLogicalBounds(width, height);
    const resolvedGeometry = resolveGroupGeometryLabels(
      geometryEntries.map((entry) => ({ id: entry.placeKey, geometry: entry.geometry })),
      {
        gap: 14,
        step: 6,
        maxOffset: 108,
        mapRect: { left: -mapHalfW, right: mapHalfW, top: -mapHalfH, bottom: mapHalfH },
      },
    );
    const rects: PlaceRect[] = [];
    for (const entry of geometryEntries) {
      const geometry = resolvedGeometry.get(entry.placeKey) ?? entry.geometry;
      rects.push({
        placeKey: entry.placeKey,
        placeTitle: entry.placeTitle,
        photoLeft: geometry.photoRect.left,
        photoTop: geometry.photoRect.top,
        photoRight: geometry.photoRect.right,
        photoBottom: geometry.photoRect.bottom,
        overallLeft: geometry.groupRect.left,
        overallTop: geometry.groupRect.top,
        overallRight: geometry.groupRect.right,
        overallBottom: geometry.groupRect.bottom,
        labelLeft: geometry.labelRect.left,
        labelTop: geometry.labelRect.top,
        labelRight: geometry.labelRect.right,
        labelBottom: geometry.labelRect.bottom,
        labelSide: geometry.labelSide,
        labelAnchorX: geometry.labelAnchorX,
        labelAnchorY: geometry.labelAnchorY,
      });
    }
    return rects;
  }, [photos, getPhotoLogicalSize]);

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
    const renderUrl = getRenderUrl(photo);
    const cacheKey = `${photo.id}:${renderUrl}`;
    const cached = imageCache.current.get(cacheKey);
    if (cached) return cached;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = renderUrl;
    img.onload = () => {
      dirtyRef.current = true;
    };
    img.onerror = () => {
      dirtyRef.current = true;
    };
    imageCache.current.set(cacheKey, img);
    return img;
  }, [getRenderUrl]);

  // --- Hit test ---
  const hitTest = useCallback((sx: number, sy: number): number | string | null => {
    const margin = 10 * transform.scale;
    for (let i = photos.length - 1; i >= 0; i--) {
      const p = photos[i];
      if (p.frameX == null || p.frameY == null) continue;
      const size = getPhotoLogicalSize(p);
      const s = logicalToScreen(p.frameX, p.frameY);
      const halfW = (size.width * transform.scale) / 2;
      const halfH = (size.height * transform.scale) / 2;
      if (sx >= s.x - halfW - margin && sx <= s.x + halfW + margin &&
          sy >= s.y - halfH - margin && sy <= s.y + halfH + margin) {
        return p.id;
      }
    }
    return null;
  }, [photos, transform, logicalToScreen, getPhotoLogicalSize]);

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
    const overlayScale = getOverlayScale(transform.scale);

    // Recompute place rects from current (possibly dragged) positions
    const currentRects = computePlaceRects();
    placeRectsRef.current = currentRects;

    // --- Draw photos (no per-photo labels) ---
    for (const photo of photos) {
      if (photo.frameX == null || photo.frameY == null) continue;

      const s = logicalToScreen(photo.frameX, photo.frameY);
      const size = getPhotoLogicalSize(photo);
      const displayWidth = size.width * transform.scale;
      const displayHeight = size.height * transform.scale;
      const halfW = displayWidth / 2;
      const halfH = displayHeight / 2;

      if (s.x + halfW < -PHOTO_MAX_EDGE || s.x - halfW > width + PHOTO_MAX_EDGE ||
          s.y + halfH < -PHOTO_MAX_EDGE || s.y - halfH > height + PHOTO_MAX_EDGE) {
        continue;
      }

      const color = placeColor(photo.placeTitle);
      const isHovered = hoveredPhotoRef.current === photo.id;
      const img = loadImage(photo);

      if (img && img.complete && img.naturalWidth > 0) {
        const srcW = img.naturalWidth;
        const srcH = img.naturalHeight;
        ctx.drawImage(img, s.x - displayWidth / 2, s.y - displayHeight / 2, displayWidth, displayHeight);
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(s.x - displayWidth / 2, s.y - displayHeight / 2, displayWidth, displayHeight);
      }

      if (isHovered) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, HOVER_STROKE_WIDTH * (overlayScale / Math.max(transform.scale, 0.1)));
        ctx.strokeRect(s.x - displayWidth / 2, s.y - displayHeight / 2, displayWidth, displayHeight);
      }
    }

    // --- Draw place labels (one per rectangle) ---
    if (showLabels) {
      for (const rect of currentRects) {
        const anchor = logicalToScreen(rect.labelAnchorX, rect.labelAnchorY);

        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.font = `${Math.max(GROUP_LABEL_MIN_FONT_SCREEN_SIZE, GROUP_LABEL_FONT_SCREEN_SIZE * overlayScale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rect.placeTitle, anchor.x, anchor.y);
      }
    }
  }, [width, height, transform, photos, showLabels, logicalToScreen, loadImage, computePlaceRects, getPhotoLogicalSize]);

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
    const currentIds = new Set(photos.map(p => String(p.id)));
    imageCache.current.forEach((_, key) => {
      const id = key.split(':')[0];
      if (!currentIds.has(id)) imageCache.current.delete(key);
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
        const topLeft = logicalToScreen(rect.labelLeft, rect.labelTop);
        const bottomRight = logicalToScreen(rect.labelRight, rect.labelBottom);
        const minX = Math.min(topLeft.x, bottomRight.x);
        const maxX = Math.max(topLeft.x, bottomRight.x);
        const minY = Math.min(topLeft.y, bottomRight.y);
        const maxY = Math.max(topLeft.y, bottomRight.y);
        if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
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
        clampGroupAwayFromMap(dragRef.current.placeKey);
        (dragRef.current as any)._lastDx = dx;
        (dragRef.current as any)._lastDy = dy;
      } else {
        const photo = photos.find(p => p.id === dragRef.current!.photoId);
        if (photo) {
          photo.frameX = newX;
          photo.frameY = newY;

          const { halfW: mapHalfW, halfH: mapHalfH } = getMapLogicalBounds(width, height);
          const bounds = getPhotoBounds(photo);
          if (!bounds) return;
          const photoLeft = bounds.left;
          const photoRight = bounds.right;
          const photoTop = bounds.top;
          const photoBottom = bounds.bottom;
          if (photoRight > -mapHalfW && photoLeft < mapHalfW &&
              photoBottom > -mapHalfH && photoTop < mapHalfH) {
            const dl = photoRight - (-mapHalfW);
            const dr = mapHalfW - photoLeft;
            const dt = photoBottom - (-mapHalfH);
            const db = mapHalfH - photoTop;
            const minD = Math.min(dl, dr, dt, db);
            if (minD === dl) photo.frameX = -mapHalfW - bounds.width / 2;
            else if (minD === dr) photo.frameX = mapHalfW + bounds.width / 2;
            else if (minD === dt) photo.frameY = -mapHalfH - bounds.height / 2;
            else photo.frameY = mapHalfH + bounds.height / 2;
          }
        }
      }
      dirtyRef.current = true;
    } else {
      const pos = getCanvasPos(e);
      const hit = hitTest(pos.x, pos.y);
      hoveredPhotoRef.current = hit;
    }
  }, [getCanvasPos, hitTest, transform, photos, width, height, clampGroupAwayFromMap, getPhotoBounds]);

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
