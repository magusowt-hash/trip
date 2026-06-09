'use client';

import { createPortal } from 'react-dom';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import OuterFrame from '@/components/OuterFrame';
import { CLAMP_SCALE } from '@/lib/outerFrameCoords';
import type { DraggedGroupPhotoPosition, PhotoItem, PoiPoint } from '@/components/OuterFrameCanvas';
import FootprintGroupPanel from '@/components/FootprintGroupPanel';
import PhotoAlbumModal from '@/components/PhotoAlbumModal';
import LegendPanel from '@/components/LegendPanel';
import LocalMapModal, { type LocalMappedAssetDraft, type LocalMapLayoutSettings } from '@/components/LocalMapModal';
import { solvePendingGroupPlacements } from '@/components/footprintLayoutSolver';
import type { LockedPlaceGroup, LogicalOffset, LogicalRect, LogicalSize, PendingPlaceGroup, SolverTrace } from '@/components/footprintLayoutTypes';
import type { LineStyle } from '@/components/LegendPanel';
import type { MapMarker } from '@/components/PlanMap';
import {
  createGroupLayoutSnapshot,
  buildGroupGeometryFromLayout,
  buildGroupGeometryForCurrentPosition,
  buildGroupGeometryFromPhotoRect,
  expandPhotoRect,
  resolvePreferredLabelSideForMapRect,
  type GroupLayoutSnapshot,
} from '@/components/localMapGroupGeometry';
import type { GroupGeometry } from '@/components/localMapGroupGeometry';
import { getFootprintMapRect } from '@/components/footprintMapGeometry';
import { collectConflictingSavedPlaceKeys, geometryConflictsWithLockedGroups } from '@/components/footprintSavedGroupRecovery';
import {
  applyGroupDragToPhotos,
  applyGroupPhotoPositions,
  applyPhotoDragToPhotos,
  mergeGroupLayoutSnapshot,
  type FootprintLayoutInteractionMode,
} from '@/components/footprintManualLayout';
import { buildFootprintPhotoScopeKey, buildMapFootprintPhotoScopeKey } from '@/lib/footprintPhotoScope';
import styles from './footprints.module.css';

const LOCAL_THUMB_MAX_EDGE = 320;
const LOCAL_THUMB_CONCURRENCY = 4;
const LOCAL_THUMB_TIMEOUT_MS = 2500;
const LOCAL_THUMB_TOTAL_TIMEOUT_MS = 3500;
const LOCAL_THUMB_INITIAL_BATCH_LIMIT = 24;
const LOCAL_THUMB_BACKGROUND_BATCH_LIMIT = 32;
const LOCAL_THUMB_BACKGROUND_TOTAL_TIMEOUT_MS = 20000;
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

type LocalMapApplyPayload = {
  rootName: string;
  matchedAssets: LocalMappedAssetDraft[];
  unmatchedFolders: string[];
  missingAssets: Array<{ relativePath: string; name: string }>;
  layout: LocalMapLayoutSettings;
};

type SolverStageTiming = {
  stage: string;
  elapsedMs: number;
};

type SolverMetricTiming = {
  name: string;
  elapsedMs: number;
};

type MappedLayoutExportSnapshot = {
  viewportWidth: number;
  viewportHeight: number;
  mapRect: LogicalRect;
  safeGap: number;
  labelGapBoost: number;
  collisionScale: number;
  layout: LocalMapLayoutSettings;
  lockedGroups: LockedPlaceGroup[];
  pendingGroups: PendingPlaceGroup[];
  timings: {
    version: 'solver-stage-v1';
    solverTotalMs: number;
    solverStages: SolverStageTiming[];
    solverMetrics: SolverMetricTiming[];
    applyMetrics?: SolverMetricTiming[];
  };
  solverTrace?: SolverTrace;
};

const PHOTO_MAX_EDGE = 120;
const PHOTO_MIN_EDGE = 48;
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createThumbnailFromUrl(url: string, maxEdge = LOCAL_THUMB_MAX_EDGE, timeoutMs = LOCAL_THUMB_TIMEOUT_MS) {
  return new Promise<{ url: string; width: number; height: number } | null>((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (value: { url: string; width: number; height: number } | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
      resolve(value);
    };
    const timeoutId = window.setTimeout(() => finish(null), timeoutMs);
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        finish(null);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) {
          finish(null);
          return;
        }
        finish({ url: URL.createObjectURL(blob), width, height });
      }, 'image/jpeg', 0.82);
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}

type LocalThumbnailAttachOptions = {
  maxPhotos?: number;
  totalTimeoutMs?: number;
};

async function attachLocalThumbnails(
  photos: PhotoItem[],
  options: LocalThumbnailAttachOptions = {},
): Promise<PhotoItem[]> {
  const nextPhotos = photos.map((photo) => ({ ...photo }));
  const pendingIndexes = nextPhotos
    .map((photo, index) => ({ photo, index }))
    .filter(({ photo }) => photo.sourceType === 'local-mapped' && !photo.thumbnailUrl)
    .slice(0, options.maxPhotos ?? Number.POSITIVE_INFINITY)
    .map(({ index }) => index);
  if (pendingIndexes.length === 0) return nextPhotos;

  const totalTimeoutMs = options.totalTimeoutMs ?? LOCAL_THUMB_TOTAL_TIMEOUT_MS;
  const deadline = Date.now() + totalTimeoutMs;
  let cursor = 0;
  async function worker() {
    while (cursor < pendingIndexes.length) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) return;
      const pendingIndex = cursor;
      cursor += 1;
      const index = pendingIndexes[pendingIndex];
      const photo = nextPhotos[index];
      if (!photo || photo.sourceType !== 'local-mapped' || photo.thumbnailUrl) continue;
      const thumb = await createThumbnailFromUrl(photo.url, LOCAL_THUMB_MAX_EDGE, Math.min(LOCAL_THUMB_TIMEOUT_MS, remainingMs));
      if (!thumb) continue;
      nextPhotos[index] = {
        ...photo,
        thumbnailUrl: thumb.url,
        pixelWidth: photo.pixelWidth ?? thumb.width,
        pixelHeight: photo.pixelHeight ?? thumb.height,
      };
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(LOCAL_THUMB_CONCURRENCY, Math.max(1, nextPhotos.length)) }, () => worker()),
  );
  return nextPhotos;
}

