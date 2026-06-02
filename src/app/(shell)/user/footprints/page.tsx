'use client';

import { createPortal } from 'react-dom';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import OuterFrame from '@/components/OuterFrame';
import FootprintGroupPanel from '@/components/FootprintGroupPanel';
import PhotoAlbumModal from '@/components/PhotoAlbumModal';
import LegendPanel from '@/components/LegendPanel';
import LocalMapModal, { type LocalMappedAssetDraft, type LocalMapLayoutSettings } from '@/components/LocalMapModal';
import { solvePendingGroupPlacements } from '@/components/footprintLayoutSolver';
import type { LogicalOffset, LogicalRect, LogicalSize, PendingPlaceGroup } from '@/components/footprintLayoutTypes';
import type { LineStyle } from '@/components/LegendPanel';
import type { MapMarker } from '@/components/PlanMap';
import {
  buildGroupGeometryFromLayout,
  buildGroupGeometryFromPhotoRect,
  expandPhotoRect,
  resolveGroupLabelLayouts,
  resolveGroupGeometryAsWhole,
  scoreGroupGeometryPlacement,
  translateGroupGeometry,
  type GroupLayoutSnapshot,
} from '@/components/localMapGroupGeometry';
import type { GroupGeometry } from '@/components/localMapGroupGeometry';
import type { Viewport } from '@/lib/outerFrameCoords';
import { buildFootprintPhotoScopeKey, buildMapFootprintPhotoScopeKey } from '@/lib/footprintPhotoScope';
import styles from './footprints.module.css';

const LOCAL_THUMB_MAX_EDGE = 320;
const LOCAL_THUMB_CONCURRENCY = 2;
const LOCAL_MAP_LOADING_MIN_DELAY_MS = 120;

interface FootprintGroup {
  id: number;
  name: string;
  isDefault: number;
  sortOrder: number;
  itemCount: number;
  createdAt?: string;
}

interface FootprintItem {
  id: number;
  listItemId: number | null;
  poiId?: number | null;
  albumScopeKey?: string | null;
  sourceType?: 'list' | 'map';
  title: string;
  coverImage: string | null;
  description: string | null;
  lng: string | null;
  lat: string | null;
  address: string | null;
  listId: number | null;
  listName: string | null;
  addedAt: string;
}

type DebugPhotoSnapshot = {
  index: number;
  left: number | null;
  right: number | null;
  top: number | null;
  bottom: number | null;
  pixelWidth: number | null;
  pixelHeight: number | null;
};

type DebugGroupSnapshot = {
  index: number;
  photoCount: number;
  left: number | null;
  right: number | null;
  top: number | null;
  bottom: number | null;
};

const PHOTO_MAX_EDGE = 120;
const PHOTO_MIN_EDGE = 48;
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createThumbnailFromUrl(url: string, maxEdge = LOCAL_THUMB_MAX_EDGE) {
  return new Promise<{ url: string; width: number; height: number } | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve({ url: URL.createObjectURL(blob), width, height });
      }, 'image/jpeg', 0.82);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function distanceToViewport(photo: PhotoItem, viewport: Viewport | null) {
  if (!viewport) return Math.abs(photo.frameX ?? 0) + Math.abs(photo.frameY ?? 0);
  const x = photo.frameX ?? 0;
  const y = photo.frameY ?? 0;
  const dx = x < viewport.left ? viewport.left - x : x > viewport.right ? x - viewport.right : 0;
  const dy = y < viewport.top ? viewport.top - y : y > viewport.bottom ? y - viewport.bottom : 0;
  return dx + dy;
}

function getPhotoLogicalSize(photo: Pick<PhotoItem, 'pixelWidth' | 'pixelHeight'>): LogicalSize {
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

  return { width: PHOTO_MAX_EDGE, height: PHOTO_MAX_EDGE };
}

function buildGridOffsets(count: number, gapX: number, gapY: number, cardSize: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const stepX = cardSize + gapX;
  const stepY = cardSize + gapY;
  return Array.from({ length: count }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      offsetX: (col - (cols - 1) / 2) * stepX,
      offsetY: (row - (rows - 1) / 2) * stepY,
    };
  });
}

function buildStaggeredOffsets(count: number, gapX: number, gapY: number, cardSize: number, axis: 'horizontal' | 'vertical') {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const stepX = cardSize + gapX;
  const stepY = cardSize + gapY;
  return Array.from({ length: count }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const baseX = (col - (cols - 1) / 2) * stepX;
    const baseY = (row - (rows - 1) / 2) * stepY;
    if (axis === 'horizontal') {
      return { offsetX: baseX, offsetY: baseY + (col % 2 === 1 ? stepY / 2 : 0) };
    }
    return { offsetX: baseX + (row % 2 === 1 ? stepX / 2 : 0), offsetY: baseY };
  });
}

function buildRandomOffsets(count: number, cardSize: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const xMatrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  const yMatrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      if (index >= count) continue;
      if (col > 0) xMatrix[row][col] = xMatrix[row][col - 1] + cardSize * 2 + randomInt(10, 60);
      if (row > 0) yMatrix[row][col] = yMatrix[row - 1][col] + cardSize * 2 + randomInt(10, 60);
    }
  }
  const points = Array.from({ length: count }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return { x: xMatrix[row][col], y: yMatrix[row][col] };
  });
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return points.map((point) => ({
    offsetX: point.x - centerX,
    offsetY: point.y - centerY,
  }));
}

function buildPlaceGeometry(placePhotos: PhotoItem[], scale = 1) {
  return buildGroupGeometryFromLayout(
    placePhotos[0]?.placeKey || '',
    placePhotos,
    getPhotoLogicalSize,
    scale,
    [],
  );
}

function buildOffsetGroupGeometry(placePhotos: PhotoItem[], offsets: LogicalOffset[], scale = 1) {
  if (placePhotos.length === 0 || offsets.length !== placePhotos.length) return null;

  const photoRect = expandPhotoRect({
    left: Math.min(...offsets.map((item, index) => item.offsetX - getPhotoLogicalSize(placePhotos[index]).width / 2)),
    right: Math.max(...offsets.map((item, index) => item.offsetX + getPhotoLogicalSize(placePhotos[index]).width / 2)),
    top: Math.min(...offsets.map((item, index) => item.offsetY - getPhotoLogicalSize(placePhotos[index]).height / 2)),
    bottom: Math.max(...offsets.map((item, index) => item.offsetY + getPhotoLogicalSize(placePhotos[index]).height / 2)),
  });

  return buildGroupGeometryFromPhotoRect(
    photoRect,
    placePhotos[0]?.placeTitle || '',
    placePhotos.length,
    scale,
  );
}

function solveFrozenGroupLayouts(
  photos: PhotoItem[],
  scale: number,
  mapRect?: LogicalRect,
  existingLayouts: GroupLayoutSnapshot[] = [],
) {
  const groups = new Map<string, PhotoItem[]>();
  for (const photo of photos) {
    if (photo.frameX == null || photo.frameY == null) continue;
    const arr = groups.get(photo.placeKey) || [];
    arr.push(photo);
    groups.set(photo.placeKey, arr);
  }

  const entries: Array<{ placeKey: string; geometry: GroupGeometry; title: string; photoCount: number; scale: number }> = [];
  for (const [placeKey, groupPhotos] of groups) {
    const geometry = buildGroupGeometryFromLayout(placeKey, groupPhotos, getPhotoLogicalSize, scale, existingLayouts);
    if (!geometry) continue;
    entries.push({
      placeKey,
      geometry,
      title: groupPhotos[0]?.placeTitle || '',
      photoCount: groupPhotos.length,
      scale,
    });
  }

  return resolveGroupLabelLayouts(entries, {
    gap: 10,
    mapRect,
    mapGap: 80,
    labelGapBoost: computeLabelGapBoost(scale),
    step: 8,
    maxOffset: 120,
  });
}

function buildOffsetsForLayout(
  count: number,
  layout: LocalMapLayoutSettings,
  cardSize: number,
): LogicalOffset[] {
  if (layout.mode === 'grid') {
    return buildGridOffsets(count, layout.gapX, layout.gapY, cardSize);
  }
  if (layout.mode === 'staggered') {
    return buildStaggeredOffsets(count, layout.gapX, layout.gapY, cardSize, layout.staggerAxis);
  }
  return buildRandomOffsets(count, cardSize);
}

