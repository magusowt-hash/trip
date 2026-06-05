'use client';

import { useRef, useEffect, useCallback, useMemo } from 'react';
import type { OuterFrameTransform, Point } from '@/lib/outerFrameCoords';
import {
  buildGroupGeometryFromLayout,
  GROUP_ENDPOINT_RADIUS_SCREEN,
  GROUP_LABEL_FONT_SCREEN_SIZE,
  GROUP_LABEL_LINE_HEIGHT_SCREEN,
  GROUP_LABEL_MIN_FONT_SCREEN_SIZE,
  measureGroupLabelLayout,
  type GroupLayoutSnapshot,
} from './localMapGroupGeometry';
import type { LineStyle } from './LegendPanel';
import {
  clampRectOutsideMap,
  translatePlaceRect,
  type ManualPlaceRect,
} from './footprintManualLayout';

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
  labelSide: 'top' | 'bottom';
  labelAnchorX: number;
  labelAnchorY: number;
  lineAnchorX: number;
  lineAnchorY: number;
}

export interface DraggedGroupPhotoPosition {
  id: number | string;
  frameX: number | undefined;
  frameY: number | undefined;
}

interface Props {
  width: number;
  height: number;
  transform: OuterFrameTransform;
  photos: PhotoItem[];
  groupLayouts?: GroupLayoutSnapshot[];
  scale: number;
  poiPoints: PoiPoint[];
  showLines: boolean;
  lineStyle: LineStyle;
  showLabels: boolean;
  showPoiLabels: boolean;
  poiLabelColor: string;
  renderVersion?: string | number;
  onPhotoDragEnd?: (photoId: number | string, x: number, y: number) => void;
  onPhotoClick?: (photoId: number | string) => void;
  onGroupLabelDragEnd?: (placeKey: string, nextGroupPhotos: DraggedGroupPhotoPosition[]) => void;
}

