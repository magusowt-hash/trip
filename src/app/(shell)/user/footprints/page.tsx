'use client';

import { createPortal } from 'react-dom';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import OuterFrame from '@/components/OuterFrame';
import FootprintGroupPanel from '@/components/FootprintGroupPanel';
import PhotoAlbumModal from '@/components/PhotoAlbumModal';
import LegendPanel from '@/components/LegendPanel';
import LocalMapModal, { type LocalMappedAssetDraft, type LocalMapLayoutSettings } from '@/components/LocalMapModal';
import { buildRadialLayout } from '@/components/localMapLayoutEngine';
import type { LineStyle } from '@/components/LegendPanel';
import type { MapMarker } from '@/components/PlanMap';
import type { PhotoItem, PoiPoint } from '@/components/OuterFrameCanvas';
import { buildPhotoRect, buildGroupGeometryFromPhotoRect, expandPhotoRect } from '@/components/localMapGroupGeometry';
import type { Viewport } from '@/lib/outerFrameCoords';
import { buildFootprintPhotoScopeKey, buildMapFootprintPhotoScopeKey } from '@/lib/footprintPhotoScope';
import styles from './footprints.module.css';

const LOCAL_THUMB_MAX_EDGE = 320;
const LOCAL_THUMB_CONCURRENCY = 2;

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

type LogicalRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type LogicalOffset = {
  offsetX: number;
  offsetY: number;
};

type LogicalSize = {
  width: number;
  height: number;
};

type RegionKey = 'N' | 'W' | 'S' | 'E';
type PendingRegionGroup = {
  placeKey: string;
  logicalX: number;
  logicalY: number;
  collisionRect: LogicalRect;
};
type PendingPlaceGroup = {
  placeKey: string;
  placePhotos: PhotoItem[];
  renderRect: LogicalRect;
  collisionRect: LogicalRect;
  logicalX: number;
  logicalY: number;
  offsets: LogicalOffset[];
};
type RegionSequence = {
  region: RegionKey;
  groups: PendingRegionGroup[];
};

type DebugPhotoSnapshot = {
  id: string;
  placeKey: string;
  placeTitle: string;
  frameX: number | null;
  frameY: number | null;
  pixelWidth: number | null;
  pixelHeight: number | null;
  sourceType: PhotoItem['sourceType'] | null;
  filename: string;
};

type DebugGroupSnapshot = {
  placeKey: string;
  placeTitle: string;
  photoCount: number;
  centerX: number | null;
  centerY: number | null;
  left: number | null;
  right: number | null;
  top: number | null;
  bottom: number | null;
};

const PHOTO_MAX_EDGE = 120;
const PHOTO_MIN_EDGE = 48;
const REGION_CENTER_ANGLE: Record<RegionKey, number> = {
  E: 0,
  S: 90,
  W: 180,
  N: 270,
};
const GROUP_SAFE_GAP = 14;

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

function buildPlaceBounds(placePhotos: PhotoItem[]): LogicalRect | null {
  const photoRect = buildPhotoRect(placePhotos, getPhotoLogicalSize);
  if (!photoRect) return null;
  const geometry = buildGroupGeometryFromPhotoRect(photoRect, placePhotos[0]?.placeTitle || '', placePhotos.length, 1);
  return geometry.groupRect;
}

function buildPlaceGeometry(placePhotos: PhotoItem[]) {
  const photoRect = buildPhotoRect(placePhotos, getPhotoLogicalSize);
  if (!photoRect) return null;
  return buildGroupGeometryFromPhotoRect(photoRect, placePhotos[0]?.placeTitle || '', placePhotos.length, 1);
}

