'use client';

import { useMemo, useState } from 'react';
import { buildGroupGeometryFromPhotoRect, type LogicalRect } from '@/components/localMapGroupGeometry';
import styles from './page.module.css';

type TestPoint = {
  id: number;
  x: number;
  y: number;
};

type LayoutGroup = TestPoint & {
  order: number;
  layerIndex: number;
};

type Segment = {
  from: LayoutGroup;
  to: LayoutGroup;
};

type GapLabel = {
  key: string;
  x: number;
  y: number;
  value: number;
  layerIndex: number;
};

type BoundaryAnchor = {
  index: number;
  position: number;
};

type MockPhoto = {
  id: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

type MockGroup = {
  point: LayoutGroup;
  title: string;
  photos: MockPhoto[];
  localPhotoRect: LogicalRect;
  geometry: ReturnType<typeof buildGroupGeometryFromPhotoRect>;
  centerX: number;
  centerY: number;
  rect: LogicalRect;
  linkTargetX: number;
  linkTargetY: number;
};

const STAGE_SIZE = 1120;
const MAP_SIZE = 420;
const GROUP_PADDING = 28;
const PHOTO_GAP = 14;
const MOCK_MIN_PHOTOS = 2;
const MOCK_MAX_PHOTOS = 5;
const GROUP_SAFE_GAP = 14;
const TOL = 1e-8;
const MAX_LINK_AVOID_PASSES = 8;
const LINK_AVOID_ANGLE_STEP = Math.PI / 40;
const INTRA_LAYER_ANGLE_SCAN_STEPS = 10;
const INTRA_LAYER_ANGLE_SCAN_STEP = Math.PI / 30;
const DENSITY_K = 4;
const DENSITY_LAYER_LIMIT = 4;
const CLUSTER_LINK_SCALE = 1.3;
const VIEWPORT_PADDING = 96;
const VIRTUAL_BOUNDARY_GAP = 34;
const LAYER_RADIUS_BASE = 156;
const LAYER_RADIUS_GAP = 124;
const MAX_ANGLE_OFFSET = Math.PI / 15;
const MAX_RADIUS_OFFSET = 24;
const INTERVAL_BUFFER_RATIO = 0.36;
const GAP_CLIP_STD_SCALE = 1.1;
const GAP_CLIP_RATIO_MIN = 0.72;
const GAP_CLIP_RATIO_MAX = 1.32;

function randomUnit() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] / 0xffffffff;
  }
  return Math.random();
}

function buildRandomPoints(count: number) {
  const points: TestPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      id: i + 1,
      x: randomUnit() * MAP_SIZE - MAP_SIZE / 2,
      y: randomUnit() * MAP_SIZE - MAP_SIZE / 2,
    });
  }
  return points;
}