const PHOTO_MAX_EDGE = 120;
const PHOTO_MIN_EDGE = 48;
const MAP_AREA_RATIO_W = 0.6;
const MAP_AREA_RATIO_H = 0.8;
const MAX_OVERLAY_SCALE = 2.4;
const HOVER_STROKE_WIDTH = 1.5;
const MAX_LINE_WIDTH = 4;
const MAX_ANCHOR_RADIUS = 6;
const MAX_POI_LABEL_FONT = 18;

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
  groupLayouts,
  scale,
  poiPoints,
  showLines,
  lineStyle,
  showLabels,
  showPoiLabels,
  poiLabelColor,
  renderVersion,
  onPhotoDragEnd,
  onPhotoClick,
  onGroupLabelDragEnd,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const renderRef = useRef<() => void>(() => {});
  const canvasSizeRef = useRef({ width: 0, height: 0, dpr: 0 });
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
    groupPhotoOrigins?: Array<{ id: number | string; frameX: number; frameY: number }>;
    groupRectOrigin?: ManualPlaceRect;
  } | null>(null);
  const hoveredPhotoRef = useRef<number | string | null>(null);
  const placeRectsRef = useRef<PlaceRect[]>([]);
  const didDragRef = useRef(false);
  const dragPlaceKeyRef = useRef<string | null>(null);

  const photosByPlaceKey = useMemo(() => {
    const groups = new Map<string, PhotoItem[]>();
    for (const photo of photos) {
      if (photo.frameX == null || photo.frameY == null) continue;
      const arr = groups.get(photo.placeKey) || [];
      arr.push(photo);
      groups.set(photo.placeKey, arr);
    }
    return groups;
  }, [photos]);

  const scheduleRender = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      renderRef.current();
    });
  }, []);

  const getRenderUrl = useCallback((photo: PhotoItem) => {
    if (photo.sourceType === 'local-mapped' && photo.thumbnailUrl && scale < 4) {
      return photo.thumbnailUrl;
    }
    return photo.url;
  }, [scale]);

  const shouldDeferLocalOriginal = useCallback((photo: PhotoItem) => (
    photo.sourceType === 'local-mapped' &&
    scale < 4 &&
    !photo.thumbnailUrl
  ), [scale]);

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

  const clampGroupRectAwayFromMap = useCallback((rect: PlaceRect): PlaceRect => {
    const { halfW: mapHalfW, halfH: mapHalfH } = getMapLogicalBounds(width, height);
    return clampRectOutsideMap(rect, {
      left: -mapHalfW,
      right: mapHalfW,
      top: -mapHalfH,
      bottom: mapHalfH,
    });
  }, [width, height]);

  const buildPlaceRectForGroup = useCallback((placeKey: string, items: PhotoItem[]): PlaceRect | null => {
    const geometry = buildGroupGeometryFromLayout(placeKey, items, getPhotoLogicalSize, transform.scale, groupLayouts ?? []);
    if (!geometry) return null;
    return {
      placeKey,
      placeTitle: items[0]?.placeTitle || '',
      photoLeft: geometry.photoRect.left,
      photoTop: geometry.photoRect.top,
      photoRight: geometry.photoRect.right,
      photoBottom: geometry.photoRect.bottom,
      overallLeft: geometry.overallRect.left,
      overallTop: geometry.overallRect.top,
      overallRight: geometry.overallRect.right,
      overallBottom: geometry.overallRect.bottom,
      labelLeft: geometry.labelRect.left,
      labelTop: geometry.labelRect.top,
      labelRight: geometry.labelRect.right,
      labelBottom: geometry.labelRect.bottom,
      labelSide: geometry.labelSide,
      labelAnchorX: geometry.labelAnchorX,
      labelAnchorY: geometry.labelAnchorY,
      lineAnchorX: geometry.lineAnchorX,
      lineAnchorY: geometry.lineAnchorY,
    };
  }, [getPhotoLogicalSize, transform.scale, groupLayouts]);

  const buildPlaceRects = useCallback((): PlaceRect[] => {
    const rects: PlaceRect[] = [];
    for (const [placeKey, items] of photosByPlaceKey) {
      const rect = buildPlaceRectForGroup(placeKey, items);
      if (rect) rects.push(rect);
    }
    return rects;
  }, [photosByPlaceKey, buildPlaceRectForGroup]);
  const placeRects = useMemo(() => buildPlaceRects(), [buildPlaceRects, renderVersion]);
  const placeRectMap = useMemo(() => {
    const next = new Map<string, PlaceRect>();
    for (const rect of placeRects) next.set(rect.placeKey, rect);
    return next;
  }, [placeRects]);

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
    if (shouldDeferLocalOriginal(photo)) return null;
    const renderUrl = getRenderUrl(photo);
    const cacheKey = `${photo.id}:${renderUrl}`;
    const cached = imageCache.current.get(cacheKey);
    if (cached) return cached;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = renderUrl;
    img.onload = () => {
      scheduleRender();
    };
    img.onerror = () => {
      scheduleRender();
    };
    imageCache.current.set(cacheKey, img);
    return img;
  }, [getRenderUrl, scheduleRender, shouldDeferLocalOriginal]);

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

    let currentRects = placeRects;
    if (dragRef.current) {
      const activePlaceKey = dragPlaceKeyRef.current;
      if (activePlaceKey) {
        const nextRectMap = new Map(placeRectMap);
        const activeGroup = photosByPlaceKey.get(activePlaceKey) ?? [];
        const nextRect = buildPlaceRectForGroup(activePlaceKey, activeGroup);
        if (nextRect) nextRectMap.set(activePlaceKey, nextRect);
        else nextRectMap.delete(activePlaceKey);
        currentRects = Array.from(nextRectMap.values());
      }
    }
    placeRectsRef.current = currentRects;
    const currentRectMap = new Map<string, PlaceRect>();
    for (const rect of currentRects) currentRectMap.set(rect.placeKey, rect);

    if (showLines) {
      for (const poi of poiPoints) {
        const rect = currentRectMap.get(poi.placeKey);
        if (!rect) continue;

        const poiScreen = logicalToScreen(poi.logicalX, poi.logicalY);
        const anchorScreen = logicalToScreen(rect.lineAnchorX, rect.lineAnchorY);

        ctx.beginPath();
        ctx.moveTo(poiScreen.x, poiScreen.y);
        ctx.lineTo(anchorScreen.x, anchorScreen.y);
        ctx.strokeStyle = lineStyle.color + 'b3';
        ctx.lineWidth = Math.max(1, Math.min(MAX_LINE_WIDTH, lineStyle.width * overlayScale));
        if (lineStyle.dashed) ctx.setLineDash([8, 4]);
        else ctx.setLineDash([]);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(
          anchorScreen.x,
          anchorScreen.y,
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

        if (showPoiLabels) {
          const offset = 14 * overlayScale;
          ctx.fillStyle = poiLabelColor;
          ctx.font = `${Math.max(10, Math.min(MAX_POI_LABEL_FONT, 11 * overlayScale))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(poi.placeTitle, poiScreen.x, poiScreen.y + offset);
        }
      }
      ctx.setLineDash([]);
    }

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
      const shouldUsePlaceholder = shouldDeferLocalOriginal(photo);
      const img = shouldUsePlaceholder ? null : loadImage(photo);

      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, s.x - displayWidth / 2, s.y - displayHeight / 2, displayWidth, displayHeight);
      } else {
        ctx.fillStyle = shouldUsePlaceholder ? `${color}99` : color;
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
        const labelWidthLogical = Math.max(1, rect.labelRight - rect.labelLeft);
        const labelLayout = measureGroupLabelLayout(
          rect.placeTitle,
          Math.max(1, rect.photoRight - rect.photoLeft),
          transform.scale,
        );
        const fontSize = Math.max(GROUP_LABEL_MIN_FONT_SCREEN_SIZE, GROUP_LABEL_FONT_SCREEN_SIZE * overlayScale);
        const lineHeight = GROUP_LABEL_LINE_HEIGHT_SCREEN * overlayScale;
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const startY = anchor.y - ((labelLayout.lines.length - 1) * lineHeight) / 2;
        for (let index = 0; index < labelLayout.lines.length; index++) {
          const line = labelLayout.lines[index];
          ctx.fillText(line, anchor.x, startY + index * lineHeight, labelWidthLogical * transform.scale);
        }
      }
    }
  }, [width, height, transform, photos, poiPoints, showLines, lineStyle, showLabels, showPoiLabels, poiLabelColor, logicalToScreen, loadImage, placeRects, placeRectMap, photosByPlaceKey, buildPlaceRectForGroup, getPhotoLogicalSize]);

  useEffect(() => {
    renderRef.current = render;
    const rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [render, renderVersion]);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

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
        dragPlaceKeyRef.current = photo.placeKey;
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
            groupPhotoOrigins: (photosByPlaceKey.get(rect.placeKey) ?? [])
              .filter((photo) => photo.frameX != null && photo.frameY != null)
              .map((photo) => ({
                id: photo.id,
                frameX: photo.frameX!,
                frameY: photo.frameY!,
              })),
            groupRectOrigin: { ...rect },
          };
          dragPlaceKeyRef.current = rect.placeKey;
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
        const originRect = dragRef.current.groupRectOrigin;
        const originPhotos = dragRef.current.groupPhotoOrigins ?? [];
        if (originRect) {
          const translatedRect = translatePlaceRect(originRect, dx, dy);
          const clampedRect = clampGroupRectAwayFromMap(translatedRect);
          const actualDx = clampedRect.overallLeft - originRect.overallLeft;
          const actualDy = clampedRect.overallTop - originRect.overallTop;
          const originById = new Map(originPhotos.map((photo) => [photo.id, photo]));
          for (const photo of photos) {
            if (photo.placeKey !== dragRef.current.placeKey) continue;
            const origin = originById.get(photo.id);
            if (!origin) continue;
            photo.frameX = origin.frameX + actualDx;
            photo.frameY = origin.frameY + actualDy;
          }
        }
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
      scheduleRender();
    } else {
      const pos = getCanvasPos(e);
      const hit = hitTest(pos.x, pos.y);
      if (hoveredPhotoRef.current !== hit) {
        hoveredPhotoRef.current = hit;
        scheduleRender();
      }
    }
  }, [getCanvasPos, hitTest, transform, photos, width, height, clampGroupRectAwayFromMap, getPhotoBounds, scheduleRender, photosByPlaceKey]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) {
      if (dragRef.current.dragKind === 'group') {
        const nextGroupPhotos = photos
          .filter((photo) => photo.placeKey === dragRef.current!.placeKey)
          .map((photo) => ({
            id: photo.id,
            frameX: photo.frameX,
            frameY: photo.frameY,
          }));
        onGroupLabelDragEnd?.(dragRef.current.placeKey, nextGroupPhotos);
      } else {
        const photo = photos.find(p => p.id === dragRef.current!.photoId);
        if (photo && photo.frameX != null && photo.frameY != null) {
          onPhotoDragEnd?.(dragRef.current.photoId, photo.frameX, photo.frameY);
        }
      }
      dragRef.current = null;
      dragPlaceKeyRef.current = null;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, [photos, onPhotoDragEnd, onGroupLabelDragEnd]);

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