function buildPlaceBoundsFromOffsets(placePhotos: PhotoItem[], offsets: LogicalOffset[]): LogicalRect | null {
  if (placePhotos.length === 0 || offsets.length !== placePhotos.length) return null;

  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (let i = 0; i < offsets.length; i++) {
    const size = getPhotoLogicalSize(placePhotos[i]);
    left = Math.min(left, offsets[i].offsetX - size.width / 2);
    right = Math.max(right, offsets[i].offsetX + size.width / 2);
    top = Math.min(top, offsets[i].offsetY - size.height / 2);
    bottom = Math.max(bottom, offsets[i].offsetY + size.height / 2);
  }

  if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
    return null;
  }

  const geometry = buildGroupGeometryFromPhotoRect(
    expandPhotoRect({ left, right, top, bottom }),
    placePhotos[0]?.placeTitle || '',
    placePhotos.length,
    1,
  );

  return geometry.groupRect;
}

function shiftGroupLabelDown(
  groupRect: LogicalRect,
  photoRect: LogicalRect,
  lineRect: LogicalRect,
  labelRect: LogicalRect,
  deltaY: number,
): LogicalRect {
  if (deltaY <= 0) return groupRect;
  return {
    left: groupRect.left,
    right: groupRect.right,
    top: Math.min(photoRect.top, lineRect.top),
    bottom: Math.max(groupRect.bottom, labelRect.bottom + deltaY),
  };
}

function resolveLabelDownwardCollision(
  baseGroupRect: LogicalRect,
  photoRect: LogicalRect,
  lineRect: LogicalRect,
  labelRect: LogicalRect,
  occupiedRects: LogicalRect[],
  mapRect: LogicalRect,
  gap: number,
) {
  if (occupiedRects.length === 0) return baseGroupRect;
  let resolvedRect = baseGroupRect;
  const step = 6;
  const maxShift = 72;

  for (let shift = step; shift <= maxShift; shift += step) {
    const candidate = shiftGroupLabelDown(baseGroupRect, photoRect, lineRect, labelRect, shift);
    if (!fitsAroundMap(candidate, mapRect, gap)) continue;
    if (occupiedRects.some((occupied) => rectsOverlap(candidate, occupied, gap))) continue;
    resolvedRect = candidate;
    break;
  }

  return resolvedRect;
}

function rectsOverlap(a: LogicalRect, b: LogicalRect, gap: number) {
  return !(
    a.right + gap <= b.left ||
    b.right + gap <= a.left ||
    a.bottom + gap <= b.top ||
    b.bottom + gap <= a.top
  );
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

function rectArea(rect: LogicalRect) {
  return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
}

function rectCenter(rect: LogicalRect) {
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  };
}

function buildDebugPhotoSnapshot(photos: PhotoItem[]): DebugPhotoSnapshot[] {
  return photos
    .map((photo) => ({
      id: String(photo.id),
      placeKey: photo.placeKey,
      placeTitle: photo.placeTitle,
      frameX: photo.frameX ?? null,
      frameY: photo.frameY ?? null,
      pixelWidth: photo.pixelWidth ?? null,
      pixelHeight: photo.pixelHeight ?? null,
      sourceType: photo.sourceType ?? null,
      filename: photo.filename,
    }))
    .sort((a, b) => a.placeTitle.localeCompare(b.placeTitle, 'zh-CN') || a.id.localeCompare(b.id, 'zh-CN'));
}