function describeUnknownError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return '未知错误';
  }
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
    undefined,
  );
}

function buildOffsetGroupGeometry(placePhotos: PhotoItem[], offsets: LogicalOffset[], scale = 1) {
  if (placePhotos.length === 0 || offsets.length !== placePhotos.length) return null;

  const photoRect = buildOffsetPhotoRect(placePhotos, offsets);

  return buildGroupGeometryFromPhotoRect(
    photoRect,
    placePhotos[0]?.placeTitle || '',
    placePhotos.length,
    scale,
    undefined,
    0,
  );
}

function buildOffsetPhotoRect(placePhotos: PhotoItem[], offsets: LogicalOffset[]) {
  return expandPhotoRect({
    left: Math.min(...offsets.map((item, index) => item.offsetX - getPhotoLogicalSize(placePhotos[index]).width / 2)),
    right: Math.max(...offsets.map((item, index) => item.offsetX + getPhotoLogicalSize(placePhotos[index]).width / 2)),
    top: Math.min(...offsets.map((item, index) => item.offsetY - getPhotoLogicalSize(placePhotos[index]).height / 2)),
    bottom: Math.max(...offsets.map((item, index) => item.offsetY + getPhotoLogicalSize(placePhotos[index]).height / 2)),
  });
}

function solveFrozenGroupLayouts(
  photos: PhotoItem[],
  scale: number,
  mapRect?: LogicalRect,
) {
  const groups = new Map<string, PhotoItem[]>();
  for (const photo of photos) {
    if (photo.frameX == null || photo.frameY == null) continue;
    const arr = groups.get(photo.placeKey) || [];
    arr.push(photo);
    groups.set(photo.placeKey, arr);
  }

  const resolved = new Map<string, GroupLayoutSnapshot>();
  for (const [placeKey, groupPhotos] of groups) {
    const geometry = buildGroupGeometryForCurrentPosition(groupPhotos, getPhotoLogicalSize, scale, mapRect);
    if (!geometry) continue;
    resolved.set(placeKey, createGroupLayoutSnapshot(placeKey, geometry));
  }

  return resolved;
}

function estimateReservedLabelOffset(
  placeKey: string,
  groupPhotos: PhotoItem[],
  scale: number,
  mapRect: LogicalRect | undefined,
) {
  const baseGeometry = buildGroupGeometryForCurrentPosition(groupPhotos, getPhotoLogicalSize, scale, mapRect);
  if (!baseGeometry) return 0;
  return Math.max(
    0,
    baseGeometry.labelSide === 'top'
      ? baseGeometry.photoRect.top - baseGeometry.lineAnchorY
      : baseGeometry.lineAnchorY - baseGeometry.photoRect.bottom,
  );
}