function rectCenter(rect: LogicalRect) {
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  };
}

function fitsGroupAroundMap(rect: LogicalRect, mapRect: LogicalRect, gap: number) {
  return (
    rect.right <= mapRect.left - gap ||
    rect.left >= mapRect.right + gap ||
    rect.bottom <= mapRect.top - gap ||
    rect.top >= mapRect.bottom + gap
  );
}

function buildDebugPhotoSnapshot(photos: PhotoItem[]): DebugPhotoSnapshot[] {
  return photos
    .slice()
    .sort((a, b) => a.placeTitle.localeCompare(b.placeTitle, 'zh-CN') || String(a.id).localeCompare(String(b.id), 'zh-CN'))
    .map((photo, index) => {
      const size = getPhotoLogicalSize(photo);
      const left = photo.frameX == null ? null : Number((photo.frameX - size.width / 2).toFixed(2));
      const right = photo.frameX == null ? null : Number((photo.frameX + size.width / 2).toFixed(2));
      const top = photo.frameY == null ? null : Number((photo.frameY - size.height / 2).toFixed(2));
      const bottom = photo.frameY == null ? null : Number((photo.frameY + size.height / 2).toFixed(2));
      return {
        index: index + 1,
        left,
        right,
        top,
        bottom,
        pixelWidth: photo.pixelWidth ?? null,
        pixelHeight: photo.pixelHeight ?? null,
      };
    });
}

function buildDebugGroupSnapshot(photos: PhotoItem[]): DebugGroupSnapshot[] {
  const groups = new Map<string, PhotoItem[]>();
  for (const photo of photos) {
    const group = groups.get(photo.placeKey) || [];
    group.push(photo);
    groups.set(photo.placeKey, group);
  }

  return Array.from(groups.entries())
    .sort((a, b) => (a[1][0]?.placeTitle || '').localeCompare(b[1][0]?.placeTitle || '', 'zh-CN') || a[0].localeCompare(b[0], 'zh-CN'))
    .map(([_, groupPhotos], index) => {
      const geometry = buildPlaceGeometry(groupPhotos);
      return {
        index: index + 1,
        photoCount: groupPhotos.length,
        left: geometry ? Number(geometry.overallRect.left.toFixed(2)) : null,
        right: geometry ? Number(geometry.overallRect.right.toFixed(2)) : null,
        top: geometry ? Number(geometry.overallRect.top.toFixed(2)) : null,
        bottom: geometry ? Number(geometry.overallRect.bottom.toFixed(2)) : null,
      };
    });
}

function applySizedOffsets(
  placePhotos: PhotoItem[],
  offsets: LogicalOffset[],
  gapX: number,
  gapY: number,
) {
  if (placePhotos.length === 0) return;

  const xAnchors = new Map<number, Array<{ index: number; width: number }>>();
  const yAnchors = new Map<number, Array<{ index: number; height: number }>>();

  for (let i = 0; i < offsets.length; i++) {
    const size = getPhotoLogicalSize(placePhotos[i]);
    const xKey = Math.round(offsets[i].offsetX);
    const yKey = Math.round(offsets[i].offsetY);
    const xGroup = xAnchors.get(xKey) || [];
    xGroup.push({ index: i, width: size.width });
    xAnchors.set(xKey, xGroup);
    const yGroup = yAnchors.get(yKey) || [];
    yGroup.push({ index: i, height: size.height });
    yAnchors.set(yKey, yGroup);
  }

  const sizedOffsets = offsets.map((offset) => ({ ...offset }));

  for (const [, group] of xAnchors) {
    group.sort((a, b) => offsets[a.index].offsetY - offsets[b.index].offsetY);
    let cursor = 0;
    for (let i = 0; i < group.length; i++) {
      const current = group[i];
      const prev = group[i - 1];
      if (!prev) {
        sizedOffsets[current.index].offsetY = offsets[current.index].offsetY;
        cursor = sizedOffsets[current.index].offsetY + getPhotoLogicalSize(placePhotos[current.index]).height / 2;
        continue;
      }
      const prevHeight = getPhotoLogicalSize(placePhotos[prev.index]).height;
      const currentHeight = getPhotoLogicalSize(placePhotos[current.index]).height;
      cursor += prevHeight / 2 + gapY + currentHeight / 2;
      sizedOffsets[current.index].offsetY = cursor;
    }
  }

  for (const [, group] of yAnchors) {
    group.sort((a, b) => offsets[a.index].offsetX - offsets[b.index].offsetX);
    let cursor = 0;
    for (let i = 0; i < group.length; i++) {
      const current = group[i];
      const prev = group[i - 1];
      if (!prev) {
        sizedOffsets[current.index].offsetX = offsets[current.index].offsetX;
        cursor = sizedOffsets[current.index].offsetX + getPhotoLogicalSize(placePhotos[current.index]).width / 2;
        continue;
      }
      const prevWidth = getPhotoLogicalSize(placePhotos[prev.index]).width;
      const currentWidth = getPhotoLogicalSize(placePhotos[current.index]).width;
      cursor += prevWidth / 2 + gapX + currentWidth / 2;
      sizedOffsets[current.index].offsetX = cursor;
    }
  }

  const minX = Math.min(...sizedOffsets.map((item, index) => item.offsetX - getPhotoLogicalSize(placePhotos[index]).width / 2));
  const maxX = Math.max(...sizedOffsets.map((item, index) => item.offsetX + getPhotoLogicalSize(placePhotos[index]).width / 2));
  const minY = Math.min(...sizedOffsets.map((item, index) => item.offsetY - getPhotoLogicalSize(placePhotos[index]).height / 2));
  const maxY = Math.max(...sizedOffsets.map((item, index) => item.offsetY + getPhotoLogicalSize(placePhotos[index]).height / 2));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return sizedOffsets.map((item) => ({
    offsetX: item.offsetX - centerX,
    offsetY: item.offsetY - centerY,
  }));
}

function computeLabelGapBoost(scale: number) {
  if (scale >= 4.5) return 20;
  if (scale >= 3) return 12;
  if (scale >= 2) return 6;
  return 0;
}

export default function UserFootprintsPage() {
  return (
    <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#0f172a' }} />}>
      <UserFootprintsPageInner />
    </Suspense>
  );
}