function buildDebugGroupSnapshot(photos: PhotoItem[]): DebugGroupSnapshot[] {
  const groups = new Map<string, PhotoItem[]>();
  for (const photo of photos) {
    const group = groups.get(photo.placeKey) || [];
    group.push(photo);
    groups.set(photo.placeKey, group);
  }

  return Array.from(groups.entries())
    .map(([placeKey, groupPhotos]) => {
      const rect = buildPlaceBounds(groupPhotos);
      const center = rect ? rectCenter(rect) : null;
      return {
        placeKey,
        placeTitle: groupPhotos[0]?.placeTitle || '',
        photoCount: groupPhotos.length,
        centerX: center ? Number(center.x.toFixed(2)) : null,
        centerY: center ? Number(center.y.toFixed(2)) : null,
        left: rect ? Number(rect.left.toFixed(2)) : null,
        right: rect ? Number(rect.right.toFixed(2)) : null,
        top: rect ? Number(rect.top.toFixed(2)) : null,
        bottom: rect ? Number(rect.bottom.toFixed(2)) : null,
      };
    })
    .sort((a, b) => a.placeTitle.localeCompare(b.placeTitle, 'zh-CN') || a.placeKey.localeCompare(b.placeKey, 'zh-CN'));
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

function translateRect(rect: LogicalRect, centerX: number, centerY: number): LogicalRect {
  return {
    left: rect.left + centerX,
    right: rect.right + centerX,
    top: rect.top + centerY,
    bottom: rect.bottom + centerY,
  };
}

function getRegionByPoint(x: number, y: number): RegionKey {
  if (Math.abs(x) > Math.abs(y)) {
    return x < 0 ? 'W' : 'E';
  }
  return y < 0 ? 'N' : 'S';
}

function normalizeAngle(angle: number) {
  const tau = Math.PI * 2;
  const normalized = angle % tau;
  return normalized >= 0 ? normalized : normalized + tau;
}

function getRegionDistanceScore(group: PendingRegionGroup, region: RegionKey) {
  switch (region) {
    case 'W':
      return group.logicalX;
    case 'E':
      return -group.logicalX;
    case 'N':
      return group.logicalY;
    case 'S':
      return -group.logicalY;
    default:
      return Number.POSITIVE_INFINITY;
  }
}

function buildSmallGroupBuckets(pendingGroups: PendingRegionGroup[]) {
  const buckets = new Map<RegionKey, PendingRegionGroup[]>([
    ['N', []],
    ['W', []],
    ['S', []],
    ['E', []],
  ]);

  const regionCandidates: Record<RegionKey, PendingRegionGroup[]> = {
    W: [...pendingGroups].sort((a, b) => a.logicalX - b.logicalX || a.logicalY - b.logicalY),
    E: [...pendingGroups].sort((a, b) => b.logicalX - a.logicalX || a.logicalY - b.logicalY),
    N: [...pendingGroups].sort((a, b) => a.logicalY - b.logicalY || a.logicalX - b.logicalX),
    S: [...pendingGroups].sort((a, b) => b.logicalY - a.logicalY || a.logicalX - b.logicalX),
  };
  const regions = ['W', 'E', 'N', 'S'] as RegionKey[];
  const rankByRegion = new Map<RegionKey, Map<string, number>>();
  for (const region of regions) {
    const rankMap = new Map<string, number>();
    regionCandidates[region].forEach((group, index) => {
      rankMap.set(group.placeKey, index);
    });
    rankByRegion.set(region, rankMap);
  }

  let bestAssignments = new Map<string, RegionKey>();
  let bestRankScore = Number.POSITIVE_INFINITY;
  let bestDistanceScore = Number.POSITIVE_INFINITY;

  function search(
    regionIndex: number,
    usedPlaceKeys: Set<string>,
    currentAssignments: Map<string, RegionKey>,
    rankScore: number,
    distanceScore: number,
  ) {
    if (currentAssignments.size === pendingGroups.length || regionIndex >= regions.length) {
      if (currentAssignments.size !== pendingGroups.length) return;
      if (
        rankScore < bestRankScore ||
        (rankScore === bestRankScore && distanceScore < bestDistanceScore)
      ) {
        bestRankScore = rankScore;
        bestDistanceScore = distanceScore;
        bestAssignments = new Map(currentAssignments);
      }
      return;
    }

    const region = regions[regionIndex];
    const candidates = regionCandidates[region];

    for (const group of candidates) {
      if (usedPlaceKeys.has(group.placeKey)) continue;
      const rank = rankByRegion.get(region)?.get(group.placeKey) ?? 999;
      currentAssignments.set(group.placeKey, region);
      usedPlaceKeys.add(group.placeKey);
      search(
        regionIndex + 1,
        usedPlaceKeys,
        currentAssignments,
        rankScore + rank,
        distanceScore + getRegionDistanceScore(group, region),
      );
      usedPlaceKeys.delete(group.placeKey);
      currentAssignments.delete(group.placeKey);
    }

    if (pendingGroups.length < regions.length - regionIndex) {
      search(regionIndex + 1, usedPlaceKeys, currentAssignments, rankScore, distanceScore);
    }
  }

  search(0, new Set<string>(), new Map<string, RegionKey>(), 0, 0);

  for (const group of pendingGroups) {
    const region = bestAssignments.get(group.placeKey);
    if (!region) continue;
    buckets.get(region)!.push(group);
  }

  return buckets;
}

function sortGroupsForRegion(region: RegionKey, groups: PendingRegionGroup[]) {
  groups.sort((a, b) => {
    if (region === 'N' || region === 'S') {
      return a.logicalX - b.logicalX || a.logicalY - b.logicalY;
    }
    return a.logicalY - b.logicalY || a.logicalX - b.logicalX;
  });
}

function buildRegionSequence(
  pendingGroups: PendingRegionGroup[],
): RegionSequence[] {
  const buckets = buildSmallGroupBuckets(pendingGroups);

  for (const [region, groups] of buckets) {
    sortGroupsForRegion(region, groups);
  }

  return (['N', 'W', 'S', 'E'] as RegionKey[]).map((region) => ({
    region,
    groups: buckets.get(region) ?? [],
  }));
}

function fitsAroundMap(rect: LogicalRect, mapRect: LogicalRect, gap: number) {
  const outsideMap =
    rect.right <= mapRect.left - gap ||
    rect.left >= mapRect.right + gap ||
    rect.bottom <= mapRect.top - gap ||
    rect.top >= mapRect.bottom + gap;
  return outsideMap;
}

function findNearestAvailableGroupCenter(
  groupRect: LogicalRect,
  occupiedRects: LogicalRect[],
  mapRect: LogicalRect,
  gap: number,
) {
  const groupWidth = groupRect.right - groupRect.left;
  const groupHeight = groupRect.bottom - groupRect.top;
  const step = Math.max(40, Math.min(groupWidth, groupHeight) / 2);
  const mapCenterX = (mapRect.left + mapRect.right) / 2;
  const mapCenterY = (mapRect.top + mapRect.bottom) / 2;

  let bestCenter: { x: number; y: number } | null = null;
  let bestDistance = Infinity;

  for (let ring = 0; ring < 24; ring++) {
    const expansion = gap + ring * Math.max(groupWidth, groupHeight, 120);
    const outer = {
      left: mapRect.left - expansion - groupWidth / 2,
      right: mapRect.right + expansion + groupWidth / 2,
      top: mapRect.top - expansion - groupHeight / 2,
      bottom: mapRect.bottom + expansion + groupHeight / 2,
    };

    const candidates: Array<{ x: number; y: number }> = [];

    for (let x = outer.left; x <= outer.right; x += step) {
      candidates.push({ x, y: outer.top });
      candidates.push({ x, y: outer.bottom });
    }
    for (let y = outer.top + step; y < outer.bottom; y += step) {
      candidates.push({ x: outer.left, y });
      candidates.push({ x: outer.right, y });
    }

    candidates.sort((a, b) => {
      const da = Math.abs(a.x - mapCenterX) + Math.abs(a.y - mapCenterY);
      const db = Math.abs(b.x - mapCenterX) + Math.abs(b.y - mapCenterY);
      return da - db;
    });

    for (const candidate of candidates) {
      const rect = translateRect(groupRect, candidate.x, candidate.y);
      if (!fitsAroundMap(rect, mapRect, gap)) continue;
      if (occupiedRects.some((occupied) => rectsOverlap(rect, occupied, gap))) continue;

      const distance = rectDistanceToMap(rect, mapRect);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestCenter = candidate;
      }
    }

    if (bestCenter) return bestCenter;
  }

  return { x: mapRect.right + gap + groupWidth, y: mapCenterY };
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
    const mapRect = {
      left: -(viewportWidth * 0.6) / 2,
      right: (viewportWidth * 0.6) / 2,
      top: -(viewportHeight * 0.8) / 2,
      bottom: (viewportHeight * 0.8) / 2,
    };
    const occupiedRects: LogicalRect[] = [];

    const existingGroups = new Map<string, PhotoItem[]>();
    for (const photo of referencePhotos) {
      if (photo.frameX == null || photo.frameY == null) continue;
      const arr = existingGroups.get(photo.placeKey) || [];
      arr.push(photo);
      existingGroups.set(photo.placeKey, arr);
    }
    for (const [, group] of existingGroups) {
      const geometry = buildPlaceGeometry(group);
      if (!geometry) continue;
      occupiedRects.push(resolveLabelDownwardCollision(
        geometry.groupRect,
        geometry.photoRect,
        geometry.lineRect,
        geometry.labelRect,
        occupiedRects,
        mapRect,
        cardSize,
      ));
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
      const renderRect = buildPlaceBoundsFromOffsets(placePhotos, offsets);
      if (!renderRect) continue;
      if (placedPhotos.length > 0) {
        const existingRect = buildPlaceBounds(placedPhotos);
        if (!existingRect) continue;
        const existingCenter = rectCenter(existingRect);
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
        const nextRect = translateRect(collisionRect, candidateCenterX, candidateCenterY);
        const occupiedByOthers = occupiedRects.filter((rect) => rect !== existingRect);
        const canExpandOutward =
          fitsAroundMap(nextRect, mapRect, cardSize) &&
          !occupiedByOthers.some((occupied) => rectsOverlap(nextRect, occupied, cardSize));

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
        const placedRect = buildPlaceBounds(placePhotos);
        if (placedRect) {
          occupiedRects.push(placedRect);
        }
        continue;
      }

      const offsetGeometry = buildGroupGeometryFromPhotoRect(
        expandPhotoRect({
          left: Math.min(...offsets.map((item, index) => item.offsetX - getPhotoLogicalSize(placePhotos[index]).width / 2)),
          right: Math.max(...offsets.map((item, index) => item.offsetX + getPhotoLogicalSize(placePhotos[index]).width / 2)),
          top: Math.min(...offsets.map((item, index) => item.offsetY - getPhotoLogicalSize(placePhotos[index]).height / 2)),
          bottom: Math.max(...offsets.map((item, index) => item.offsetY + getPhotoLogicalSize(placePhotos[index]).height / 2)),
        }),
        placePhotos[0]?.placeTitle || '',
        placePhotos.length,
        1,
      );
      const collisionRect = offsetGeometry
        ? resolveLabelDownwardCollision(
          offsetGeometry.groupRect,
          offsetGeometry.photoRect,
          offsetGeometry.lineRect,
          offsetGeometry.labelRect,
          occupiedRects,
          mapRect,
          cardSize,
        )
        : renderRect;

      pendingNewGroups.push({
        placeKey,
        placePhotos,
        renderRect,
        collisionRect,
        logicalX: logicalPointByPlaceKey.get(placeKey)?.x ?? 0,
        logicalY: logicalPointByPlaceKey.get(placeKey)?.y ?? 0,
        offsets,
      });
    }

    const useDirectRegionPlacement = pendingNewGroups.length < 5;
    if (useDirectRegionPlacement) {
      const regionSequences = buildRegionSequence(pendingNewGroups.map((group) => ({
        placeKey: group.placeKey,
        logicalX: group.logicalX,
        logicalY: group.logicalY,
        collisionRect: group.collisionRect,
      })));

      for (const sequence of regionSequences) {
        sequence.groups.forEach((group) => {
          const target = pendingNewGroups.find((item) => item.placeKey === group.placeKey);
          if (!target) return;
          const angle = REGION_CENTER_ANGLE[sequence.region];
          const radians = angle * (Math.PI / 180);
          const rayX = Math.cos(radians);
          const rayY = Math.sin(radians);
          const baseRadius = Math.max(viewportWidth, viewportHeight) * 0.38;
          const sortedOccupied = occupiedRects
            .map((rect) => ({ rect, area: rectArea(rect) }))
            .sort((a, b) => b.area - a.area);

          let chosenCenter = findNearestAvailableGroupCenter(target.collisionRect, occupiedRects, mapRect, cardSize);
          for (let radiusStep = 0; radiusStep < 8; radiusStep++) {
            const radius = baseRadius + radiusStep * Math.max(cardSize, 80);
            const centerX = rayX * radius;
            const centerY = rayY * radius;
            const rect = translateRect(target.collisionRect, centerX, centerY);
            if (!fitsAroundMap(rect, mapRect, cardSize)) continue;
            if (sortedOccupied.some((occupied) => rectsOverlap(rect, occupied.rect, cardSize))) continue;
            chosenCenter = { x: centerX, y: centerY };
            break;
          }

          for (let i = 0; i < target.placePhotos.length; i++) {
            target.placePhotos[i].frameX = chosenCenter.x + target.offsets[i].offsetX;
            target.placePhotos[i].frameY = chosenCenter.y + target.offsets[i].offsetY;
          }

          const placedRect = buildPlaceBounds(target.placePhotos);
          if (placedRect) {
            occupiedRects.push(placedRect);
          }
        });
      }
    } else {
      const placements = buildRadialLayout(
        pendingNewGroups.map((group) => ({
          id: group.placeKey,
          x: group.logicalX,
          y: group.logicalY,
          rect: group.collisionRect,
        })),
        mapRect,
      );
      const placementById = new Map(placements.map((placement) => [placement.id, placement]));

      for (const group of pendingNewGroups) {
        const chosenCenter = placementById.get(group.placeKey);
        if (!chosenCenter) continue;
        for (let i = 0; i < group.placePhotos.length; i++) {
          group.placePhotos[i].frameX = chosenCenter.centerX + group.offsets[i].offsetX;
          group.placePhotos[i].frameY = chosenCenter.centerY + group.offsets[i].offsetY;
        }

        const placedRect = buildPlaceBounds(group.placePhotos);
        if (placedRect) occupiedRects.push(placedRect);
      }
    }
  }

  // --- Map handlers ---

  function handleMapMarkerClick(marker: MapMarker) {
    if (marker.position) setFocusPosition(marker.position);
  }

  // --- Photo handlers ---

  const handlePhotoDragEnd = useCallback(async (photoId: number | string, x: number, y: number) => {
    movedPhotosRef.current = true;
    setHasMovedPhotos(true);
  }, []);

  const handlePhotoMoved = useCallback(() => {
    movedPhotosRef.current = true;
    setHasMovedPhotos(true);
  }, []);

  const handleGroupLabelDragEnd = useCallback((_placeKey: string, dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return;
    movedPhotosRef.current = true;
    setHasMovedPhotos(true);
  }, []);

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

    if (payload.layout.enabled) {
      for (const photo of mappedPhotos) {
        photo.frameX = undefined;
        photo.frameY = undefined;
      }
    }

    const unplaced = mappedPhotos.filter((photo) => photo.frameX == null || photo.frameY == null);
    if (unplaced.length > 0) {
      autoPlacePhotos(
        unplaced,
        [...photos.filter((photo) => photo.sourceType !== 'local-mapped'), ...mappedPhotos],
        payload.layout,
      );
      movedPhotosRef.current = true;
      setHasMovedPhotos(true);
    }

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
    setDebugBasePhotos(buildDebugPhotoSnapshot(debugMergedPhotos));
    setDebugBaseGroups(buildDebugGroupSnapshot(debugMergedPhotos));
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
  }, [items, photos]);

  const currentDebugPhotos = buildDebugPhotoSnapshot(photos);
  const currentDebugGroups = buildDebugGroupSnapshot(photos);
  const debugPhotoDiff = debugBasePhotos
    ? currentDebugPhotos
      .map((photo) => {
        const base = debugBasePhotos.find((item) => item.id === photo.id);
        if (!base) return { id: photo.id, placeTitle: photo.placeTitle, kind: 'added' as const, current: photo };
        const dx = photo.frameX != null && base.frameX != null ? Number((photo.frameX - base.frameX).toFixed(2)) : null;
        const dy = photo.frameY != null && base.frameY != null ? Number((photo.frameY - base.frameY).toFixed(2)) : null;
        if ((dx ?? 0) === 0 && (dy ?? 0) === 0) return null;
        return {
          id: photo.id,
          placeTitle: photo.placeTitle,
          kind: 'moved' as const,
          base: { frameX: base.frameX, frameY: base.frameY },
          current: { frameX: photo.frameX, frameY: photo.frameY },
          delta: { dx, dy },
        };
      })
      .filter((item) => !!item)
    : [];
  const debugGroupDiff = debugBaseGroups
    ? currentDebugGroups
      .map((group) => {
        const base = debugBaseGroups.find((item) => item.placeKey === group.placeKey);
        if (!base) return { placeKey: group.placeKey, placeTitle: group.placeTitle, kind: 'added' as const, current: group };
        const dx = group.centerX != null && base.centerX != null ? Number((group.centerX - base.centerX).toFixed(2)) : null;
        const dy = group.centerY != null && base.centerY != null ? Number((group.centerY - base.centerY).toFixed(2)) : null;
        const widthBase = base.left != null && base.right != null ? base.right - base.left : null;
        const widthCurrent = group.left != null && group.right != null ? group.right - group.left : null;
        const heightBase = base.top != null && base.bottom != null ? base.bottom - base.top : null;
        const heightCurrent = group.top != null && group.bottom != null ? group.bottom - group.top : null;
        const dWidth = widthBase != null && widthCurrent != null ? Number((widthCurrent - widthBase).toFixed(2)) : null;
        const dHeight = heightBase != null && heightCurrent != null ? Number((heightCurrent - heightBase).toFixed(2)) : null;
        if ((dx ?? 0) === 0 && (dy ?? 0) === 0 && (dWidth ?? 0) === 0 && (dHeight ?? 0) === 0) return null;
        return {
          placeKey: group.placeKey,
          placeTitle: group.placeTitle,
          kind: 'changed' as const,
          base: { centerX: base.centerX, centerY: base.centerY, left: base.left, right: base.right, top: base.top, bottom: base.bottom },
          current: { centerX: group.centerX, centerY: group.centerY, left: group.left, right: group.right, top: group.top, bottom: group.bottom },
          delta: { dx, dy, dWidth, dHeight },
        };
      })
      .filter((item) => !!item)
    : [];
  const debugDocument = JSON.stringify({
    generatedAt: new Date().toISOString(),
    selectedGroupId,
    localRootName,
    fitViewEnabled,
    outerScale,
    basePhotos: debugBasePhotos,
    currentPhotos: currentDebugPhotos,
    photoDiff: debugPhotoDiff,
    baseGroups: debugBaseGroups,
    currentGroups: currentDebugGroups,
    groupDiff: debugGroupDiff,
  }, null, 2);

  return (
    <div className={styles.rootFull}>
      <aside className={styles.debugDocPanel}>
        <div className={styles.debugDocHeader}>布局调试文档</div>
        <div className={styles.debugDocMeta}>
          原始 `{debugBaseGroups?.length ?? 0}` 组 / 当前 `{currentDebugGroups.length}` 组 / 变化 `{debugGroupDiff.length}`
        </div>
        <textarea
          className={styles.debugDocTextarea}
          readOnly
          value={debugDocument}
        />
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