function distance(a: TestPoint, b: TestPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function orientationCross(a: TestPoint, b: TestPoint, c: TestPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function polygonArea(points: TestPoint[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function computePolygonCentroid(points: TestPoint[]) {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  if (points.length === 2) {
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
  }

  const area = polygonArea(points);
  if (Math.abs(area) < 1e-6) {
    return computeCenterOfPoints(points);
  }

  let x = 0;
  let y = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const factor = current.x * next.y - next.x * current.y;
    x += (current.x + next.x) * factor;
    y += (current.y + next.y) * factor;
  }

  return {
    x: x / (6 * area),
    y: y / (6 * area),
  };
}

function getPointEdgePriority(point: TestPoint) {
  const leftDistance = point.x + MAP_SIZE / 2;
  const rightDistance = MAP_SIZE / 2 - point.x;
  const topDistance = point.y + MAP_SIZE / 2;
  const bottomDistance = MAP_SIZE / 2 - point.y;
  const edgeDistance = Math.min(leftDistance, rightDistance, topDistance, bottomDistance);
  const axisOffset = edgeDistance === leftDistance || edgeDistance === rightDistance
    ? Math.abs(point.y)
    : Math.abs(point.x);

  return { edgeDistance, axisOffset };
}

function rotateToBestStart(points: TestPoint[]) {
  if (points.length === 0) return [];
  let bestIndex = 0;
  let bestDistance = Infinity;
  let bestAxisOffset = Infinity;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const { edgeDistance, axisOffset } = getPointEdgePriority(point);

    if (
      edgeDistance < bestDistance
      || (edgeDistance === bestDistance && axisOffset < bestAxisOffset)
      || (edgeDistance === bestDistance && axisOffset === bestAxisOffset && point.id < points[bestIndex].id)
    ) {
      bestIndex = i;
      bestDistance = edgeDistance;
      bestAxisOffset = axisOffset;
    }
  }
  return points.map((_, index) => points[(bestIndex + index) % points.length]);
}

function computeCenterOfPoints(points: TestPoint[]) {
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function sortByCenterAngle(points: TestPoint[], centerX?: number, centerY?: number) {
  if (points.length <= 1) return [...points];

  const center = centerX == null || centerY == null
    ? computeCenterOfPoints(points)
    : { x: centerX, y: centerY };

  return [...points]
    .map((point) => ({
      point,
      angle: Math.atan2(point.y - center.y, point.x - center.x),
      radius: Math.hypot(point.x - center.x, point.y - center.y),
    }))
    .sort((a, b) => a.angle - b.angle || b.radius - a.radius || a.point.id - b.point.id)
    .map(({ point }) => point);
}

function normalizeLayerDirection(points: TestPoint[]) {
  if (points.length <= 2) return rotateToBestStart(sortByCenterAngle(points));

  const clockwise = polygonArea(points) < 0 ? [...points] : [...points].reverse();
  const counterClockwise = [...clockwise].reverse();
  const rotatedClockwise = rotateToBestStart(clockwise);
  const rotatedCounterClockwise = rotateToBestStart(counterClockwise);

  const clockwiseSignature = rotatedClockwise.map((point) => point.id).join(',');
  const counterClockwiseSignature = rotatedCounterClockwise.map((point) => point.id).join(',');
  return clockwiseSignature <= counterClockwiseSignature ? rotatedClockwise : rotatedCounterClockwise;
}

function buildConvexHull(points: TestPoint[]) {
  if (points.length <= 3) return normalizeLayerDirection(sortByCenterAngle(points));

  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y || a.id - b.id);
  const lower: TestPoint[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && orientationCross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: TestPoint[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (upper.length >= 2 && orientationCross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return normalizeLayerDirection([...lower, ...upper]);
}

function computeRadialReferenceCenter(points: TestPoint[]) {
  if (points.length <= 2) return computeCenterOfPoints(points);
  const hull = buildConvexHull(points);
  return computePolygonCentroid(hull);
}

function buildRadialOrder(points: TestPoint[]) {
  const center = computeRadialReferenceCenter(points);
  return rotateToBestStart(sortByCenterAngle(points, center.x, center.y));
}

function rectsOverlap(a: LogicalRect, b: LogicalRect, gap = 0) {
  return !(
    a.right + gap <= b.left ||
    a.left >= b.right + gap ||
    a.bottom + gap <= b.top ||
    a.top >= b.bottom + gap
  );
}

function translateRect(rect: LogicalRect, x: number, y: number): LogicalRect {
  return {
    left: rect.left + x,
    right: rect.right + x,
    top: rect.top + y,
    bottom: rect.bottom + y,
  };
}

function normalizeAngle(angle: number) {
  const tau = Math.PI * 2;
  const normalized = angle % tau;
  return normalized >= 0 ? normalized : normalized + tau;
}

function shortestSignedAngleDelta(from: number, to: number) {
  const tau = Math.PI * 2;
  let delta = normalizeAngle(to) - normalizeAngle(from);
  if (delta > Math.PI) delta -= tau;
  if (delta < -Math.PI) delta += tau;
  return delta;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getAllowedAngleOffset(groupCount: number) {
  return groupCount <= 9 ? Math.min(MAX_ANGLE_OFFSET, Math.PI / 18) : MAX_ANGLE_OFFSET;
}

function getLayerBoundaryHalf(layerIndex: number) {
  return MAP_SIZE / 2 + layerIndex * VIRTUAL_BOUNDARY_GAP;
}

function projectPointToBoundary(point: LayoutGroup, half: number) {
  const dx = point.x;
  const dy = point.y;

  if (Math.abs(dx) < TOL && Math.abs(dy) < TOL) {
    return { x: half, y: 0 };
  }

  const tx = Math.abs(dx) > TOL ? half / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const ty = Math.abs(dy) > TOL ? half / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const t = Math.min(tx, ty);

  return {
    x: dx * t,
    y: dy * t,
  };
}

function boundaryPerimeterPosition(boundaryPoint: { x: number; y: number }, half: number) {
  const side = half * 2;
  const perimeter = side * 4;
  const { x, y } = boundaryPoint;

  if (Math.abs(y + half) < 1e-4) return x + half;
  if (Math.abs(x - half) < 1e-4) return side + (y + half);
  if (Math.abs(y - half) < 1e-4) return side * 2 + (half - x);
  if (Math.abs(x + half) < 1e-4) return side * 3 + (half - y);

  return ((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * perimeter;
}

function computeLayerStep(rect: LogicalRect): number {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  return Math.max(GROUP_SAFE_GAP * 1.5, Math.max(width, height) * 0.45);
}

function computeAngularHalfSpan(rect: LogicalRect, radius: number) {
  if (radius < 1e-6) return Math.PI / 2;
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const diameter = Math.hypot(width, height) + GROUP_SAFE_GAP * 2;
  return Math.min(Math.PI / 2, Math.asin(Math.min(0.999, diameter / (2 * radius))));
}

function computeMedian(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function buildMockPhotos(group: LayoutGroup) {
  const photoCount = MOCK_MIN_PHOTOS + ((group.id * 7 + group.order) % (MOCK_MAX_PHOTOS - MOCK_MIN_PHOTOS + 1));
  const photos: MockPhoto[] = [];
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (let index = 0; index < photoCount; index++) {
    const width = 68 + ((group.id * 19 + index * 23) % 64);
    const height = 60 + ((group.id * 29 + index * 17) % 58);
    const column = index % 2;
    const row = Math.floor(index / 2);
    const offsetX = (column - 0.5) * (width + PHOTO_GAP) * 0.92;
    const offsetY = row * (height * 0.72 + PHOTO_GAP) - ((photoCount - 1) * 0.36 * (height + PHOTO_GAP));
    photos.push({
      id: `${group.id}-${index}`,
      width,
      height,
      offsetX,
      offsetY,
    });
    left = Math.min(left, offsetX - width / 2);
    right = Math.max(right, offsetX + width / 2);
    top = Math.min(top, offsetY - height / 2);
    bottom = Math.max(bottom, offsetY + height / 2);
  }

  return {
    photos,
    photoRect: {
      left: left - GROUP_PADDING,
      right: right + GROUP_PADDING,
      top: top - GROUP_PADDING,
      bottom: bottom + GROUP_PADDING,
    } satisfies LogicalRect,
  };
}

function intersectRayWithRect(fromX: number, fromY: number, rect: LogicalRect) {
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
}

function lineSegmentsIntersect(
  aStart: { x: number; y: number },
  aEnd: { x: number; y: number },
  bStart: { x: number; y: number },
  bEnd: { x: number; y: number },
) {
  const a = { id: -1, x: aStart.x, y: aStart.y };
  const b = { id: -2, x: aEnd.x, y: aEnd.y };
  const c = { id: -3, x: bStart.x, y: bStart.y };
  const d = { id: -4, x: bEnd.x, y: bEnd.y };
  return edgesCross(a, b, c, d);
}

function findLinkTarget(point: LayoutGroup, geometry: ReturnType<typeof buildGroupGeometryFromPhotoRect>, centerX: number, centerY: number) {
  return intersectRayWithRect(
    point.x,
    point.y,
    translateRect(geometry.photoRect, centerX, centerY),
  );
}

function avoidLinkCrossings(
  groups: Array<{
    point: LayoutGroup;
    rect: LogicalRect;
    geometry: ReturnType<typeof buildGroupGeometryFromPhotoRect>;
    centerX: number;
    centerY: number;
  }>,
  occupiedRects: LogicalRect[],
  lockedGroups: Array<{
    point: LayoutGroup;
    geometry: ReturnType<typeof buildGroupGeometryFromPhotoRect>;
    centerX: number;
    centerY: number;
  }> = [],
) {
  const centers = groups.map((group) => ({ x: group.centerX, y: group.centerY }));

  for (let pass = 0; pass < MAX_LINK_AVOID_PASSES; pass++) {
    let changed = false;

    for (let index = 0; index < groups.length; index++) {
      const group = groups[index];
      const center = centers[index];
      const currentTarget = findLinkTarget(group.point, group.geometry, center.x, center.y);
      let hasCrossing = false;

      for (const lockedGroup of lockedGroups) {
        const lockedTarget = findLinkTarget(
          lockedGroup.point,
          lockedGroup.geometry,
          lockedGroup.centerX,
          lockedGroup.centerY,
        );
        if (lineSegmentsIntersect(group.point, currentTarget, lockedGroup.point, lockedTarget)) {
          hasCrossing = true;
          break;
        }
      }

      for (let prevIndex = 0; prevIndex < index; prevIndex++) {
        const prevGroup = groups[prevIndex];
        const prevCenter = centers[prevIndex];
        const prevTarget = findLinkTarget(prevGroup.point, prevGroup.geometry, prevCenter.x, prevCenter.y);
        if (lineSegmentsIntersect(group.point, currentTarget, prevGroup.point, prevTarget)) {
          hasCrossing = true;
          break;
        }
      }

      if (!hasCrossing) continue;

      const baseRadius = Math.hypot(center.x - group.point.x, center.y - group.point.y);
      const baseAngle = Math.atan2(center.y - group.point.y, center.x - group.point.x);
      const allowedAngleOffset = getAllowedAngleOffset(groups.length);
      let resolvedCenter = center;

      for (let offsetStep = 1; offsetStep <= INTRA_LAYER_ANGLE_SCAN_STEPS; offsetStep++) {
        const candidateAngles = [
          baseAngle - LINK_AVOID_ANGLE_STEP * offsetStep,
          baseAngle + LINK_AVOID_ANGLE_STEP * offsetStep,
        ].filter((candidateAngle) => (
          Math.abs(shortestSignedAngleDelta(baseAngle, candidateAngle)) <= allowedAngleOffset + 1e-6
        ));

        for (const candidateAngle of candidateAngles) {
          const blockedRects = [...occupiedRects];
          for (let otherIndex = 0; otherIndex < groups.length; otherIndex++) {
            if (otherIndex === index) continue;
            blockedRects.push(translateRect(groups[otherIndex].rect, centers[otherIndex].x, centers[otherIndex].y));
          }

          const candidateCenter = findCenterInRadiusRange(
            group.point,
            group.rect,
            candidateAngle,
            Math.max(0, baseRadius - MAX_RADIUS_OFFSET),
            baseRadius + MAX_RADIUS_OFFSET,
            blockedRects,
            baseRadius,
            allowedAngleOffset,
          );
          const candidateTarget = findLinkTarget(group.point, group.geometry, candidateCenter.x, candidateCenter.y);

          let conflict = false;
          for (const lockedGroup of lockedGroups) {
            const lockedTarget = findLinkTarget(
              lockedGroup.point,
              lockedGroup.geometry,
              lockedGroup.centerX,
              lockedGroup.centerY,
            );
            if (lineSegmentsIntersect(group.point, candidateTarget, lockedGroup.point, lockedTarget)) {
              conflict = true;
              break;
            }
          }

          for (let prevIndex = 0; prevIndex < index; prevIndex++) {
            const prevGroup = groups[prevIndex];
            const prevCenter = centers[prevIndex];
            const prevTarget = findLinkTarget(prevGroup.point, prevGroup.geometry, prevCenter.x, prevCenter.y);
            if (lineSegmentsIntersect(group.point, candidateTarget, prevGroup.point, prevTarget)) {
              conflict = true;
              break;
            }
          }

          if (!conflict) {
            resolvedCenter = candidateCenter;
            changed = true;
            offsetStep = 999;
            break;
          }
        }
      }

      centers[index] = resolvedCenter;
    }

    if (!changed) break;
  }

  return centers;
}

function avoidGlobalLinkCrossings(
  groups: MockGroup[],
) {
  const ordered = [...groups].sort((a, b) => {
    if (a.point.layerIndex !== b.point.layerIndex) return a.point.layerIndex - b.point.layerIndex;
    const radiusA = Math.hypot(a.centerX, a.centerY);
    const radiusB = Math.hypot(b.centerX, b.centerY);
    return radiusA - radiusB || a.point.order - b.point.order;
  });
  const resolved: MockGroup[] = [];

  for (const group of ordered) {
    const adjustedCenter = avoidLinkCrossings(
      [{
        point: group.point,
        rect: group.rect,
        geometry: group.geometry,
        centerX: group.centerX,
        centerY: group.centerY,
      }],
      resolved.map((item) => item.rect),
      resolved.map((item) => ({
        point: item.point,
        geometry: item.geometry,
        centerX: item.centerX,
        centerY: item.centerY,
      })),
    )[0];

    const centerX = adjustedCenter.x;
    const centerY = adjustedCenter.y;
    const rect = translateRect(group.geometry.overallRect, centerX, centerY);
    const linkTarget = findLinkTarget(group.point, group.geometry, centerX, centerY);
    resolved.push({
      ...group,
      centerX,
      centerY,
      rect,
      linkTargetX: linkTarget.x,
      linkTargetY: linkTarget.y,
    });
  }

  return resolved.sort((a, b) => a.point.order - b.point.order);
}

function edgesCross(a: TestPoint, b: TestPoint, c: TestPoint, d: TestPoint) {
  if (a.id === c.id || a.id === d.id || b.id === c.id || b.id === d.id) return false;

  const abC = orientationCross(a, b, c);
  const abD = orientationCross(a, b, d);
  const cdA = orientationCross(c, d, a);
  const cdB = orientationCross(c, d, b);

  return abC * abD < 0 && cdA * cdB < 0;
}

function buildImprovedCycle(points: TestPoint[]) {
  if (points.length <= 3) return points;

  const cycle = [...points];

  for (let pass = 0; pass < 8; pass++) {
    let changed = false;

    for (let i = 0; i < cycle.length; i++) {
      const a = cycle[i];
      const b = cycle[(i + 1) % cycle.length];

      for (let j = i + 2; j < cycle.length; j++) {
        if (i === 0 && j === cycle.length - 1) continue;

        const c = cycle[j];
        const d = cycle[(j + 1) % cycle.length];

        if (!edgesCross(a, b, c, d)) continue;

        const currentCost = distance(a, b) + distance(c, d);
        const swappedCost = distance(a, c) + distance(b, d);
        if (swappedCost <= currentCost + 1e-6) {
          const reversed = cycle.slice(i + 1, j + 1).reverse();
          cycle.splice(i + 1, j - i, ...reversed);
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  return rotateToBestStart(cycle);
}

function computeKDistance(points: TestPoint[], point: TestPoint, k: number) {
  const distances = points
    .filter((candidate) => candidate.id !== point.id)
    .map((candidate) => distance(point, candidate))
    .sort((a, b) => a - b);
  if (distances.length === 0) return 0;
  return distances[Math.min(k - 1, distances.length - 1)];
}

function buildDensityLayers(points: TestPoint[]) {
  if (points.length <= 3) return [buildImprovedCycle(buildRadialOrder(points))];

  const k = Math.min(DENSITY_K, Math.max(1, points.length - 1));
  const enriched = points.map((point) => ({
    point,
    coreDistance: computeKDistance(points, point, k),
  }));
  const sortedByDensity = [...enriched].sort((a, b) => a.coreDistance - b.coreDistance || a.point.id - b.point.id);
  const medianCore = computeMedian(sortedByDensity.map((item) => item.coreDistance));
  const threshold = Math.max(medianCore * CLUSTER_LINK_SCALE, 24);
  const visited = new Set<number>();
  const clusters: TestPoint[][] = [];

  for (const entry of sortedByDensity) {
    if (visited.has(entry.point.id)) continue;
    const cluster: TestPoint[] = [];
    const queue = [entry.point];
    visited.add(entry.point.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      cluster.push(current);

      for (const candidate of sortedByDensity) {
        if (visited.has(candidate.point.id)) continue;
        const reachDistance = Math.max(
          computeKDistance(points, current, k),
          candidate.coreDistance,
          distance(current, candidate.point),
        );
        if (reachDistance <= threshold) {
          visited.add(candidate.point.id);
          queue.push(candidate.point);
        }
      }
    }

    clusters.push(cluster);
  }

  const ranked = clusters
    .map((cluster) => ({
      cluster,
      density: cluster.length <= 1
        ? Number.POSITIVE_INFINITY
        : cluster.reduce((sum, point) => sum + 1 / Math.max(computeKDistance(points, point, k), 1e-6), 0) / cluster.length,
    }))
    .sort((a, b) => b.density - a.density || b.cluster.length - a.cluster.length);

  const limited = ranked.slice(0, DENSITY_LAYER_LIMIT - 1).map((entry) => entry.cluster);
  const consumed = new Set(limited.flat().map((point) => point.id));
  const remaining = points.filter((point) => !consumed.has(point.id));
  if (remaining.length > 0) {
    limited.push(remaining);
  }

  return limited
    .filter((layer) => layer.length > 0)
    .map((layer) => {
      if (layer.length <= 3) return buildImprovedCycle(buildRadialOrder(layer));
      return buildImprovedCycle(buildRadialOrder(layer));
    });
}

function buildLayout(points: TestPoint[]) {
  if (points.length === 0) return [] as LayoutGroup[];

  const layers = buildDensityLayers(points);
  let order = 1;
  return layers.flatMap((layer, layerIndex) => layer.map((point) => ({
    ...point,
    order: order++,
    layerIndex,
  })));
}

function segmentsIntersect(first: Segment, second: Segment) {
  if (
    first.from.id === second.from.id ||
    first.from.id === second.to.id ||
    first.to.id === second.from.id ||
    first.to.id === second.to.id
  ) {
    return false;
  }

  return edgesCross(first.from, first.to, second.from, second.to);
}

function countIntersections(segments: Segment[]) {
  let total = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (segmentsIntersect(segments[i], segments[j])) total++;
    }
  }
  return total;
}

function buildAngleCandidates(baseAngle: number, allowedAngleOffset: number) {
  const maxSteps = Math.max(
    0,
    Math.min(INTRA_LAYER_ANGLE_SCAN_STEPS, Math.ceil(allowedAngleOffset / INTRA_LAYER_ANGLE_SCAN_STEP)),
  );
  const candidates = [baseAngle];

  for (let step = 1; step <= maxSteps; step++) {
    const delta = INTRA_LAYER_ANGLE_SCAN_STEP * step;
    if (delta > allowedAngleOffset + 1e-6) break;
    candidates.push(baseAngle - delta, baseAngle + delta);
  }

  return candidates;
}

function buildRadiusCandidates(minRadius: number, maxRadius: number, preferredRadius: number, layerStep: number) {
  const center = clamp(preferredRadius, minRadius, maxRadius);
  const candidates = [center];
  const maxDistance = Math.max(center - minRadius, maxRadius - center);
  const stepCount = Math.max(1, Math.ceil(maxDistance / layerStep));

  for (let step = 1; step <= stepCount; step++) {
    const delta = step * layerStep;
    const lower = center - delta;
    const upper = center + delta;

    if (lower >= minRadius + 1e-6) candidates.push(lower);
    if (upper <= maxRadius - 1e-6) candidates.push(upper);
  }

  if (!candidates.some((value) => Math.abs(value - minRadius) < 1e-6)) candidates.push(minRadius);
  if (!candidates.some((value) => Math.abs(value - maxRadius) < 1e-6)) candidates.push(maxRadius);

  return candidates;
}

function intersectLinkWithBoundary(
  point: { x: number; y: number },
  target: { x: number; y: number },
  half: number,
) {
  const dx = target.x - point.x;
  const dy = target.y - point.y;
  const candidates: Array<{ t: number; x: number; y: number }> = [];

  if (Math.abs(dx) > TOL) {
    const leftT = (-half - point.x) / dx;
    const leftY = point.y + dy * leftT;
    if (leftT >= 0 && leftT <= 1.5 && leftY >= -half - 1e-4 && leftY <= half + 1e-4) {
      candidates.push({ t: leftT, x: -half, y: leftY });
    }

    const rightT = (half - point.x) / dx;
    const rightY = point.y + dy * rightT;
    if (rightT >= 0 && rightT <= 1.5 && rightY >= -half - 1e-4 && rightY <= half + 1e-4) {
      candidates.push({ t: rightT, x: half, y: rightY });
    }
  }

  if (Math.abs(dy) > TOL) {
    const topT = (-half - point.y) / dy;
    const topX = point.x + dx * topT;
    if (topT >= 0 && topT <= 1.5 && topX >= -half - 1e-4 && topX <= half + 1e-4) {
      candidates.push({ t: topT, x: topX, y: -half });
    }

    const bottomT = (half - point.y) / dy;
    const bottomX = point.x + dx * bottomT;
    if (bottomT >= 0 && bottomT <= 1.5 && bottomX >= -half - 1e-4 && bottomX <= half + 1e-4) {
      candidates.push({ t: bottomT, x: bottomX, y: half });
    }
  }

  const hit = candidates
    .filter((candidate) => candidate.t >= 0)
    .sort((a, b) => a.t - b.t)[0];

  return hit ?? projectPointToBoundary({ id: -1, x: target.x, y: target.y, order: -1, layerIndex: -1 }, half);
}

function computeGapMean(gaps: number[]) {
  return gaps.reduce((sum, gap) => sum + gap, 0) / Math.max(1, gaps.length);
}

function computeGapStdDev(gaps: number[], mean: number) {
  if (gaps.length === 0) return 0;
  const variance = gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length;
  return Math.sqrt(variance);
}

function smoothBoundaryPositionsWithClip(positions: number[], perimeter: number) {
  if (positions.length <= 2) return positions;

  const unwrapped = unwrapPerimeterPositions(positions, perimeter);
  const gaps = unwrapped.map((position, index) => {
    const next = index === unwrapped.length - 1 ? unwrapped[0] + perimeter : unwrapped[index + 1];
    return next - position;
  });
  const mean = computeGapMean(gaps);
  const stdDev = computeGapStdDev(gaps, mean);
  const clippedGaps = gaps.map((gap) => clamp(
    gap,
    Math.max(mean * GAP_CLIP_RATIO_MIN, mean - stdDev * GAP_CLIP_STD_SCALE),
    Math.min(mean * GAP_CLIP_RATIO_MAX, mean + stdDev * GAP_CLIP_STD_SCALE),
  ));
  const smoothedGaps = clippedGaps.map((gap, index) => {
    const prev = clippedGaps[(index - 1 + clippedGaps.length) % clippedGaps.length];
    const next = clippedGaps[(index + 1) % clippedGaps.length];
    return (prev + gap * 2 + next) / 4;
  });
  const smoothedTotal = smoothedGaps.reduce((sum, gap) => sum + gap, 0);
  const scale = smoothedTotal > 1e-6 ? perimeter / smoothedTotal : 1;
  const scaledGaps = smoothedGaps.map((gap) => gap * scale);
  const rebuilt = [unwrapped[0]];

  for (let index = 1; index < unwrapped.length; index++) {
    rebuilt.push(rebuilt[index - 1] + scaledGaps[index - 1]);
  }

  return rebuilt;
}

function findCenterInRadiusRange(
  point: LayoutGroup,
  rect: LogicalRect,
  baseAngle: number,
  minRadius: number,
  maxRadius: number,
  occupiedRects: LogicalRect[],
  preferredRadius = (minRadius + maxRadius) / 2,
  allowedAngleOffset = MAX_ANGLE_OFFSET,
) {
  const layerStep = Math.max(8, computeLayerStep(rect) * 0.35);
  const radiusCandidates = buildRadiusCandidates(minRadius, maxRadius, preferredRadius, layerStep);
  const angleCandidates = buildAngleCandidates(baseAngle, allowedAngleOffset);
  let bestCandidate: { x: number; y: number; cost: number } | null = null;

  for (const radius of radiusCandidates) {
    for (const candidateAngle of angleCandidates) {
      const centerCandidate = {
        x: point.x + Math.cos(candidateAngle) * radius,
        y: point.y + Math.sin(candidateAngle) * radius,
      };
      const nextRect = translateRect(rect, centerCandidate.x, centerCandidate.y);
      if (occupiedRects.some((occupiedRect) => rectsOverlap(nextRect, occupiedRect, GROUP_SAFE_GAP))) {
        continue;
      }

      const radiusCost = Math.abs(radius - preferredRadius) / Math.max(1, layerStep);
      const angleCost = Math.abs(shortestSignedAngleDelta(baseAngle, candidateAngle)) / Math.max(INTRA_LAYER_ANGLE_SCAN_STEP, 1e-6);
      const cost = radiusCost + angleCost * 1.1;

      if (!bestCandidate || cost < bestCandidate.cost) {
        bestCandidate = {
          x: centerCandidate.x,
          y: centerCandidate.y,
          cost,
        };
      }
    }
  }

  if (bestCandidate) {
    return {
      x: bestCandidate.x,
      y: bestCandidate.y,
    };
  }

  return {
    x: point.x + Math.cos(baseAngle) * clamp(preferredRadius, minRadius, maxRadius),
    y: point.y + Math.sin(baseAngle) * clamp(preferredRadius, minRadius, maxRadius),
  };
}

function getIndependentLayerRadiusRange(layerIndex: number) {
  const radius = LAYER_RADIUS_BASE + layerIndex * LAYER_RADIUS_GAP;
  return {
    min: Math.max(0, radius - MAX_RADIUS_OFFSET),
    max: radius + MAX_RADIUS_OFFSET,
  };
}

function buildRawBoundaryAnchorPositions(
  groups: Array<{
    point: LayoutGroup;
    centerX: number;
    centerY: number;
  }>,
  half: number,
) {
  return groups.map((group) => {
    const boundaryPoint = intersectLinkWithBoundary(
      group.point,
      { x: group.centerX, y: group.centerY },
      half,
    );
    return boundaryPerimeterPosition(boundaryPoint, half);
  });
}

function buildOrderedBoundaryAnchors(
  groups: Array<{
    point: LayoutGroup;
    centerX: number;
    centerY: number;
  }>,
  half: number,
) {
  const perimeter = half * 8;
  const sorted = buildRawBoundaryAnchorPositions(groups, half)
    .map((position, index) => ({ index, position }))
    .sort((a, b) => a.position - b.position || a.index - b.index);
  const unwrapped = unwrapPerimeterPositions(sorted.map((item) => item.position), perimeter);

  return sorted.map((item, index) => ({
    ...item,
    position: unwrapped[index],
  }));
}

function buildSmoothedBoundaryAnchorPositions(
  groups: Array<{
    point: LayoutGroup;
    centerX: number;
    centerY: number;
  }>,
  half: number,
) {
  const perimeter = half * 8;
  const ordered = buildOrderedBoundaryAnchors(groups, half);
  const smoothed = smoothBoundaryPositionsWithClip(
    ordered.map((item) => item.position),
    perimeter,
  );
  const mapped = new Array(groups.length);

  for (let index = 0; index < ordered.length; index++) {
    mapped[ordered[index].index] = smoothed[index];
  }

  return mapped;
}

function distributeLayerByIntervals(
  groups: Array<{
    point: LayoutGroup;
    rect: LogicalRect;
    centerX: number;
    centerY: number;
  }>,
) {
  if (groups.length <= 2) return groups.map((group) => ({ x: group.centerX, y: group.centerY }));
  const layerIndex = groups[0]?.point.layerIndex ?? 0;
  const half = getLayerBoundaryHalf(layerIndex);
  const radiusRange = getIndependentLayerRadiusRange(layerIndex);
  const allowedAngleOffset = getAllowedAngleOffset(groups.length);
  const provisional = groups.map((group, index) => {
    const angle = normalizeAngle(Math.atan2(group.centerY - group.point.y, group.centerX - group.point.x));
    const baseRadius = (radiusRange.min + radiusRange.max) / 2;
    const span = computeAngularHalfSpan(group.rect, baseRadius);
    return {
      ...group,
      index,
      baseAngle: angle,
      radius: baseRadius,
      span,
    };
  }).sort((a, b) => a.baseAngle - b.baseAngle);
  const targetPositions = buildSmoothedBoundaryAnchorPositions(provisional, half);
  const targetAngles = targetPositions.map((position, index) => {
    const target = boundaryPositionToPointByHalf(position, half);
    return Math.atan2(target.y - provisional[index].point.y, target.x - provisional[index].point.x);
  });

  const totalSpan = provisional.reduce((sum, item) => sum + item.span * 2, 0);
  const freeAngle = Math.max(0, Math.PI * 2 - totalSpan);
  const buffer = provisional.length > 0 ? (freeAngle / provisional.length) * INTERVAL_BUFFER_RATIO : 0;

  let cursor = targetAngles[0];
  const centers = new Array(groups.length);
  const occupiedRects: LogicalRect[] = [];

  for (let i = 0; i < provisional.length; i++) {
    const item = provisional[i];
    const minAngle = cursor + item.span + buffer / 2;
    const targetAngle = targetAngles[i];
    const structuralAngle = i === 0
      ? targetAngle
      : Math.max(targetAngle, minAngle);
    const clampedAngle = clamp(
      structuralAngle,
      item.baseAngle - allowedAngleOffset,
      item.baseAngle + allowedAngleOffset,
    );
    cursor = structuralAngle + item.span + buffer / 2;
    const center = findCenterInRadiusRange(
      item.point,
      item.rect,
      clampedAngle,
      radiusRange.min,
      radiusRange.max,
      occupiedRects,
      item.radius,
      allowedAngleOffset,
    );
    centers[item.index] = center;
    occupiedRects.push(translateRect(item.rect, center.x, center.y));
  }

  return centers;
}

function unwrapPerimeterPositions(positions: number[], perimeter: number) {
  if (positions.length === 0) return [];

  const unwrapped = [positions[0]];
  for (let index = 1; index < positions.length; index++) {
    let next = positions[index];
    while (next <= unwrapped[index - 1]) {
      next += perimeter;
    }
    unwrapped.push(next);
  }
  return unwrapped;
}

function rebalanceBoundaryPositions(layer: LayoutGroup[]) {
  const half = getLayerBoundaryHalf(layer[0]?.layerIndex ?? 0);
  const perimeter = half * 8;
  if (layer.length <= 2) {
    return layer.map((point) => boundaryPerimeterPosition(projectPointToBoundary(point, half), half));
  }

  return unwrapPerimeterPositions(
    layer.map((point) => boundaryPerimeterPosition(projectPointToBoundary(point, half), half)),
    perimeter,
  );
}

function boundaryPositionToPointByHalf(position: number, half: number) {
  const side = half * 2;
  const perimeter = side * 4;
  const normalized = ((position % perimeter) + perimeter) % perimeter;

  if (normalized <= side) return { x: normalized - half, y: -half };
  if (normalized <= side * 2) return { x: half, y: normalized - side - half };
  if (normalized <= side * 3) return { x: half - (normalized - side * 2), y: half };
  return { x: -half, y: half - (normalized - side * 3) };
}

function buildGapLabels(
  layers: LayoutGroup[][],
  placedGroups: MockGroup[],
) {
  const labels: GapLabel[] = [];
  const placedById = new Map(placedGroups.map((group) => [group.point.id, group] as const));

  for (const layer of layers) {
    if (layer.length <= 1) continue;

    const layerIndex = layer[0]?.layerIndex ?? 0;
    const half = getLayerBoundaryHalf(layerIndex);
    const perimeter = half * 8;
    const orderedPlaced = layer
      .map((point) => placedById.get(point.id))
      .filter((group): group is MockGroup => Boolean(group))
      .map((group) => ({
        point: group.point,
        centerX: group.centerX,
        centerY: group.centerY,
      }));
    if (orderedPlaced.length !== layer.length) continue;
    const orderedAnchors = buildOrderedBoundaryAnchors(orderedPlaced, half);

    for (let index = 0; index < orderedAnchors.length; index++) {
      const current = orderedAnchors[index];
      const next = index === orderedAnchors.length - 1
        ? { ...orderedAnchors[0], position: orderedAnchors[0].position + perimeter }
        : orderedAnchors[index + 1];
      const gap = next.position - current.position;
      const midpoint = current.position + gap / 2;
      const anchor = boundaryPositionToPointByHalf(midpoint, half);
      const fromGroup = orderedPlaced[current.index];
      const toGroup = orderedPlaced[next.index % orderedPlaced.length];

      labels.push({
        key: `gap-${layerIndex}-${fromGroup.point.id}-${toGroup.point.id}`,
        x: anchor.x,
        y: anchor.y,
        value: gap,
        layerIndex,
      });
    }
  }

  return labels;
}

function buildAdaptiveViewport(groups: MockGroup[]) {
  const rects = groups.map((group) => group.rect);
  rects.push({
    left: -MAP_SIZE / 2,
    right: MAP_SIZE / 2,
    top: -MAP_SIZE / 2,
    bottom: MAP_SIZE / 2,
  });

  const bounds = rects.reduce((acc, rect) => ({
    left: Math.min(acc.left, rect.left),
    right: Math.max(acc.right, rect.right),
    top: Math.min(acc.top, rect.top),
    bottom: Math.max(acc.bottom, rect.bottom),
  }), {
    left: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    bottom: Number.NEGATIVE_INFINITY,
  });

  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const scale = Math.min(
    (STAGE_SIZE - VIEWPORT_PADDING * 2) / width,
    (STAGE_SIZE - VIEWPORT_PADDING * 2) / height,
  );
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;

  return {
    scale: Math.min(1, scale),
    centerX,
    centerY,
  };
}

export default function TestCssPage() {
  const [count, setCount] = useState(9);
  const [seed, setSeed] = useState(0);

  const points = useMemo(() => {
    void seed;
    return buildRandomPoints(count);
  }, [count, seed]);

  const orderedPoints = useMemo(() => buildLayout(points), [points]);
  const layeredPoints = useMemo(() => {
    const buckets = new Map<number, LayoutGroup[]>();
    for (const point of orderedPoints) {
      const layer = buckets.get(point.layerIndex) || [];
      layer.push(point);
      buckets.set(point.layerIndex, layer);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, layer]) => layer);
  }, [orderedPoints]);

  const segments = useMemo(() => {
    return layeredPoints.flatMap((layer) => {
      if (layer.length <= 1) return [] as Segment[];
      return layer.map((point, index) => ({
        from: point,
        to: layer[(index + 1) % layer.length],
      }));
    });
  }, [layeredPoints]);

  const intersectionCount = useMemo(() => countIntersections(segments), [segments]);
  const pathLength = useMemo(() => (
    segments.reduce((sum, segment) => sum + distance(segment.from, segment.to), 0)
  ), [segments]);
  const placedGroups = useMemo(() => {
    const occupiedRects: LogicalRect[] = [];
    const placed: MockGroup[] = [];

    for (const layer of layeredPoints) {
      const balancedBoundaryPositions = rebalanceBoundaryPositions(layer);
      const boundaryHalf = getLayerBoundaryHalf(layer[0]?.layerIndex ?? 0);
      const radiusRange = getIndependentLayerRadiusRange(layer[0]?.layerIndex ?? 0);
      const layerOccupiedRects = [...occupiedRects];
      const provisionalGroups = layer.map((point, index) => {
        const { photos, photoRect } = buildMockPhotos(point);
        const geometry = buildGroupGeometryFromPhotoRect(photoRect, `图片组 ${point.order}`);
        const boundaryTarget = boundaryPositionToPointByHalf(balancedBoundaryPositions[index], boundaryHalf);
        const initialAngle = Math.atan2(boundaryTarget.y - point.y, boundaryTarget.x - point.x);
        const groupRect = geometry.overallRect;
        const center = findCenterInRadiusRange(
          point,
          groupRect,
          initialAngle,
          radiusRange.min,
          radiusRange.max,
          layerOccupiedRects,
          (radiusRange.min + radiusRange.max) / 2,
          getAllowedAngleOffset(layer.length),
        );
        const placedRect = translateRect(groupRect, center.x, center.y);
        layerOccupiedRects.push(placedRect);

        return {
          point,
          title: `图片组 ${point.order}`,
          photos,
          localPhotoRect: photoRect,
          geometry,
          centerX: center.x,
          centerY: center.y,
          rect: groupRect,
        };
      });

      const constrainedCenters = distributeLayerByIntervals(provisionalGroups);
      const resolvedCenters = avoidLinkCrossings(
        provisionalGroups.map((group, index) => ({
          ...group,
          centerX: constrainedCenters[index].x,
          centerY: constrainedCenters[index].y,
        })),
        placed.map((group) => group.rect),
        placed.map((group) => ({
          point: group.point,
          geometry: group.geometry,
          centerX: group.centerX,
          centerY: group.centerY,
        })),
      );
      for (let index = 0; index < provisionalGroups.length; index++) {
        const group = provisionalGroups[index];
        const centerX = resolvedCenters[index].x;
        const centerY = resolvedCenters[index].y;
        const placedRect = translateRect(group.rect, centerX, centerY);
        const linkTarget = findLinkTarget(group.point, group.geometry, centerX, centerY);
        placed.push({
          ...group,
          centerX,
          centerY,
          rect: placedRect,
          linkTargetX: linkTarget.x,
          linkTargetY: linkTarget.y,
        });
        occupiedRects.push(placedRect);
      }
    }

    return avoidGlobalLinkCrossings(placed);
  }, [layeredPoints]);
  const gapLabels = useMemo(() => buildGapLabels(layeredPoints, placedGroups), [layeredPoints, placedGroups]);
  const viewport = useMemo(() => buildAdaptiveViewport(placedGroups), [placedGroups]);

  return (
    <main className={styles.rootFull}>
      <section className={styles.stagePane}>
        <div className={styles.stage}>
          <svg viewBox={`0 0 ${STAGE_SIZE} ${STAGE_SIZE}`} className={styles.svg}>
            <g transform={`translate(${STAGE_SIZE / 2} ${STAGE_SIZE / 2})`}>
              <g transform={`scale(${viewport.scale})`}>
                <g transform={`translate(${-viewport.centerX} ${-viewport.centerY})`}>
              <rect
                x={-MAP_SIZE / 2}
                y={-MAP_SIZE / 2}
                width={MAP_SIZE}
                height={MAP_SIZE}
                rx="24"
                className={styles.mapRect}
              />

              {segments.map((segment) => (
                <line
                  key={`line-${segment.from.id}-${segment.to.id}`}
                  x1={segment.from.x}
                  y1={segment.from.y}
                  x2={segment.to.x}
                  y2={segment.to.y}
                  className={styles.link}
                />
              ))}

              {gapLabels.map((label) => (
                <g key={label.key}>
                  <rect
                    x={label.x - 16}
                    y={label.y - 10}
                    width="32"
                    height="20"
                    rx="10"
                    className={styles.gapBadge}
                  />
                  <text
                    x={label.x}
                    y={label.y + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={styles.gapLabel}
                  >
                    {Math.round(label.value)}
                  </text>
                </g>
              ))}

              {placedGroups.map((group) => (
                <line
                  key={`group-link-${group.point.id}`}
                  x1={group.point.x}
                  y1={group.point.y}
                  x2={group.linkTargetX}
                  y2={group.linkTargetY}
                  className={styles.groupLink}
                />
              ))}

              {placedGroups.map((group) => (
                <g key={`group-${group.point.id}`}>
                  <rect
                    x={group.rect.left}
                    y={group.rect.top}
                    width={group.rect.right - group.rect.left}
                    height={group.rect.bottom - group.rect.top}
                    rx="20"
                    className={styles.groupCard}
                  />

                  {group.photos.map((photo) => (
                    <rect
                      key={photo.id}
                      x={group.centerX + photo.offsetX - photo.width / 2}
                      y={group.centerY + photo.offsetY - photo.height / 2}
                      width={photo.width}
                      height={photo.height}
                      rx="14"
                      className={styles.groupPhoto}
                    />
                  ))}

                  <text
                    x={group.centerX + group.geometry.labelAnchorX}
                    y={group.centerY + group.geometry.labelAnchorY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={styles.groupLabel}
                  >
                    {group.title}
                  </text>

                  <circle
                    cx={group.centerX + group.geometry.lineAnchorX}
                    cy={group.centerY + group.geometry.lineAnchorY}
                    r="5"
                    className={styles.groupAnchor}
                  />
                </g>
              ))}

              {orderedPoints.map((point) => (
                <g key={`poi-${point.id}`}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="8"
                    className={styles.poi}
                  />
                  <text
                    x={point.x}
                    y={point.y - 16}
                    textAnchor="middle"
                    className={styles.poiLabel}
                  >
                    {point.order}
                  </text>
                </g>
              ))}
                </g>
              </g>
            </g>
          </svg>
        </div>
      </section>

      <aside className={styles.sidePanel}>
        <div className={styles.summary}>
          <div className={styles.metric}>
            <span>坐标点数量</span>
            <strong>{points.length}</strong>
          </div>
          <div className={styles.metric}>
            <span>路径总长</span>
            <strong>{pathLength.toFixed(0)}</strong>
          </div>
          <div className={styles.metric}>
            <span>线段相交数</span>
            <strong className={intersectionCount === 0 ? styles.good : styles.bad}>{intersectionCount}</strong>
          </div>
        </div>

        <div className={styles.controls}>
          <label className={styles.control}>
            <span>数量</span>
            <input
              type="range"
              min="3"
              max="50"
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            />
            <strong>{count}</strong>
          </label>
          <button className={styles.button} onClick={() => setSeed((value) => value + 1)}>
            随机重排
          </button>
        </div>
      </aside>
    </main>
  );
}