function UserFootprintsPageInner() {
  const searchParams = useSearchParams();
  const viewToken = searchParams.get('view');

  // If view token present, use view API instead of regular API
  const isViewMode = !!(viewToken);
  const viewApiBase = isViewMode ? `/api/footprints/view?token=${encodeURIComponent(viewToken)}` : '';

  const [showLines, setShowLines] = useState(true);
  const [showPhotos, setShowPhotos] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showPoiLabels, setShowPoiLabels] = useState(true);
  const [poiLabelColor, setPoiLabelColor] = useState('#000000');
  const [markerColor, setMarkerColor] = useState('#ef4444');
  const [markerShape, setMarkerShape] = useState('pin');
  const [showTitle, setShowTitle] = useState(true);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [legendCollapsed, setLegendCollapsed] = useState(true);
  const [backgroundColor, setBackgroundColor] = useState('#0f172a');
  const [lineStyle, setLineStyle] = useState<LineStyle>({ color: '#a5b4fc', width: 2, dashed: true });
  const [outerScale, setOuterScale] = useState(1);
  const [outerViewport, setOuterViewport] = useState<Viewport | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [groups, setGroups] = useState<FootprintGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [items, setItems] = useState<FootprintItem[]>([]);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [groupLayouts, setGroupLayouts] = useState<GroupLayoutSnapshot[]>([]);
  const [poiPoints, setPoiPoints] = useState<PoiPoint[]>([]);
  const [photosLoaded, setPhotosLoaded] = useState(false);
  const [focusPosition, setFocusPosition] = useState<[number, number] | null>(null);
  const [albumItem, setAlbumItem] = useState<FootprintItem | null>(null);
  const [viewerPhoto, setViewerPhoto] = useState<{ url: string; title: string } | null>(null);
  const [hasMovedPhotos, setHasMovedPhotos] = useState(false);
  const [localMapOpen, setLocalMapOpen] = useState(false);
  const [localMapTargetItem, setLocalMapTargetItem] = useState<FootprintItem | null>(null);
  const [localRootName, setLocalRootName] = useState<string | null>(null);
  const [localUnmatchedFolders, setLocalUnmatchedFolders] = useState<string[]>([]);
  const [localLayout, setLocalLayout] = useState<LocalMapLayoutSettings | null>(null);
  const [knownLocalRoots, setKnownLocalRoots] = useState<string[]>([]);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isApplyingLocalMap, setIsApplyingLocalMap] = useState(false);
  const [localMapApplyProgress, setLocalMapApplyProgress] = useState(0);
  const [fitViewKey, setFitViewKey] = useState(0);
  const [fitViewEnabled, setFitViewEnabled] = useState(false);
  const [debugBasePhotos, setDebugBasePhotos] = useState<DebugPhotoSnapshot[] | null>(null);
  const [debugBaseGroups, setDebugBaseGroups] = useState<DebugGroupSnapshot[] | null>(null);
  const [shareAlbumPrompt, setShareAlbumPrompt] = useState<{
    item: FootprintItem;
    groupId: number;
    count: number;
  } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  const movedPhotosRef = useRef<boolean>(false);
  const localThumbQueueRef = useRef<Array<{ id: string; originalUrl: string }>>([]);
  const localThumbRunningRef = useRef(0);
  const localThumbSeenRef = useRef<Set<string>>(new Set());
  const localOriginalPreloadRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const actionNoticeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Load settings
  useEffect(() => {
    if (isViewMode) {
      fetch(`${viewApiBase}&type=settings`)
        .then(r => r.json())
        .then(d => {
          setShowPhotos(d.showPhotos);
          setShowLines(d.showLines);
          setShowLabels(d.showLabels);
          setShowPoiLabels(d.showPoiLabels);
          setPoiLabelColor(d.poiLabelColor ?? '#000000');
          setMarkerColor(d.markerColor ?? '#ef4444');
          setMarkerShape(d.markerShape ?? 'pin');
          setShowTitle(d.showTitle);
          setPanelCollapsed(d.panelCollapsed);
          setBackgroundColor(d.backgroundColor);
          setLineStyle({ color: d.lineColor, width: d.lineWidth, dashed: d.lineDashed });
        })
        .catch(() => {})
        .finally(() => setSettingsLoaded(true));
    } else {
      fetch('/api/footprints/settings', { credentials: 'include' })
        .then(r => r.json())
        .then(d => {
          setShowPhotos(d.showPhotos);
          setShowLines(d.showLines);
          setShowLabels(d.showLabels);
          setShowPoiLabels(d.showPoiLabels);
          setPoiLabelColor(d.poiLabelColor ?? '#000000');
          setMarkerColor(d.markerColor ?? '#ef4444');
          setMarkerShape(d.markerShape ?? 'pin');
          setShowTitle(d.showTitle);
          setPanelCollapsed(d.panelCollapsed);
          setBackgroundColor(d.backgroundColor);
          setLineStyle({ color: d.lineColor, width: d.lineWidth, dashed: d.lineDashed });
        })
        .catch(() => {})
        .finally(() => setSettingsLoaded(true));
    }
  }, []);

  // Save settings (debounced) — only in non-admin mode
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!settingsLoaded || isViewMode) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch('/api/footprints/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          showPhotos,
          showLines,
          showLabels,
          showPoiLabels,
          poiLabelColor,
          markerColor,
          markerShape,
          showTitle,
          panelCollapsed,
          backgroundColor,
          lineColor: lineStyle.color,
          lineWidth: lineStyle.width,
          lineDashed: lineStyle.dashed,
        }),
      }).catch(() => {});
    }, 500);
  }, [showPhotos, showLines, showLabels, showPoiLabels, poiLabelColor, markerColor, markerShape, showTitle, panelCollapsed, backgroundColor, lineStyle, settingsLoaded]);

  useEffect(() => { loadGroups(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    clearTimeout(actionNoticeTimerRef.current);
  }, []);

  useEffect(() => {
    if (selectedGroupId) {
      localOriginalPreloadRef.current.clear();
      localThumbQueueRef.current = [];
      localThumbSeenRef.current.clear();
      setPhotos((current) => {
        current
          .filter((photo) => photo.sourceType === 'local-mapped' && photo.thumbnailUrl)
          .forEach((photo) => {
            try {
              URL.revokeObjectURL(photo.thumbnailUrl!);
            } catch {}
          });
        return [];
      });
      setGroupLayouts([]);
      setItems([]);
      loadItems(selectedGroupId);
      setPhotosLoaded(false);
      setFitViewEnabled(false);
    } else {
      localOriginalPreloadRef.current.clear();
      localThumbQueueRef.current = [];
      localThumbSeenRef.current.clear();
      setItems([]);
      setPhotos([]);
      setGroupLayouts([]);
      setFitViewEnabled(false);
      setDebugBasePhotos(null);
      setDebugBaseGroups(null);
    }
  }, [selectedGroupId]);

  // Auto-load photos when items change
  useEffect(() => {
    if (items.length > 0 && !photosLoaded) {
      loadAllPhotos();
    }
  }, [items, photosLoaded]);

  useEffect(() => {
    const ms: MapMarker[] = items
      .filter(it => it.lng && it.lat)
      .map(it => ({
        id: buildFootprintPhotoScopeKey(it.id),
        position: [parseFloat(it.lng!), parseFloat(it.lat!)] as [number, number],
        title: it.title,
        address: it.address || undefined,
        description: it.description || undefined,
      }));
    setMarkers(ms);
  }, [items]);

  useEffect(() => {
    if (isViewMode) return;
    fetch('/api/footprints/local-map', {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!data) return;
        setKnownLocalRoots(Array.isArray(data.knownRootNames) ? data.knownRootNames : []);
      })
      .catch(() => {});
  }, [isViewMode]);

  // --- API calls ---

  async function loadGroups() {
    try {
      const url = isViewMode
        ? `${viewApiBase}&type=groups`
        : '/api/footprints/groups';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setGroups(data.groups || []);
      if (data.groups?.length > 0 && !selectedGroupId) {
        const dg = data.groups.find((g: FootprintGroup) => g.isDefault === 1);
        setSelectedGroupId(dg?.id ?? data.groups[0].id);
      }
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
  }

  async function loadItems(groupId: number) {
    try {
      const url = isViewMode
        ? `${viewApiBase}&type=items&group_id=${groupId}`
        : `/api/footprints/groups/${groupId}/items`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error('Failed to load items:', err);
    }
  }

  const showActionNotice = useCallback((message: string) => {
    clearTimeout(actionNoticeTimerRef.current);
    setActionNotice(message);
    actionNoticeTimerRef.current = setTimeout(() => {
      setActionNotice(null);
    }, 3000);
  }, []);

  const updateGroupCount = useCallback((groupId: number, delta: number) => {
    setGroups((current) => current.map((group) => (
      group.id === groupId
        ? { ...group, itemCount: Math.max(0, Number(group.itemCount || 0) + delta) }
        : group
    )));
  }, []);

  const removeItemsLocally = useCallback((groupId: number, targetItems: FootprintItem[]) => {
    if (selectedGroupId !== groupId || targetItems.length === 0) return;
    const targetKeys = new Set(targetItems.map((item) => `${item.listItemId ? `list:${item.listItemId}` : `map:${item.poiId}`}`));
    const removedScopeKeys = new Set(
      targetItems.map((item) => item.albumScopeKey || (item.listItemId ? buildFootprintPhotoScopeKey(item.id) : buildMapFootprintPhotoScopeKey(item.poiId ?? item.id))),
    );
    setItems((current) => current.filter((item) => !targetKeys.has(`${item.listItemId ? `list:${item.listItemId}` : `map:${item.poiId}`}`)));
    setPhotos((current) => current.filter((photo) => photo.sourceType === 'local-mapped' || !removedScopeKeys.has(photo.placeKey)));
  }, [selectedGroupId]);

  const loadAllPhotos = useCallback(async () => {
    if (items.length === 0 || photosLoaded) return;
    setPhotosLoaded(true);

    const itemScopes = new Map(items.map((item) => [item.id, item.albumScopeKey || (item.listItemId ? buildFootprintPhotoScopeKey(item.id) : buildMapFootprintPhotoScopeKey(item.poiId ?? item.id))]));
    const itemKeys = new Set(itemScopes.values());
    const allPhotos: PhotoItem[] = photos
      .filter((photo) => photo.sourceType === 'local-mapped')
      .filter((photo) => itemKeys.has(photo.placeKey))
      .map((photo) => ({ ...photo }));

    if (isViewMode) {
      try {
        const res = await fetch(`${viewApiBase}&type=photos&group_id=${selectedGroupId ?? ''}`);
        if (res.ok) {
          const data = await res.json();
          for (const f of data.files || []) {
            if (!f.scopeKey || !itemKeys.has(f.scopeKey)) continue;
            const uid = f.userId || 0;
            allPhotos.push({
              id: f.id,
              url: `/api/storage/file?uid=${uid}&place=${encodeURIComponent(f.scopeKey)}&file=${encodeURIComponent(f.filename)}`,
              frameX: f.frameX ?? undefined,
              frameY: f.frameY ?? undefined,
              placeKey: f.scopeKey,
              placeTitle: f.displayTitle || f.placeTitle,
              footprintItemId: f.footprintItemId ?? undefined,
              filename: f.filename,
              size: f.size ?? undefined,
              lastModified: f.createdAt ? new Date(f.createdAt).getTime() : undefined,
              pixelWidth: f.pixelWidth ?? undefined,
              pixelHeight: f.pixelHeight ?? undefined,
              sourceType: 'uploaded',
            });
          }
        }
      } catch { /* skip */ }
    } else {
      for (const item of items) {
        const scopeKey = item.albumScopeKey || (item.listItemId ? buildFootprintPhotoScopeKey(item.id) : buildMapFootprintPhotoScopeKey(item.poiId ?? item.id));
        try {
          const res = await fetch(
            `/api/storage/photos?scope_key=${encodeURIComponent(scopeKey)}&footprint_item_id=${encodeURIComponent(String(item.listItemId ? item.id : ''))}&place_title=${encodeURIComponent(item.title)}`,
            { credentials: 'include' },
          );
          if (!res.ok) continue;
          const data = await res.json();
          for (const p of data.photos || []) {
            allPhotos.push({
              id: p.id,
              url: p.url,
              frameX: p.frameX ?? undefined,
              frameY: p.frameY ?? undefined,
              placeKey: p.scopeKey || scopeKey,
              placeTitle: item.title,
              footprintItemId: item.id,
              filename: p.filename,
              size: p.size ?? undefined,
              lastModified: p.createdAt ? new Date(p.createdAt).getTime() : undefined,
              pixelWidth: p.pixelWidth ?? undefined,
              pixelHeight: p.pixelHeight ?? undefined,
              sourceType: 'uploaded',
            });
          }
        } catch { /* skip */ }
      }
    }

    // Auto-place photos without existing positions and persist
    const unplaced = allPhotos.filter(p => p.frameX == null || p.frameY == null);
    if (unplaced.length > 0) {
      autoPlacePhotos(unplaced);
      // Persist auto-placed positions
      const uploadedUnplaced = unplaced
        .filter((photo) => photo.sourceType !== 'local-mapped')
        .map(p => ({ id: p.id, frameX: p.frameX, frameY: p.frameY }));
      if (uploadedUnplaced.length > 0) {
        fetch('/api/storage/photos/0/position', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ updates: uploadedUnplaced }),
        }).catch(() => {});
      }
    }

    setPhotos(allPhotos);
    setGroupLayouts((current) => Array.from(solveFrozenGroupLayouts(allPhotos, 1, undefined, current).values()));
    setDebugBasePhotos(buildDebugPhotoSnapshot(allPhotos));
    setDebugBaseGroups(buildDebugGroupSnapshot(allPhotos));
  }, [items, photosLoaded, photos, isViewMode, viewApiBase, selectedGroupId, poiPoints]);

  function autoPlacePhotos(
    unplaced: PhotoItem[],
    referencePhotos: PhotoItem[] = photos,
    layout: LocalMapLayoutSettings = { enabled: true, mode: 'grid', gapX: 20, gapY: 20, staggerAxis: 'horizontal' },
  ) {
    if (unplaced.length === 0) return;

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

    const byPlace = new Map<string, PhotoItem[]>();
    for (const p of unplaced) {
      const arr = byPlace.get(p.placeKey) || [];
      arr.push(p);
      byPlace.set(p.placeKey, arr);
    }
    const logicalPointByPlaceKey = new Map<string, { x: number; y: number }>(
      poiPoints.map((point) => [point.placeKey, { x: point.logicalX, y: point.logicalY }]),
    );

    const cardSize = 80;
    const collisionScale = Math.max(outerScale, 0.1);
    const mapRect = {
      left: -(viewportWidth * 0.6) / 2,
      right: (viewportWidth * 0.6) / 2,
      top: -(viewportHeight * 0.8) / 2,
      bottom: (viewportHeight * 0.8) / 2,
    };
    const occupiedGeometries: GroupGeometry[] = [];

    const existingGroups = new Map<string, PhotoItem[]>();
    for (const photo of referencePhotos) {
      if (photo.frameX == null || photo.frameY == null) continue;
      const arr = existingGroups.get(photo.placeKey) || [];
      arr.push(photo);
      existingGroups.set(photo.placeKey, arr);
    }
    const existingGeometryEntries: Array<{ id: string; geometry: GroupGeometry }> = [];
    for (const [placeKey, group] of existingGroups) {
      const geometry = buildPlaceGeometry(group, collisionScale);
      if (!geometry) continue;
      existingGeometryEntries.push({ id: placeKey, geometry });
    }
    const resolvedExistingGeometryMap = resolveGroupGeometryAsWhole(
      existingGeometryEntries.map((entry) => ({
        id: entry.id,
        geometry: entry.geometry,
      })),
      { gap: 10, mapRect, mapGap: cardSize, labelGapBoost: 8 },
    );
    for (const [, geometry] of resolvedExistingGeometryMap) {
      occupiedGeometries.push(geometry);
    }

    const pendingNewGroups: PendingPlaceGroup[] = [];

    for (const [placeKey, placePhotos] of byPlace) {
      const placedPhotos = referencePhotos.filter((photo) => {
        if (photo.placeKey !== placePhotos[0].placeKey) return false;
        if (photo.frameX == null || photo.frameY == null) return false;
        return !placePhotos.some((candidate) => candidate.id === photo.id);
      });
      const rawOffsets = buildOffsetsForLayout(placePhotos.length, layout, cardSize);
      const offsets = applySizedOffsets(placePhotos, rawOffsets, layout.gapX, layout.gapY);
      const offsetGeometry = buildOffsetGroupGeometry(placePhotos, offsets, collisionScale);
      if (!offsetGeometry) continue;
      if (placedPhotos.length > 0) {
        const existingGeometry = resolvedExistingGeometryMap.get(placeKey) ?? buildPlaceGeometry(placedPhotos, collisionScale);
        if (!existingGeometry) continue;
        const existingCenter = rectCenter(existingGeometry.photoRect);
        const directionX = existingCenter.x || 0;
        const directionY = existingCenter.y || 1;
        const directionLen = Math.hypot(directionX, directionY) || 1;
        const unitX = directionX / directionLen;
        const unitY = directionY / directionLen;
        const perpendicularX = -unitY;
        const perpendicularY = unitX;
        const expansionBase = Math.max(cardSize, layout.gapX + layout.gapY);

        const candidateCenterX = existingCenter.x + unitX * expansionBase;
        const candidateCenterY = existingCenter.y + unitY * expansionBase;
        const nextGeometry = translateGroupGeometry(offsetGeometry, candidateCenterX, candidateCenterY);
        const occupiedByOthers = occupiedGeometries.filter((geometry) => geometry !== existingGeometry);
        const canExpandOutward =
          fitsGroupAroundMap(nextGeometry.overallRect, mapRect, cardSize) &&
          scoreGroupGeometryPlacement(nextGeometry, occupiedByOthers, cardSize) === 0;

        if (!canExpandOutward) {
          const fitOffsets = applySizedOffsets(placePhotos, rawOffsets, layout.gapX, layout.gapY);
          for (let i = 0; i < placePhotos.length; i++) {
            placePhotos[i].frameX = existingCenter.x + fitOffsets[i].offsetX;
            placePhotos[i].frameY = existingCenter.y + fitOffsets[i].offsetY;
          }
        } else {
          for (let i = 0; i < placePhotos.length; i++) {
            const forwardOffset = expansionBase + offsets[i].offsetY;
            const lateralOffset = offsets[i].offsetX;
            placePhotos[i].frameX = existingCenter.x + unitX * forwardOffset + perpendicularX * lateralOffset;
            placePhotos[i].frameY = existingCenter.y + unitY * forwardOffset + perpendicularY * lateralOffset;
          }
        }
        const placedGeometry = buildPlaceGeometry(placePhotos, collisionScale);
        if (placedGeometry) {
          occupiedGeometries.push(placedGeometry);
        }
        continue;
      }

      pendingNewGroups.push({
        placeKey,
        placePhotos,
        collisionGeometry: offsetGeometry,
        collisionRect: offsetGeometry.overallRect,
        logicalX: logicalPointByPlaceKey.get(placeKey)?.x ?? 0,
        logicalY: logicalPointByPlaceKey.get(placeKey)?.y ?? 0,
        offsets,
      });
    }

    const solvedPendingGroups = solvePendingGroupPlacements(
      pendingNewGroups,
      mapRect,
      cardSize,
      computeLabelGapBoost(outerScale),
    );
    const placementById = solvedPendingGroups.placements;

    for (const group of pendingNewGroups) {
      const chosenCenter = placementById.get(group.placeKey);
      if (!chosenCenter) continue;
      for (let i = 0; i < group.placePhotos.length; i++) {
        group.placePhotos[i].frameX = chosenCenter.centerX + group.offsets[i].offsetX;
        group.placePhotos[i].frameY = chosenCenter.centerY + group.offsets[i].offsetY;
      }

      const placedGeometry = buildPlaceGeometry(group.placePhotos, collisionScale);
      if (placedGeometry) {
        occupiedGeometries.push(placedGeometry);
      }
    }

    const finalPlacedPhotos = referencePhotos.filter((photo) => photo.frameX != null && photo.frameY != null);
    const nextLayouts = Array.from(solveFrozenGroupLayouts(finalPlacedPhotos, collisionScale, mapRect, groupLayouts).values());
    setGroupLayouts(nextLayouts);
  }

  // --- Map handlers ---

  function handleMapMarkerClick(marker: MapMarker) {
    if (marker.position) setFocusPosition(marker.position);
  }

  // --- Photo handlers ---

  const handlePhotoDragEnd = useCallback(async (photoId: number | string, x: number, y: number) => {
    movedPhotosRef.current = true;
    setHasMovedPhotos(true);
    setGroupLayouts((current) => Array.from(solveFrozenGroupLayouts(photos, 1, undefined, current).values()));
  }, [photos]);

  const handlePhotoMoved = useCallback(() => {
    movedPhotosRef.current = true;
    setHasMovedPhotos(true);
    setGroupLayouts((current) => Array.from(solveFrozenGroupLayouts(photos, 1, undefined, current).values()));
  }, [photos]);

  const handleGroupLabelDragEnd = useCallback((_placeKey: string, dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return;
    movedPhotosRef.current = true;
    setHasMovedPhotos(true);
    setGroupLayouts((current) => Array.from(solveFrozenGroupLayouts(photos, 1, undefined, current).values()));
  }, [photos]);

  const handleSavePositions = useCallback(async () => {
    if (!movedPhotosRef.current) return;
    const uploadedUpdates = photos
      .filter(p => p.sourceType !== 'local-mapped')
      .filter(p => p.frameX != null && p.frameY != null)
      .map(p => ({ id: p.id, frameX: p.frameX!, frameY: p.frameY! }));
    const localAssets = photos
      .filter(p => p.sourceType === 'local-mapped')
      .filter(p => p.frameX != null && p.frameY != null)
      .map(p => ({
        relativePath: p.relativePath,
        folderName: p.placeTitle,
        name: p.filename,
        size: p.size ?? 0,
        lastModified: p.lastModified ?? 0,
        matchedPlaceTitle: p.placeTitle,
        footprintItemId: p.footprintItemId ?? 0,
        frameX: p.frameX!,
        frameY: p.frameY!,
        missing: false,
        pixelWidth: p.pixelWidth ?? null,
        pixelHeight: p.pixelHeight ?? null,
      }));

    if (uploadedUpdates.length === 0 && localAssets.length === 0) return;
    try {
      if (uploadedUpdates.length > 0) {
        const res = await fetch('/api/storage/photos/0/position', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ updates: uploadedUpdates }),
        });
        if (!res.ok) {
          const d = await res.json();
          alert(d.error || '保存失败');
          return;
        }
      }

      if (localRootName) {
        const res = await fetch('/api/footprints/local-map', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            rootName: localRootName,
            assets: localAssets,
            unmatchedFolders: localUnmatchedFolders,
            layout: localLayout,
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          alert(d.error || '本地映射保存失败');
          return;
        }
      }
      movedPhotosRef.current = false;
      setHasMovedPhotos(false);
    } catch { alert('保存失败'); }
  }, [photos, localLayout, localRootName, localUnmatchedFolders]);

  const handlePhotoClick = useCallback((photoId: number | string) => {
    const p = photos.find(x => x.id === photoId);
    if (p) setViewerPhoto({ url: p.url, title: p.filename });
  }, [photos]);

  const pumpLocalThumbnailQueue = useCallback(() => {
    while (localThumbRunningRef.current < LOCAL_THUMB_CONCURRENCY && localThumbQueueRef.current.length > 0) {
      const next = localThumbQueueRef.current.shift();
      if (!next) return;
      localThumbRunningRef.current += 1;
      void createThumbnailFromUrl(next.originalUrl).then((thumb) => {
        if (!thumb) return;
        setPhotos((current) => current.map((photo) => {
          if (String(photo.id) !== next.id || photo.sourceType !== 'local-mapped') return photo;
          return {
            ...photo,
            thumbnailUrl: thumb.url,
            pixelWidth: photo.pixelWidth ?? thumb.width,
            pixelHeight: photo.pixelHeight ?? thumb.height,
          };
        }));
      }).finally(() => {
        localThumbRunningRef.current -= 1;
        pumpLocalThumbnailQueue();
      });
    }
  }, []);

  const enqueueLocalThumbnails = useCallback((localPhotos: PhotoItem[]) => {
    for (const photo of localPhotos) {
      const photoId = String(photo.id);
      if (localThumbSeenRef.current.has(photoId)) continue;
      if (photo.thumbnailUrl) continue;
      localThumbSeenRef.current.add(photoId);
      localThumbQueueRef.current.push({ id: photoId, originalUrl: photo.url });
    }
    pumpLocalThumbnailQueue();
  }, [pumpLocalThumbnailQueue]);

  useEffect(() => {
    if (localThumbQueueRef.current.length <= 1) return;
    const photoById = new Map(
      photos
        .filter((photo) => photo.sourceType === 'local-mapped')
        .map((photo) => [String(photo.id), photo]),
    );
    localThumbQueueRef.current.sort((a, b) => {
      const photoA = photoById.get(a.id);
      const photoB = photoById.get(b.id);
      const distanceA = photoA ? distanceToViewport(photoA, outerViewport) : Number.POSITIVE_INFINITY;
      const distanceB = photoB ? distanceToViewport(photoB, outerViewport) : Number.POSITIVE_INFINITY;
      return distanceA - distanceB;
    });
  }, [photos, outerScale, outerViewport]);

  useEffect(() => {
    if (outerScale < 3.5) return;
    const candidates = photos
      .filter((photo) => photo.sourceType === 'local-mapped')
      .filter((photo) => !!photo.thumbnailUrl)
      .sort((a, b) => {
        const distanceA = distanceToViewport(a, outerViewport);
        const distanceB = distanceToViewport(b, outerViewport);
        return distanceA - distanceB;
      })
      .slice(0, 24);

    for (const photo of candidates) {
      const photoId = String(photo.id);
      if (localOriginalPreloadRef.current.has(photoId)) continue;
      const img = new Image();
      img.src = photo.url;
      localOriginalPreloadRef.current.set(photoId, img);
    }
  }, [photos, outerScale, outerViewport]);

  // --- Item actions from panel ---

  const handleRemoveItemFromGroup = useCallback(async (
    groupId: number,
    item: FootprintItem,
    options?: { skipConfirm?: boolean },
  ) => {
    if (!options?.skipConfirm && !confirm(`确定从本组移除「${item.title}」？`)) return;
    try {
      if (!item.listItemId) {
        if (!item.poiId) return;
        await fetch(`/api/footprints/groups/${groupId}/items?poi_id=${item.poiId}`, {
          method: 'DELETE', credentials: 'include',
        });
      } else {
        await fetch(`/api/footprints/groups/${groupId}/items?item_id=${item.listItemId}`, {
          method: 'DELETE', credentials: 'include',
        });
      }
      removeItemsLocally(groupId, [item]);
      updateGroupCount(groupId, -1);
      showActionNotice(`已从当前组删除「${item.title}」`);
    } catch {
      alert('移除失败');
    }
  }, [removeItemsLocally, showActionNotice, updateGroupCount]);

  const handleBulkRemoveItemsFromGroup = useCallback(async (groupId: number, targetItems: FootprintItem[]) => {
    if (targetItems.length === 0) return;
    try {
      const listItemIds = targetItems
        .map((item) => item.listItemId)
        .filter((value): value is number => Number.isFinite(value));
      const poiIds = targetItems
        .map((item) => item.poiId)
        .filter((value): value is number => Number.isFinite(value));

      const res = await fetch(`/api/footprints/groups/${groupId}/items`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          list_item_ids: listItemIds,
          poi_ids: poiIds,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.error || '批量移除失败');
        return;
      }
      removeItemsLocally(groupId, targetItems);
      updateGroupCount(groupId, -targetItems.length);
      showActionNotice(`已删除 ${targetItems.length} 个地点`);
    } catch {
      alert('批量移除失败');
    }
  }, [removeItemsLocally, showActionNotice, updateGroupCount]);

  const handleRemoveItem = useCallback((item: FootprintItem) => {
    if (!selectedGroupId) return;
    handleRemoveItemFromGroup(selectedGroupId, item);
  }, [selectedGroupId, handleRemoveItemFromGroup]);

  const handleOpenAlbum = useCallback((item: FootprintItem) => {
    setAlbumItem(item);
  }, [loadAllPhotos]);

  const handleAlbumPhotosDeleted = useCallback((photoIds: number[]) => {
    setPhotos((current) => current.filter((photo) => !photoIds.includes(Number(photo.id))));
  }, []);

  const handleUploadPhotoForItem = useCallback(async (item: FootprintItem) => {
    const scopeKey = item.albumScopeKey || (item.listItemId ? buildFootprintPhotoScopeKey(item.id) : buildMapFootprintPhotoScopeKey(item.poiId ?? item.id));
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = async () => {
      if (!input.files?.length) { document.body.removeChild(input); return; }
      const form = new FormData();
      form.append('scope_key', scopeKey);
      form.append('footprint_item_id', String(item.listItemId ? item.id : ''));
      form.append('place_title', item.title);
      for (const f of Array.from(input.files)) form.append('files', f);
      try {
        const res = await fetch('/api/storage/upload', { method: 'POST', credentials: 'include', body: form });
        if (!res.ok) { const d = await res.json(); alert(d.error || '上传失败'); return; }
        setPhotosLoaded(false);
        setPhotos((current) => current.filter((photo) => photo.sourceType === 'local-mapped'));
        void loadAllPhotos();
      } catch { alert('上传失败'); }
      finally { document.body.removeChild(input); }
    };
    input.click();
  }, []);

  const handleItemClick = useCallback((item: FootprintItem) => {
    if (item.lng && item.lat) {
      setFocusPosition([parseFloat(item.lng), parseFloat(item.lat)]);
    }
  }, []);

  // --- Group panel handlers ---

  const handleLoadGroupItemsForManagement = useCallback(async (groupId: number) => {
    if (groupId === selectedGroupId && items.length > 0) {
      return items;
    }

    try {
      const url = isViewMode
        ? `${viewApiBase}&type=items&group_id=${groupId}`
        : `/api/footprints/groups/${groupId}/items`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return data.items || [];
    } catch {
      return [];
    }
  }, [selectedGroupId, items, isViewMode, viewApiBase]);

  const handleAddItemToGroup = useCallback(async (item: FootprintItem, groupId: number) => {
    try {
      if (!item.listItemId && item.poiId) {
        const res = await fetch(`/api/footprints/groups/${groupId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            poi_id: item.poiId,
          }),
        });
        if (res.status === 409) {
          alert('该地点已在目标分类组中');
          return;
        }
        if (!res.ok) {
          const err = await res.json();
          alert(err.error || '添加失败');
          return;
        }
        updateGroupCount(groupId, 1);
        showActionNotice(`已添加到目标组「${groups.find((group) => group.id === groupId)?.name || ''}」`);
        return;
      }

      const probeRes = await fetch(`/api/footprints/groups/${groupId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          list_item_id: item.listItemId,
          source_item_id: item.id,
          probe_only: true,
        }),
      });
      const probeData = probeRes.ok ? await probeRes.json() : { hasPhotos: false, count: 0 };
      if (probeData?.hasPhotos) {
        setShareAlbumPrompt({
          item,
          groupId,
          count: probeData.count || 0,
        });
        return;
      }
      const res = await fetch(`/api/footprints/groups/${groupId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          list_item_id: item.listItemId,
          source_item_id: item.id,
          share_photos: false,
        }),
      });
      if (res.status === 409) {
        alert('该地点已在目标分类组中');
        return;
      }
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '添加失败');
        return;
      }
      updateGroupCount(groupId, 1);
      showActionNotice(`已添加到目标组「${groups.find((group) => group.id === groupId)?.name || ''}」`);
    } catch {
      alert('添加失败');
    }
  }, [groups, showActionNotice, updateGroupCount]);

  const handleBulkAddItemsToGroup = useCallback(async (targetItems: FootprintItem[], groupId: number) => {
    if (targetItems.length === 0) return;
    try {
      const payloadItems = targetItems.flatMap((item) => {
        if (item.listItemId) {
          return [{
            list_item_id: item.listItemId,
            source_item_id: item.id,
            share_photos: false,
          }];
        }
        if (item.poiId) {
          return [{
            poi_id: item.poiId,
          }];
        }
        return [];
      });

      if (payloadItems.length === 0) return;

      const res = await fetch(`/api/footprints/groups/${groupId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items: payloadItems }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 409) {
        alert(data?.error || '部分地点已在目标分类组中');
        return;
      }
      if (!res.ok) {
        alert(data?.error || '批量添加失败');
        return;
      }
      updateGroupCount(groupId, payloadItems.length);
      showActionNotice(`已添加 ${payloadItems.length} 个地点到目标组`);
    } catch {
      alert('批量添加失败');
    }
  }, [showActionNotice, updateGroupCount]);

  const handleConfirmShareAlbum = useCallback(async (sharePhotos: boolean) => {
    if (!shareAlbumPrompt) return;
    const { item, groupId } = shareAlbumPrompt;
    setShareAlbumPrompt(null);
    try {
      const res = await fetch(`/api/footprints/groups/${groupId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          list_item_id: item.listItemId,
          source_item_id: item.id,
          share_photos: sharePhotos,
        }),
      });
      if (res.status === 409) {
        alert('该地点已在目标分类组中');
        return;
      }
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '添加失败');
        return;
      }
      updateGroupCount(groupId, 1);
      showActionNotice(`已添加到目标组「${groups.find((group) => group.id === groupId)?.name || ''}」`);
    } catch {
      alert('添加失败');
    }
  }, [groups, shareAlbumPrompt, showActionNotice, updateGroupCount]);

  async function handleCreateGroup(name: string) {
    try {
      const res = await fetch('/api/footprints/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name }),
      });
      if (!res.ok) { const err = await res.json(); alert(err.error || '创建失败'); return; }
      await loadGroups();
    } catch { alert('创建失败'); }
  }

  async function handleRenameGroup(id: number, name: string) {
    try {
      await fetch(`/api/footprints/groups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name }),
      });
      await loadGroups();
    } catch { alert('重命名失败'); }
  }

  async function handleDeleteGroup(id: number) {
    if (!confirm('确定删除此分类组及其所有地点？')) return;
    try {
      await fetch(`/api/footprints/groups/${id}`, { method: 'DELETE', credentials: 'include' });
      if (selectedGroupId === id) setSelectedGroupId(null);
      await loadGroups();
    } catch { alert('删除失败'); }
  }

  async function handleSetDefault(id: number) {
    try {
      await fetch(`/api/footprints/groups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_default: true }),
      });
      await loadGroups();
    } catch { alert('设置默认失败'); }
  }

  const handleApplyLocalMap = useCallback((payload: {
    rootName: string;
    matchedAssets: LocalMappedAssetDraft[];
    unmatchedFolders: string[];
    missingAssets: Array<{ relativePath: string; name: string }>;
    layout: LocalMapLayoutSettings;
  }) => {
    setIsApplyingLocalMap(true);
    setLocalMapApplyProgress(8);
    setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
        const itemByTitle = new Map(items.map((item) => [item.title, item]));
        const currentItemKeys = new Set(items.map((item) => buildFootprintPhotoScopeKey(item.id)));
        const mappedPhotos: PhotoItem[] = payload.matchedAssets
          .map((asset) => {
            const matchedItem = itemByTitle.get(asset.matchedPlaceTitle);
            if (!matchedItem) return null;
            return {
              id: `local:${asset.relativePath}`,
              url: asset.url,
              thumbnailUrl: asset.thumbnailUrl,
              frameX: asset.frameX ?? undefined,
              frameY: asset.frameY ?? undefined,
              placeKey: buildFootprintPhotoScopeKey(matchedItem.id),
              placeTitle: matchedItem.title,
              footprintItemId: matchedItem.id,
              filename: asset.name,
              size: asset.size,
              lastModified: asset.lastModified,
              pixelWidth: asset.pixelWidth ?? undefined,
              pixelHeight: asset.pixelHeight ?? undefined,
              sourceType: 'local-mapped',
              relativePath: asset.relativePath,
              rootName: payload.rootName,
              missing: false,
            } satisfies PhotoItem;
          })
          .filter((photo): photo is PhotoItem => !!photo)
          .filter((photo) => currentItemKeys.has(photo.placeKey));
        setLocalMapApplyProgress(24);

        if (payload.layout.enabled) {
          for (const photo of mappedPhotos) {
            photo.frameX = undefined;
            photo.frameY = undefined;
          }
        }

        const unplaced = mappedPhotos.filter((photo) => photo.frameX == null || photo.frameY == null);
        setLocalMapApplyProgress(42);
        if (unplaced.length > 0) {
          autoPlacePhotos(
            unplaced,
            [...photos.filter((photo) => photo.sourceType !== 'local-mapped'), ...mappedPhotos],
            payload.layout,
          );
          movedPhotosRef.current = true;
          setHasMovedPhotos(true);
        }
        setLocalMapApplyProgress(66);

        setPhotos((current) => {
          current
            .filter((photo) => photo.sourceType === 'local-mapped')
            .forEach((photo) => {
              try {
                URL.revokeObjectURL(photo.url);
              } catch {}
              if (photo.thumbnailUrl) {
                try {
                  URL.revokeObjectURL(photo.thumbnailUrl);
                } catch {}
              }
            });
          const uploaded = current.filter((photo) => photo.sourceType !== 'local-mapped');
          return [...uploaded, ...mappedPhotos];
        });
        const debugMergedPhotos = [...photos.filter((photo) => photo.sourceType !== 'local-mapped'), ...mappedPhotos];
        setGroupLayouts((current) => Array.from(solveFrozenGroupLayouts(debugMergedPhotos, 1, undefined, current).values()));
        setDebugBasePhotos(buildDebugPhotoSnapshot(debugMergedPhotos));
        setDebugBaseGroups(buildDebugGroupSnapshot(debugMergedPhotos));
        setLocalMapApplyProgress(82);
        enqueueLocalThumbnails(mappedPhotos);
        setLocalRootName(payload.rootName);
        setLocalUnmatchedFolders(payload.unmatchedFolders);
        setLocalLayout(payload.layout);
        setFitViewEnabled(true);
        setFitViewKey((value) => value + 1);
        if (payload.missingAssets.length > 0) {
          alert(`检测到 ${payload.missingAssets.length} 个原记录文件已缺失。若本次保存，这些文件的位置记录将被删除。`);
        }
        setLocalMapTargetItem(null);
        setLocalMapOpen(false);
        setLocalMapApplyProgress(100);
        requestAnimationFrame(() => {
          setTimeout(() => {
            setIsApplyingLocalMap(false);
            setLocalMapApplyProgress(0);
          }, 180);
        });
        });
      });
    }, LOCAL_MAP_LOADING_MIN_DELAY_MS);
  }, [items, photos]);

  const currentDebugPhotos = buildDebugPhotoSnapshot(photos);
  const currentDebugGroups = buildDebugGroupSnapshot(photos);
  const debugPhotoDiff = debugBasePhotos
    ? currentDebugPhotos
      .map((photo) => {
        const base = debugBasePhotos.find((item) => item.index === photo.index);
        if (!base) return { index: photo.index, kind: 'added' as const, current: photo };
        const dLeft = photo.left != null && base.left != null ? Number((photo.left - base.left).toFixed(2)) : null;
        const dRight = photo.right != null && base.right != null ? Number((photo.right - base.right).toFixed(2)) : null;
        const dTop = photo.top != null && base.top != null ? Number((photo.top - base.top).toFixed(2)) : null;
        const dBottom = photo.bottom != null && base.bottom != null ? Number((photo.bottom - base.bottom).toFixed(2)) : null;
        if ((dLeft ?? 0) === 0 && (dRight ?? 0) === 0 && (dTop ?? 0) === 0 && (dBottom ?? 0) === 0) return null;
        return {
          index: photo.index,
          kind: 'moved' as const,
          base: { left: base.left, right: base.right, top: base.top, bottom: base.bottom },
          current: { left: photo.left, right: photo.right, top: photo.top, bottom: photo.bottom },
          delta: { dLeft, dRight, dTop, dBottom },
        };
      })
      .filter((item) => !!item)
    : [];
  const debugGroupDiff = debugBaseGroups
    ? currentDebugGroups
      .map((group) => {
        const base = debugBaseGroups.find((item) => item.index === group.index);
        if (!base) return { index: group.index, kind: 'added' as const, current: group };
        const dLeft = group.left != null && base.left != null ? Number((group.left - base.left).toFixed(2)) : null;
        const dRight = group.right != null && base.right != null ? Number((group.right - base.right).toFixed(2)) : null;
        const dTop = group.top != null && base.top != null ? Number((group.top - base.top).toFixed(2)) : null;
        const dBottom = group.bottom != null && base.bottom != null ? Number((group.bottom - base.bottom).toFixed(2)) : null;
        if ((dLeft ?? 0) === 0 && (dRight ?? 0) === 0 && (dTop ?? 0) === 0 && (dBottom ?? 0) === 0) return null;
        return {
          index: group.index,
          kind: 'changed' as const,
          base: { left: base.left, right: base.right, top: base.top, bottom: base.bottom },
          current: { left: group.left, right: group.right, top: group.top, bottom: group.bottom },
          delta: { dLeft, dRight, dTop, dBottom },
        };
      })
      .filter((item) => !!item)
    : [];
  const debugDocument = JSON.stringify({
    generatedAt: new Date().toISOString(),
    basePhotos: debugBasePhotos,
    currentPhotos: currentDebugPhotos,
    photoDiff: debugPhotoDiff,
    baseGroups: debugBaseGroups,
    currentGroups: currentDebugGroups,
    groupDiff: debugGroupDiff,
  }, null, 2);

  const handleDownloadDebugDocument = useCallback(() => {
    const blob = new Blob([debugDocument], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    anchor.href = url;
    anchor.download = `footprints-layout-debug-${stamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [debugDocument]);

  return (
    <div className={styles.rootFull}>
      {isApplyingLocalMap ? (
        <>
          <div className={styles.loadingInteractionBlocker} aria-hidden="true" />
          <div className={styles.loadingCard} role="status" aria-live="polite">
            <div className={styles.loadingSpinner} />
            <div className={styles.loadingTitle}>正在应用预设映射</div>
            <div className={styles.loadingSubtitle}>布局与本地图片映射处理中，请稍候</div>
            <div className={styles.loadingProgressTrack} aria-hidden="true">
              <div
                className={styles.loadingProgressBar}
                style={{ width: `${Math.max(8, Math.min(100, localMapApplyProgress))}%` }}
              />
            </div>
            <div className={styles.loadingProgressText}>{localMapApplyProgress}%</div>
          </div>
        </>
      ) : null}
      <aside className={styles.debugDocPanel}>
        <div className={styles.debugDocHeader}>布局调试文档</div>
        <button className={styles.debugDocDownload} onClick={handleDownloadDebugDocument}>
          下载 JSON
        </button>
      </aside>
      {/* Title */}
      {showTitle && selectedGroupId && (
        <div className={styles.pageTitle}>
          {groups.find(g => g.id === selectedGroupId)?.name || ''}
        </div>
      )}

      {localUnmatchedFolders.length > 0 && !isViewMode ? (
        <button className={styles.pendingHint} onClick={() => setLocalMapOpen(true)}>
          存在 {localUnmatchedFolders.length} 个未匹配目录
        </button>
      ) : null}

      {!isViewMode && !localRootName && knownLocalRoots.length > 0 ? (
        <button className={styles.localRecordHint} onClick={() => setLocalMapOpen(true)}>
          已存在 {knownLocalRoots.length} 份本地映射记录，需重新选择主文件夹后恢复
        </button>
      ) : null}

      {actionNotice ? (
        <div className={styles.actionNotice}>
          {actionNotice}
        </div>
      ) : null}

      {/* Main OuterFrame */}
      <OuterFrame
        markers={markers}
        photos={photos}
        groupLayouts={groupLayouts}
        onPoiPointsChange={setPoiPoints}
        focusPosition={focusPosition}
        onMarkerClick={handleMapMarkerClick}
        onPhotoDragEnd={handlePhotoDragEnd}
        onPhotoClick={handlePhotoClick}
        onPhotoMoved={handlePhotoMoved}
        onGroupLabelDragEnd={handleGroupLabelDragEnd}
        mapRef={mapInstanceRef}
        showPhotos={showPhotos}
        showLines={showLines}
        showLabels={showLabels}
        showPoiLabels={showPoiLabels}
        poiLabelColor={poiLabelColor}
        markerColor={markerColor}
        markerShape={markerShape}
        backgroundColor={backgroundColor}
        lineStyle={lineStyle}
        onScaleChange={setOuterScale}
        onViewportChange={setOuterViewport}
        fitViewKey={fitViewKey}
        fitViewEnabled={fitViewEnabled}
        baseMinScale={1}
      />

      {/* Bottom-right panels */}
      {(panelCollapsed && legendCollapsed) || (
        <div className={styles.panelBackdrop} onClick={() => { setPanelCollapsed(true); setLegendCollapsed(true); }} />
      )}
      <div className={styles.scaleBadge}>
        {Math.round(outerScale * 100)}%
      </div>
      <div className={styles.bottomRight}>
        <FootprintGroupPanel
          groups={groups}
          selectedGroupId={selectedGroupId}
          items={items}
          collapsed={panelCollapsed}
          backgroundColor={backgroundColor}
          onCollapsedChange={setPanelCollapsed}
          onSelectGroup={setSelectedGroupId}
          onNewGroup={handleCreateGroup}
          onRenameGroup={handleRenameGroup}
          onDeleteGroup={handleDeleteGroup}
          onSetDefault={handleSetDefault}
          onRemoveItem={handleRemoveItem}
          onRemoveItemFromGroup={handleRemoveItemFromGroup}
          onAddItemToGroup={handleAddItemToGroup}
          onBulkRemoveItemsFromGroup={handleBulkRemoveItemsFromGroup}
          onBulkAddItemsToGroup={handleBulkAddItemsToGroup}
          onOpenAlbum={handleOpenAlbum}
          onUploadPhoto={handleUploadPhotoForItem}
          onItemClick={handleItemClick}
          onLoadGroupItems={handleLoadGroupItemsForManagement}
          onOpenLocalMapForGroup={() => {
            setLocalMapTargetItem(null);
            setLocalMapOpen(true);
          }}
          onOpenLocalMapForItem={(item) => {
            setLocalMapTargetItem(item);
            setLocalMapOpen(true);
          }}
        />

        <LegendPanel
          showLines={showLines}
          showPhotos={showPhotos}
          showLabels={showLabels}
          showPoiLabels={showPoiLabels}
          poiLabelColor={poiLabelColor}
          markerColor={markerColor}
          markerShape={markerShape}
          showTitle={showTitle}
          backgroundColor={backgroundColor}
          lineStyle={lineStyle}
          collapsed={legendCollapsed}
          onCollapsedChange={setLegendCollapsed}
          onShowLinesChange={setShowLines}
          onShowPhotosChange={setShowPhotos}
          onShowLabelsChange={setShowLabels}
          onShowPoiLabelsChange={setShowPoiLabels}
          onPoiLabelColorChange={setPoiLabelColor}
          onMarkerColorChange={setMarkerColor}
          onMarkerShapeChange={setMarkerShape}
          onShowTitleChange={setShowTitle}
          onBackgroundColorChange={setBackgroundColor}
          onLineStyleChange={setLineStyle}
        />
        </div>

      {hasMovedPhotos && (
        <button className={styles.saveBtn} onClick={handleSavePositions}>保存修改</button>
      )}

      {/* Photo album modal */}
      <PhotoAlbumModal
        open={!!albumItem}
        footprintItemId={albumItem?.id ?? null}
        albumScopeKey={albumItem?.albumScopeKey ?? null}
        placeTitle={albumItem?.title || ''}
        shared={!!albumItem?.listItemId && !!albumItem?.albumScopeKey && albumItem.albumScopeKey !== buildFootprintPhotoScopeKey(albumItem.id)}
        onClose={() => setAlbumItem(null)}
        onPhotosDeleted={handleAlbumPhotosDeleted}
      />

      {/* Image viewer modal */}
      {viewerPhoto && (
        <div className={styles.viewerOverlay} onClick={() => setViewerPhoto(null)}>
          <button className={styles.viewerClose} onClick={() => setViewerPhoto(null)}>✕</button>
          <img
            src={viewerPhoto.url}
            alt={viewerPhoto.title}
            className={styles.viewerImage}
            onClick={e => e.stopPropagation()}
          />
          <div className={styles.viewerTitle}>{viewerPhoto.title}</div>
        </div>
      )}

      {!isViewMode && (
        <LocalMapModal
          open={localMapOpen}
          places={localMapTargetItem
            ? [{ id: localMapTargetItem.id, title: localMapTargetItem.title }]
            : items.map((item) => ({ id: item.id, title: item.title }))}
          onClose={() => setLocalMapOpen(false)}
          onApply={handleApplyLocalMap}
        />
      )}

      {shareAlbumPrompt ? createPortal(
        <div className={styles.modalOverlay} onClick={() => setShareAlbumPrompt(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>是否共享相册</h3>
            <div className={styles.modalList}>
              <div className={styles.modalHint}>
                当前地点已有 {shareAlbumPrompt.count} 张图片。选择“是”后，两个足迹将共同操作同一相册。
              </div>
              <button className={styles.modalBtn} onClick={() => void handleConfirmShareAlbum(true)}>
                是
              </button>
              <button className={styles.modalBtn} onClick={() => void handleConfirmShareAlbum(false)}>
                否
              </button>
            </div>
            <button className={styles.modalClose} onClick={() => setShareAlbumPrompt(null)}>
              取消
            </button>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