function rebuildGroupLayoutSnapshotForCurrentPosition(
  placeKey: string,
  groupPhotos: PhotoItem[],
  scale: number,
  mapRect: LogicalRect,
) {
  const geometry = buildGroupGeometryForCurrentPosition(groupPhotos, getPhotoLogicalSize, scale, mapRect);
  if (!geometry) return null;
  const labelOffset =
    geometry.labelSide === 'top'
      ? Math.max(0, geometry.photoRect.top - geometry.lineAnchorY)
      : Math.max(0, geometry.lineAnchorY - geometry.photoRect.bottom);
  return {
    placeKey,
    labelSide: geometry.labelSide,
    labelOffset,
  } satisfies GroupLayoutSnapshot;
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

function getFootprintItemPlaceKey(item: Pick<FootprintItem, 'id' | 'listItemId' | 'poiId' | 'albumScopeKey'>) {
  return item.albumScopeKey || (item.listItemId ? buildFootprintPhotoScopeKey(item.id) : buildMapFootprintPhotoScopeKey(item.poiId ?? item.id));
}

function downloadJsonFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
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
  const [outerViewport, setOuterViewport] = useState<LogicalRect | null>(null);
  const [outerContainerSize, setOuterContainerSize] = useState<{ width: number; height: number } | null>(null);
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
  const [localMissingAssets, setLocalMissingAssets] = useState<Array<{ relativePath: string; name: string }>>([]);
  const [localLayout, setLocalLayout] = useState<LocalMapLayoutSettings | null>(null);
  const [knownLocalRoots, setKnownLocalRoots] = useState<string[]>([]);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isApplyingLocalMap, setIsApplyingLocalMap] = useState(false);
  const [localMapApplyProgress, setLocalMapApplyProgress] = useState(0);
  const [localMapApplyStage, setLocalMapApplyStage] = useState('等待开始');
  const [fitViewKey, setFitViewKey] = useState(0);
  const [fitViewEnabled, setFitViewEnabled] = useState(false);
  const [layoutInteractionMode, setLayoutInteractionMode] = useState<FootprintLayoutInteractionMode>('manual');
  const [shareAlbumPrompt, setShareAlbumPrompt] = useState<{
    item: FootprintItem;
    groupId: number;
    count: number;
  } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  const movedPhotosRef = useRef<boolean>(false);
  const itemsRef = useRef<FootprintItem[]>([]);
  const photosRef = useRef<PhotoItem[]>([]);
  const groupLayoutsRef = useRef<GroupLayoutSnapshot[]>([]);
  const poiPointsRef = useRef<PoiPoint[]>([]);
  const outerScaleRef = useRef(1);
  const localMapApplyRunIdRef = useRef(0);
  const actionNoticeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const dirtyUploadedPhotoIdsRef = useRef<Set<number | string>>(new Set());
  const dirtyLocalAssetPathsRef = useRef<Set<string>>(new Set());
  const layoutInteractionModeRef = useRef<FootprintLayoutInteractionMode>('manual');
  const mappedLayoutExportSnapshotRef = useRef<MappedLayoutExportSnapshot | null>(null);
  const localThumbBackfillRunningRef = useRef(false);
  const pendingFitViewAfterPresetRef = useRef(false);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => { groupLayoutsRef.current = groupLayouts; }, [groupLayouts]);
  useEffect(() => { poiPointsRef.current = poiPoints; }, [poiPoints]);
  useEffect(() => { outerScaleRef.current = outerScale; }, [outerScale]);
  useEffect(() => { layoutInteractionModeRef.current = layoutInteractionMode; }, [layoutInteractionMode]);

  const getCurrentViewportSize = useCallback(() => {
    if (outerContainerSize) {
      return {
        width: Math.max(1, outerContainerSize.width),
        height: Math.max(1, outerContainerSize.height),
      };
    }
    if (outerViewport) {
      return {
        width: Math.max(1, outerViewport.right - outerViewport.left),
        height: Math.max(1, outerViewport.bottom - outerViewport.top),
      };
    }
    return {
      width: typeof window !== 'undefined' ? window.innerWidth : 1200,
      height: typeof window !== 'undefined' ? window.innerHeight : 800,
    };
  }, [outerContainerSize, outerViewport]);

  useEffect(() => {
    if (!pendingFitViewAfterPresetRef.current) return;
    if (layoutInteractionMode !== 'preset') return;
    if (photos.length === 0) return;

    const visiblePhotoCount = photos.filter((photo) => photo.frameX != null && photo.frameY != null).length;
    if (visiblePhotoCount === 0) return;

    pendingFitViewAfterPresetRef.current = false;
    setFitViewEnabled(true);
    setFitViewKey((value) => value + 1);
  }, [photos, groupLayouts, layoutInteractionMode]);

  useEffect(() => {
    if (localThumbBackfillRunningRef.current) return;
    const missingLocalThumbs = photos.filter((photo) => photo.sourceType === 'local-mapped' && !photo.thumbnailUrl);
    if (missingLocalThumbs.length === 0) return;

    let cancelled = false;
    localThumbBackfillRunningRef.current = true;

    const runBackfill = async () => {
      try {
        while (!cancelled) {
          const currentPhotos = photosRef.current;
          const stillMissing = currentPhotos.filter((photo) => photo.sourceType === 'local-mapped' && !photo.thumbnailUrl);
          if (stillMissing.length === 0) break;
          const nextPhotos = await attachLocalThumbnails(currentPhotos, {
            maxPhotos: LOCAL_THUMB_BACKGROUND_BATCH_LIMIT,
            totalTimeoutMs: LOCAL_THUMB_BACKGROUND_TOTAL_TIMEOUT_MS,
          });
          if (cancelled) break;

          let generatedCount = 0;
          for (let index = 0; index < nextPhotos.length; index++) {
            const previous = currentPhotos[index];
            const next = nextPhotos[index];
            if (
              previous?.sourceType === 'local-mapped' &&
              !previous.thumbnailUrl &&
              next?.thumbnailUrl
            ) {
              generatedCount += 1;
            }
          }
          if (generatedCount === 0) break;

          setPhotos(nextPhotos);
          await new Promise((resolve) => window.setTimeout(resolve, 50));
        }
      } finally {
        localThumbBackfillRunningRef.current = false;
      }
    };

    void runBackfill();
    return () => {
      cancelled = true;
    };
  }, [photos]);

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
      setLocalRootName(null);
      setLocalUnmatchedFolders([]);
      setLocalMissingAssets([]);
      setLocalLayout(null);
      setItems([]);
      loadItems(selectedGroupId);
      setPhotosLoaded(false);
      setFitViewEnabled(false);
      setLayoutInteractionMode('manual');
    } else {
      setItems([]);
      setPhotos([]);
      setGroupLayouts([]);
      setLocalRootName(null);
      setLocalUnmatchedFolders([]);
      setLocalMissingAssets([]);
      setLocalLayout(null);
      setFitViewEnabled(false);
      setLayoutInteractionMode('manual');
    }
  }, [selectedGroupId]);

  useEffect(() => {
    const ms: MapMarker[] = items
      .filter(it => it.lng && it.lat)
      .map(it => ({
        id: getFootprintItemPlaceKey(it),
        position: [parseFloat(it.lng!), parseFloat(it.lat!)] as [number, number],
        title: it.title,
        address: it.address || undefined,
        description: it.description || undefined,
      }));
    setMarkers(ms);
  }, [items]);

  useEffect(() => {
    if (isViewMode) return;
    if (!selectedGroupId) {
      setKnownLocalRoots([]);
      return;
    }
    const params = new URLSearchParams();
    params.set('group_id', String(selectedGroupId));
    fetch(`/api/footprints/local-map?${params.toString()}`, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!data) return;
        setKnownLocalRoots(Array.isArray(data.knownRootNames) ? data.knownRootNames : []);
      })
      .catch(() => {});
  }, [isViewMode, selectedGroupId]);

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
      targetItems.map(getFootprintItemPlaceKey),
    );
    setItems((current) => current.filter((item) => !targetKeys.has(`${item.listItemId ? `list:${item.listItemId}` : `map:${item.poiId}`}`)));
    setPhotos((current) => current.filter((photo) => photo.sourceType === 'local-mapped' || !removedScopeKeys.has(photo.placeKey)));
  }, [selectedGroupId]);

  const loadAllPhotos = useCallback(async () => {
    if (items.length === 0 || photosLoaded) return;
    setPhotosLoaded(true);

    const itemScopes = new Map(items.map((item) => [item.id, getFootprintItemPlaceKey(item)]));
    const itemKeys = new Set(itemScopes.values());
    const allPhotos: PhotoItem[] = [];

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
        const scopeKey = getFootprintItemPlaceKey(item);
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

    const logicalPointByPlaceKey = new Map<string, { x: number; y: number }>(
      poiPoints.map((point) => [point.placeKey, { x: point.logicalX, y: point.logicalY }]),
    );
    const savedPhotosByPlaceKey = new Map<string, PhotoItem[]>();
    for (const photo of allPhotos) {
      const current = savedPhotosByPlaceKey.get(photo.placeKey) ?? [];
      current.push(photo);
      savedPhotosByPlaceKey.set(photo.placeKey, current);
    }
    const conflictingSavedPlaceKeys = collectConflictingSavedPlaceKeys(
      savedPhotosByPlaceKey,
      CLAMP_SCALE.max,
      groupLayouts,
      logicalPointByPlaceKey,
    );
    if (conflictingSavedPlaceKeys.size > 0) {
      for (const photo of allPhotos) {
        if (!conflictingSavedPlaceKeys.has(photo.placeKey)) continue;
        photo.frameX = undefined;
        photo.frameY = undefined;
      }
    }

    // Auto-place photos without existing positions.
    const unplaced = allPhotos.filter(p => p.frameX == null || p.frameY == null);
    let nextGroupLayouts = groupLayouts;
    if (unplaced.length > 0) {
      nextGroupLayouts = autoPlacePhotos(unplaced, allPhotos);
      movedPhotosRef.current = true;
      setHasMovedPhotos(true);
    }

    setPhotos((current) => [
      ...allPhotos,
      ...current.filter((photo) => photo.sourceType === 'local-mapped'),
    ]);
    setGroupLayouts((current) => {
      const merged = new Map(current.map((item) => [item.placeKey, item]));
      for (const layout of nextGroupLayouts) {
        merged.set(layout.placeKey, layout);
      }
      return Array.from(merged.values());
    });
  }, [items, photosLoaded, photos, isViewMode, viewApiBase, selectedGroupId, poiPoints]);

  // Auto-load photos only after map POI coordinates are available.
  useEffect(() => {
    const expectedPoiKeys = new Set(items.filter((item) => item.lng && item.lat).map(getFootprintItemPlaceKey));
    const poiKeys = new Set(poiPoints.map((point) => point.placeKey));
    const poiReady = [...expectedPoiKeys].every((placeKey) => poiKeys.has(placeKey));
    if (items.length > 0 && poiReady && !photosLoaded) {
      loadAllPhotos();
    }
  }, [items, poiPoints, photosLoaded, loadAllPhotos]);

  function autoPlacePhotos(
    unplaced: PhotoItem[],
    referencePhotos: PhotoItem[] = photos,
    layout: LocalMapLayoutSettings = { enabled: true, mode: 'grid', gapX: 20, gapY: 20, staggerAxis: 'horizontal' },
    options: {
      poiPoints?: PoiPoint[];
      groupLayouts?: GroupLayoutSnapshot[];
      mapRect?: LogicalRect;
      onSolverStage?: (stage: string) => void;
    } = {},
  ): GroupLayoutSnapshot[] {
    const activeGroupLayouts = options.groupLayouts ?? groupLayouts;
    if (unplaced.length === 0) return activeGroupLayouts;

    const byPlace = new Map<string, PhotoItem[]>();
    for (const p of unplaced) {
      const arr = byPlace.get(p.placeKey) || [];
      arr.push(p);
      byPlace.set(p.placeKey, arr);
    }
    const logicalPointByPlaceKey = new Map<string, { x: number; y: number }>(
      (options.poiPoints ?? poiPoints).map((point) => [point.placeKey, { x: point.logicalX, y: point.logicalY }]),
    );
    if ([...byPlace.keys()].some((placeKey) => !logicalPointByPlaceKey.has(placeKey))) {
      return activeGroupLayouts;
    }

    const cardSize = 80;
    const collisionScale = CLAMP_SCALE.max;
    const { width: viewportWidth, height: viewportHeight } = getCurrentViewportSize();
    const mapRect = options.mapRect ?? getFootprintMapRect(viewportWidth, viewportHeight);
    const allGroups = new Map<string, PhotoItem[]>();
    for (const photo of referencePhotos) {
      const arr = allGroups.get(photo.placeKey) || [];
      arr.push(photo);
      allGroups.set(photo.placeKey, arr);
    }

    const targetKeys = new Set(byPlace.keys());
    const lockedGroups: LockedPlaceGroup[] = [];
    const pendingGroups: PendingPlaceGroup[] = [];

    const sortedGroups = Array.from(allGroups.entries()).sort(([leftKey], [rightKey]) => (
      leftKey.localeCompare(rightKey, 'zh-CN')
    ));

    for (const [placeKey, placePhotos] of sortedGroups) {
      const canConsiderLocked =
        !targetKeys.has(placeKey) &&
        placePhotos.every((photo) => photo.frameX != null && photo.frameY != null);
      if (canConsiderLocked) {
        const lockedGeometry = buildGroupGeometryFromLayout(
          placeKey,
          placePhotos,
          getPhotoLogicalSize,
          collisionScale,
          activeGroupLayouts,
          mapRect,
        );
        if (lockedGeometry) {
          const logicalPoint = logicalPointByPlaceKey.get(placeKey);
          if (!logicalPoint) continue;
          if (!geometryConflictsWithLockedGroups(lockedGeometry, lockedGroups, cardSize)) {
            lockedGroups.push({
              placeKey,
              logicalX: logicalPoint.x,
              logicalY: logicalPoint.y,
              geometry: lockedGeometry,
            });
            continue;
          }
        }
      }

      const rawOffsets = buildOffsetsForLayout(placePhotos.length, layout, cardSize);
      const offsets = applySizedOffsets(placePhotos, rawOffsets, layout.gapX, layout.gapY);

      const reservedLabelOffset = estimateReservedLabelOffset(placeKey, placePhotos, collisionScale, mapRect);
      const offsetPhotoRect = buildOffsetPhotoRect(placePhotos, offsets);
      const logicalPoint = logicalPointByPlaceKey.get(placeKey)!;
      const preferredLabelSide = resolvePreferredLabelSideForMapRect(
        offsetPhotoRect,
        mapRect,
      );
      const offsetGeometry = offsetPhotoRect
        ? buildGroupGeometryFromPhotoRect(
            offsetPhotoRect,
            placePhotos[0]?.placeTitle || '',
            placePhotos.length,
            collisionScale,
            preferredLabelSide,
            reservedLabelOffset,
            mapRect,
          )
        : null;
      if (!offsetGeometry) continue;

      pendingGroups.push({
        placeKey,
        placePhotos,
        collisionGeometry: offsetGeometry,
        collisionRect: offsetGeometry.groupRect,
        collisionScale,
        reservedLabelOffset,
        logicalX: logicalPoint.x,
        logicalY: logicalPoint.y,
        mapRect,
        offsets,
      });
    }

    const solverStageTimings: Array<{ stage: string; elapsedMs: number }> = [];
    const solverMetricTimings: SolverMetricTiming[] = [];
    const solverStartedAt = performance.now();
    const solvedPendingGroups = solvePendingGroupPlacements(
      pendingGroups,
      mapRect,
      cardSize,
      computeLabelGapBoost(collisionScale),
      lockedGroups,
      (stage) => {
        solverStageTimings.push({
          stage,
          elapsedMs: Number((performance.now() - solverStartedAt).toFixed(1)),
        });
        options.onSolverStage?.(stage);
      },
      (name, elapsedMs) => {
        solverMetricTimings.push({ name, elapsedMs });
      },
    );
    const solverTotalMs = Number((performance.now() - solverStartedAt).toFixed(1));
    const placementById = solvedPendingGroups.placements;
    const resolvedGeometryById = solvedPendingGroups.geometries;

    mappedLayoutExportSnapshotRef.current = {
      viewportWidth,
      viewportHeight,
      mapRect,
      safeGap: cardSize,
      labelGapBoost: computeLabelGapBoost(collisionScale),
      collisionScale,
      layout,
      lockedGroups,
      pendingGroups,
      timings: {
        version: 'solver-stage-v1',
        solverTotalMs,
        solverStages: solverStageTimings,
        solverMetrics: solverMetricTimings,
      },
      solverTrace: solvedPendingGroups.trace,
    };

    for (const group of pendingGroups) {
      const chosenCenter = placementById.get(group.placeKey);
      if (!chosenCenter) continue;
      for (let i = 0; i < group.placePhotos.length; i++) {
        group.placePhotos[i].frameX = chosenCenter.centerX + group.offsets[i].offsetX;
        group.placePhotos[i].frameY = chosenCenter.centerY + group.offsets[i].offsetY;
      }
    }

    const finalizedPhotos = referencePhotos.map((photo) => ({ ...photo }));
    const finalizedPendingKeys = new Set(pendingGroups.map((group) => group.placeKey));
    for (const group of pendingGroups) {
      const chosenCenter = placementById.get(group.placeKey);
      if (!chosenCenter) continue;
      for (let i = 0; i < group.placePhotos.length; i++) {
        const targetId = group.placePhotos[i]?.id;
        const finalizedPhoto = finalizedPhotos.find((photo) => photo.id === targetId);
        if (!finalizedPhoto) continue;
        finalizedPhoto.frameX = chosenCenter.centerX + group.offsets[i].offsetX;
        finalizedPhoto.frameY = chosenCenter.centerY + group.offsets[i].offsetY;
      }
    }
    const finalLayouts = pendingGroups.flatMap((group) => {
      const geometry = resolvedGeometryById.get(group.placeKey);
      if (!geometry) return [];
      return [createGroupLayoutSnapshot(group.placeKey, geometry)];
    });
    const next = new Map(activeGroupLayouts.map((item) => [item.placeKey, item]));
    for (const layout of finalLayouts) {
      next.set(layout.placeKey, layout);
    }
    return Array.from(next.values());
  }

  // --- Map handlers ---

  function handleMapMarkerClick(marker: MapMarker) {
    if (marker.position) setFocusPosition(marker.position);
  }

  // --- Photo handlers ---

  const handlePhotoDragEnd = useCallback((photoId: number | string, x: number, y: number) => {
    if (layoutInteractionModeRef.current !== 'manual') return;
    const target = photosRef.current.find((photo) => photo.id === photoId);
    if (target?.sourceType === 'local-mapped' && target.relativePath) {
      dirtyLocalAssetPathsRef.current.add(target.relativePath);
    } else {
      dirtyUploadedPhotoIdsRef.current.add(photoId);
    }
    const { width, height } = getCurrentViewportSize();
    const mapRect = getFootprintMapRect(width, height);
    setPhotos((current) => {
      const nextPhotos = applyPhotoDragToPhotos(current, photoId, x, y);
      const targetPhoto = nextPhotos.find((photo) => photo.id === photoId);
      if (targetPhoto) {
        const groupPhotos = nextPhotos.filter((photo) => photo.placeKey === targetPhoto.placeKey);
        const nextLayout = rebuildGroupLayoutSnapshotForCurrentPosition(
          targetPhoto.placeKey,
          groupPhotos,
          CLAMP_SCALE.max,
          mapRect,
        );
        if (nextLayout) {
          setGroupLayouts((layouts) => mergeGroupLayoutSnapshot(layouts, nextLayout));
        }
      }
      return nextPhotos;
    });
    movedPhotosRef.current = true;
    setHasMovedPhotos(true);
  }, [getCurrentViewportSize]);

  const handleGroupLabelDragEnd = useCallback((placeKey: string, nextGroupPhotos: DraggedGroupPhotoPosition[]) => {
    if (layoutInteractionModeRef.current !== 'manual') return;
    if (nextGroupPhotos.length === 0) return;
    for (const photo of photosRef.current) {
      if (photo.placeKey !== placeKey) continue;
      if (photo.sourceType === 'local-mapped' && photo.relativePath) {
        dirtyLocalAssetPathsRef.current.add(photo.relativePath);
      } else {
        dirtyUploadedPhotoIdsRef.current.add(photo.id);
      }
    }
    const nextPhotos = applyGroupPhotoPositions(photosRef.current, placeKey, nextGroupPhotos);
    const { width, height } = getCurrentViewportSize();
    const mapRect = getFootprintMapRect(width, height);
    const groupPhotos = nextPhotos.filter((photo) => photo.placeKey === placeKey);
    const nextLayout = rebuildGroupLayoutSnapshotForCurrentPosition(
      placeKey,
      groupPhotos,
      CLAMP_SCALE.max,
      mapRect,
    );
    setPhotos(nextPhotos);
    if (nextLayout) {
      setGroupLayouts((layouts) => mergeGroupLayoutSnapshot(layouts, nextLayout));
    }
    movedPhotosRef.current = true;
    setHasMovedPhotos(true);
  }, [getCurrentViewportSize]);

  const buildLocalMapAssetsForSave = useCallback((sourcePhotos: PhotoItem[]) => (
    sourcePhotos
      .filter(p => p.sourceType === 'local-mapped')
      .filter(p => p.relativePath && dirtyLocalAssetPathsRef.current.has(p.relativePath))
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
      }))
  ), []);

  const handleSavePositions = useCallback(async () => {
    if (!movedPhotosRef.current) return;
    const uploadedUpdates = photos
      .filter(p => p.sourceType !== 'local-mapped' && dirtyUploadedPhotoIdsRef.current.has(p.id))
      .filter(p => p.frameX != null && p.frameY != null)
      .map(p => ({ id: p.id, frameX: p.frameX!, frameY: p.frameY! }));
    const localAssets = buildLocalMapAssetsForSave(photos);
    const deletedRelativePaths = localMissingAssets.map((asset) => asset.relativePath);

    if (uploadedUpdates.length === 0 && localAssets.length === 0 && deletedRelativePaths.length === 0 && !localRootName) return;
    if (localRootName && localMissingAssets.length > 0) {
      const ok = window.confirm(`本次保存会删除 ${localMissingAssets.length} 个本地映射缺失文件的位置记录，是否继续？`);
      if (!ok) return;
    }
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
        if (!selectedGroupId) {
          alert('缺少当前足迹组，无法保存本地映射');
          return;
        }
        const res = await fetch('/api/footprints/local-map', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            rootName: localRootName,
            groupId: selectedGroupId,
            assets: localAssets,
            deletedRelativePaths,
            unmatchedFolders: localUnmatchedFolders,
            layout: localLayout,
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          alert(d.error || '本地映射保存失败');
          return;
        }
        const data = await res.json().catch(() => null);
        if (data && Array.isArray(data.knownRootNames)) {
          setKnownLocalRoots(data.knownRootNames);
        }
      }
      dirtyUploadedPhotoIdsRef.current.clear();
      dirtyLocalAssetPathsRef.current.clear();
      movedPhotosRef.current = false;
      setHasMovedPhotos(false);
      setLocalMissingAssets([]);
    } catch { alert('保存失败'); }
  }, [buildLocalMapAssetsForSave, photos, localLayout, localMissingAssets, localRootName, localUnmatchedFolders, selectedGroupId]);

  const handleDownloadMappedLayoutJson = useCallback(() => {
    try {
      const exportSnapshot = mappedLayoutExportSnapshotRef.current;
      const selectedGroupName = groups.find((group) => group.id === selectedGroupId)?.name || '我的足迹';
      const safeGroupName = selectedGroupName.replace(/[\\\\/:*?\"<>|]+/g, '-').trim() || '我的足迹';
      const exportTimings = exportSnapshot?.timings ?? {
        version: 'solver-stage-v1' as const,
        solverTotalMs: 0,
        solverStages: [],
      };
      const solverInputSnapshot = exportSnapshot
        ? {
            viewportWidth: exportSnapshot.viewportWidth,
            viewportHeight: exportSnapshot.viewportHeight,
            mapRect: exportSnapshot.mapRect,
            safeGap: exportSnapshot.safeGap,
            labelGapBoost: exportSnapshot.labelGapBoost,
            collisionScale: exportSnapshot.collisionScale,
            layout: exportSnapshot.layout,
            lockedGroups: exportSnapshot.lockedGroups,
            pendingGroups: exportSnapshot.pendingGroups,
          }
        : {
            viewportWidth: getCurrentViewportSize().width,
            viewportHeight: getCurrentViewportSize().height,
            mapRect: getFootprintMapRect(
              getCurrentViewportSize().width,
              getCurrentViewportSize().height,
            ),
            safeGap: 80,
            labelGapBoost: computeLabelGapBoost(CLAMP_SCALE.max),
            collisionScale: CLAMP_SCALE.max,
            layout: localLayout ?? { enabled: true, mode: 'grid' as const, gapX: 20, gapY: 20, staggerAxis: 'horizontal' as const },
            lockedGroups: [],
            pendingGroups: [],
          };

      downloadJsonFile(`${safeGroupName}-mapped-layout.json`, {
        exportedAt: new Date().toISOString(),
        selectedGroupId,
        selectedGroupName,
        pageState: {
          items,
          poiPoints,
          groupLayouts,
          photos,
        },
        solverInputSnapshot,
        timings: exportTimings,
        solverTrace: exportSnapshot?.solverTrace ?? null,
      });
    } catch {
      setActionNotice('导出映射 JSON 失败，请稍后重试');
    }
  }, [groups, selectedGroupId, items, poiPoints, groupLayouts, photos, localLayout, getCurrentViewportSize]);

  const handlePhotoClick = useCallback((photoId: number | string) => {
    const p = photos.find(x => x.id === photoId);
    if (p) setViewerPhoto({ url: p.url, title: p.filename });
  }, [photos]);

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
    const scopeKey = getFootprintItemPlaceKey(item);
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

  const handleApplyLocalMap = useCallback((payload: LocalMapApplyPayload) => {
    setLocalMapOpen(false);
    setLocalMapTargetItem(null);
    setIsApplyingLocalMap(true);
    setLayoutInteractionMode('preset');
    setLocalMapApplyProgress(8);
    setLocalMapApplyStage('准备启动排布任务');

    const runId = localMapApplyRunIdRef.current + 1;
    localMapApplyRunIdRef.current = runId;
    const isCurrentRun = () => localMapApplyRunIdRef.current === runId;
    const finishApplying = () => {
      if (!isCurrentRun()) return;
      pendingFitViewAfterPresetRef.current = false;
      setIsApplyingLocalMap(false);
      setLocalMapApplyProgress(0);
      setLocalMapApplyStage('等待开始');
      setFitViewEnabled(false);
      setLayoutInteractionMode('manual');
    };

    const runApply = async (attempt = 0) => {
      if (!isCurrentRun()) return;
      const applyStartedAt = performance.now();
      const applyMetrics: SolverMetricTiming[] = [];
      let currentApplyStep = '初始化';
      const markApplyMetric = (name: string) => {
        applyMetrics.push({
          name,
          elapsedMs: Number((performance.now() - applyStartedAt).toFixed(1)),
        });
      };
      try {
        currentApplyStep = '检查地图点位';
        setLocalMapApplyStage('检查地图点位');
        setLocalMapApplyProgress(12);
        const currentItems = itemsRef.current;
        const currentPhotos = photosRef.current;
        const currentGroupLayouts = groupLayoutsRef.current;
        const currentPoiPoints = poiPointsRef.current;
        const itemByTitle = new Map(currentItems.map((item) => [item.title, item]));
        const poiPlaceKeys = new Set(currentPoiPoints.map((point) => point.placeKey));
        const targetPoiKeys = new Set(
          payload.matchedAssets
            .map((asset) => itemByTitle.get(asset.matchedPlaceTitle))
            .filter((item): item is FootprintItem => Boolean(item?.lng && item?.lat))
            .map(getFootprintItemPlaceKey),
        );
        if ([...targetPoiKeys].some((placeKey) => !poiPlaceKeys.has(placeKey))) {
          if (attempt < 30) {
            setTimeout(() => {
              void runApply(attempt + 1);
            }, 80);
            return;
          }
          alert('地图点位尚未完成加载，无法应用本地映射。请稍后重试。');
          finishApplying();
          return;
        }
        markApplyMetric('apply.poiReadyCheckMs');

        currentApplyStep = '生成本地图片映射';
        setLocalMapApplyStage('生成本地图片映射');
        const currentItemKeys = new Set(currentItems.map(getFootprintItemPlaceKey));
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
              placeKey: getFootprintItemPlaceKey(matchedItem),
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
        if (mappedPhotos.length === 0) {
          setLocalMapApplyStage('映射失败：没有匹配当前足迹组的图片');
          alert('本次扫描没有生成属于当前足迹组的图片，请确认选择的是当前足迹组对应的主文件夹。');
          finishApplying();
          return;
        }
        markApplyMetric('apply.buildMappedPhotosMs');
        setLocalMapApplyProgress(24);

        if (payload.layout.enabled) {
          currentApplyStep = '应用预设布局';
          setLocalMapApplyStage('应用预设布局');
          for (const photo of mappedPhotos) {
            photo.frameX = undefined;
            photo.frameY = undefined;
          }
        }

        const unplaced = mappedPhotos.filter((photo) => photo.frameX == null || photo.frameY == null);
        setLocalMapApplyProgress(42);
        let nextGroupLayouts = currentGroupLayouts;
        if (unplaced.length > 0) {
          currentApplyStep = '计算安全排布';
          setLocalMapApplyStage(`计算安全排布：${unplaced.length} 张 / ${currentPoiPoints.length} 个点位`);
          nextGroupLayouts = autoPlacePhotos(
            unplaced,
            [...currentPhotos.filter((photo) => photo.sourceType !== 'local-mapped'), ...mappedPhotos],
            payload.layout,
            {
              poiPoints: currentPoiPoints,
              groupLayouts: currentGroupLayouts,
              onSolverStage: (stage) => {
                if (!isCurrentRun()) return;
                setLocalMapApplyStage(`安全排布中：${stage}`);
              },
            },
          );
          markApplyMetric('apply.autoPlacePhotosMs');
          if (unplaced.every((photo) => photo.frameX != null && photo.frameY != null)) {
            movedPhotosRef.current = true;
            setHasMovedPhotos(true);
          }
        }
        const visibleMappedCount = mappedPhotos.filter((photo) => photo.frameX != null && photo.frameY != null).length;
        setLocalMapApplyStage(`排布坐标生成：${visibleMappedCount}/${mappedPhotos.length} 张`);
        if (mappedPhotos.length > 0 && visibleMappedCount === 0) {
          setLocalMapApplyStage('排布失败：未生成可显示坐标');
          alert('本地映射已匹配文件，但未生成可显示坐标。请等待地图点位加载完成后重试。');
          finishApplying();
          return;
        }
        setLocalMapApplyProgress(66);

        currentApplyStep = '生成本地缩略图';
        setLocalMapApplyStage('生成本地缩略图');
        const mappedPhotosWithThumbnails = await attachLocalThumbnails(mappedPhotos, {
          maxPhotos: LOCAL_THUMB_INITIAL_BATCH_LIMIT,
          totalTimeoutMs: LOCAL_THUMB_TOTAL_TIMEOUT_MS,
        });
        if (!isCurrentRun()) return;
        markApplyMetric('apply.attachLocalThumbnailsMs');
        setLocalMapApplyProgress(78);

        currentApplyStep = '写入前端状态';
        setLocalMapApplyStage('写入前端状态');
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
          return [...uploaded, ...mappedPhotosWithThumbnails];
        });
        setGroupLayouts(nextGroupLayouts);
        markApplyMetric('apply.stateWriteMs');
        setLocalMapApplyProgress(88);
        setLocalRootName(payload.rootName);
        setLocalUnmatchedFolders(payload.unmatchedFolders);
        setLocalMissingAssets(payload.missingAssets);
        setLocalLayout(payload.layout);
        setShowPhotos(true);
        setShowLabels(true);
        dirtyLocalAssetPathsRef.current = new Set(
          mappedPhotos
            .map((photo) => photo.relativePath)
            .filter((value): value is string => Boolean(value)),
        );
        movedPhotosRef.current = true;
        setHasMovedPhotos(true);
        if (layoutInteractionModeRef.current === 'preset') {
          pendingFitViewAfterPresetRef.current = true;
        }
        if (payload.missingAssets.length > 0) {
          alert(`检测到 ${payload.missingAssets.length} 个原记录文件已缺失。当前只在前端移除；点击“保存修改”时会再次确认是否删除这些位置记录。`);
        }
        if (mappedLayoutExportSnapshotRef.current) {
          mappedLayoutExportSnapshotRef.current.timings.applyMetrics = applyMetrics;
        }
        setLocalMapApplyStage(`完成映射，已写入 ${mappedPhotosWithThumbnails.length} 张本地图片`);
        setLocalMapApplyProgress(100);
        requestAnimationFrame(() => {
          setTimeout(() => {
            finishApplying();
          }, 180);
        });
      } catch (error) {
        const detail = describeUnknownError(error);
        setLocalMapApplyStage(`应用失败：${currentApplyStep}`);
        alert(`应用本地映射失败\n阶段：${currentApplyStep}\n原因：${detail}`);
        finishApplying();
      }
    };

    window.setTimeout(() => {
      if (!isCurrentRun()) return;
      setLocalMapApplyStage('进入排布任务');
      setLocalMapApplyProgress(10);
      void runApply();
    }, LOCAL_MAP_LOADING_MIN_DELAY_MS);
  }, []);

  return (
    <div className={styles.rootFull}>
      {isApplyingLocalMap ? (
        <>
          <div className={styles.loadingInteractionBlocker} aria-hidden="true" />
          <div className={styles.loadingCard} role="status" aria-live="polite">
            <div className={styles.loadingSpinner} />
            <div className={styles.loadingTitle}>正在应用预设映射</div>
            <div className={styles.loadingSubtitle}>{localMapApplyStage}</div>
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
          当前足迹组已有 {knownLocalRoots.length} 份本地映射记录，需重新选择主文件夹后恢复
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
        onViewportChange={setOuterViewport}
        onContainerSizeChange={setOuterContainerSize}
        focusPosition={focusPosition}
        onMarkerClick={handleMapMarkerClick}
        onPhotoDragEnd={handlePhotoDragEnd}
        onPhotoClick={handlePhotoClick}
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
      <button className={styles.exportBtn} onClick={handleDownloadMappedLayoutJson}>导出映射 JSON</button>

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
          groupId={selectedGroupId}
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
