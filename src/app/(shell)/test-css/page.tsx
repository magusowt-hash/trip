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
const MAX_VECTOR_LAYERS = 24;
const MAX_ANGULAR_RELAX_PASSES = 10;
const TOL = 1e-8;
const ANGLE_BOUND = 1e-3;
const SHARP_ANGLE = (150 * Math.PI) / 180;
const NORMAL_ANGLE = (60 * Math.PI) / 180;
const MAX_RADIAL_PULL_PASSES = 3;
const MAX_LINK_AVOID_PASSES = 8;
const LINK_AVOID_ANGLE_STEP = Math.PI / 40;
const GAP_SHIFT_RATIO = 2;
const MAX_GAP_SHIFT_PASSES = 12;
const MIN_PERIMETER_GAP = 18;
const GAP_REBALANCE_STRENGTH = 0.34;
const DENSITY_NEIGHBOR_SPAN = 2;
const DENSITY_SHIFT_RATIO = 1.18;
const DENSITY_SHIFT_STRENGTH = 0.42;
const VIEWPORT_PADDING = 96;

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

function normalizeVector(x: number, y: number) {
  const length = Math.hypot(x, y);
  if (length < 1e-6) return { x: 0, y: -1 };
  return { x: x / length, y: y / length };
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

function angleToVector(angle: number) {
  return {
    x: Math.cos(angle),
    y: Math.sin(angle),
  };
}

function vectorAngle(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
  return Math.acos(dot);
}

function slerpVector(a: { x: number; y: number }, b: { x: number; y: number }, t = 0.5) {
  const beta = vectorAngle(a, b);
  if (beta < TOL) return a;
  const sinBeta = Math.sin(beta);
  if (Math.abs(sinBeta) < TOL) {
    return normalizeVector(a.x + b.x, a.y + b.y);
  }
  const w1 = Math.sin((1 - t) * beta) / sinBeta;
  const w2 = Math.sin(t * beta) / sinBeta;
  return normalizeVector(a.x * w1 + b.x * w2, a.y * w1 + b.y * w2);
}

function buildBisectorVector(a: { x: number; y: number }, b: { x: number; y: number }) {
  return normalizeVector(a.x + b.x, a.y + b.y);
}

function isRingBoundaryPoint(point: LayoutGroup) {
  const alpha = normalizeAngle(Math.atan2(point.y, point.x));
  return alpha < ANGLE_BOUND || Math.abs(alpha - Math.PI * 2) < ANGLE_BOUND;
}

function classifyCurvature(prevNormal: { x: number; y: number }, nextNormal: { x: number; y: number }) {
  const beta = vectorAngle(prevNormal, nextNormal);
  if (beta >= SHARP_ANGLE) return { beta, kind: 'sharp' as const };
  if (beta > NORMAL_ANGLE) return { beta, kind: 'corner' as const };
  return { beta, kind: 'smooth' as const };
}

function projectPointToMapBoundary(point: LayoutGroup) {
  const half = MAP_SIZE / 2;
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

function boundaryPerimeterPosition(boundaryPoint: { x: number; y: number }) {
  const half = MAP_SIZE / 2;
  const side = MAP_SIZE;
  const perimeter = side * 4;
  const { x, y } = boundaryPoint;

  if (Math.abs(y + half) < 1e-4) return x + half;
  if (Math.abs(x - half) < 1e-4) return side + (y + half);
  if (Math.abs(y - half) < 1e-4) return side * 2 + (half - x);
  if (Math.abs(x + half) < 1e-4) return side * 3 + (half - y);

  return ((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * perimeter;
}

function resolveOutwardNormal(points: LayoutGroup[], index: number) {
  const pointCount = points.length;
  const orientation = polygonArea(points);
  const point = points[index];
  const polygonCentroid = computePolygonCentroid(points);
  const fallback = normalizeVector(point.x - polygonCentroid.x, point.y - polygonCentroid.y);

  if (pointCount === 1) {
    return {
      vector: fallback,
      crowdAngle: Math.PI / 2,
      concaveDepth: 0,
      isConcave: false,
    };
  }

  const prev = points[(index - 1 + pointCount) % pointCount];
  const next = points[(index + 1) % pointCount];
  const incoming = normalizeVector(point.x - prev.x, point.y - prev.y);
  const outgoing = normalizeVector(next.x - point.x, next.y - point.y);
  const edgeSpan = Math.max(1e-6, distance(prev, next));
  const turnCross = orientationCross(prev, point, next);
  const signedTurn = orientation >= 0 ? turnCross : -turnCross;
  const concaveDepth = Math.max(0, -signedTurn) / edgeSpan;
  const isConcave = signedTurn < 0;
  const buildNormal = orientation >= 0
    ? (vx: number, vy: number) => ({ x: vy, y: -vx })
    : (vx: number, vy: number) => ({ x: -vy, y: vx });
  const prevNormal = buildNormal(incoming.x, incoming.y);
  const nextNormal = buildNormal(outgoing.x, outgoing.y);
  const crowdAngle = vectorAngle(incoming, outgoing);
  const boundaryPoint = isRingBoundaryPoint(point);
  const curvature = classifyCurvature(prevNormal, nextNormal);

  let resolved = prevNormal;
  if (boundaryPoint || curvature.kind === 'sharp') {
    resolved = prevNormal;
  } else if (curvature.kind === 'corner') {
    resolved = buildBisectorVector(prevNormal, nextNormal);
  } else {
    resolved = slerpVector(prevNormal, nextNormal, 0.5);
  }

  const outward = resolved.x * fallback.x + resolved.y * fallback.y >= 0
    ? resolved
    : { x: -resolved.x, y: -resolved.y };
  const concaveBlendBase = isConcave ? Math.min(0.72, 0.22 + concaveDepth / Math.max(edgeSpan, 1) * 0.62) : 0;
  const concaveBlend = Math.min(0.88, concaveBlendBase);
  const stabilized = concaveBlend > 0
    ? normalizeVector(
      outward.x * (1 - concaveBlend) + fallback.x * concaveBlend,
      outward.y * (1 - concaveBlend) + fallback.y * concaveBlend,
    )
    : outward;

  return {
    vector: stabilized,
    crowdAngle,
    concaveDepth,
    isConcave,
  };
}

function buildOutwardVector(points: LayoutGroup[], index: number): {
  x: number;
  y: number;
  crowdAngle: number;
  concaveDepth: number;
  isConcave: boolean;
} {
  const resolved = resolveOutwardNormal(points, index);

  return {
    x: resolved.vector.x,
    y: resolved.vector.y,
    crowdAngle: resolved.crowdAngle,
    concaveDepth: resolved.concaveDepth,
    isConcave: resolved.isConcave,
  };
}

function computeRayExitDistance(
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  expandedRect: LogicalRect,
): number {
  const candidates: number[] = [];

  if (dirX > 1e-6) candidates.push((expandedRect.right - originX) / dirX);
  else if (dirX < -1e-6) candidates.push((expandedRect.left - originX) / dirX);

  if (dirY > 1e-6) candidates.push((expandedRect.bottom - originY) / dirY);
  else if (dirY < -1e-6) candidates.push((expandedRect.top - originY) / dirY);

  const positive = candidates.filter((value) => Number.isFinite(value) && value >= 0);
  if (positive.length === 0) return 0;
  return Math.max(0, Math.min(...positive));
}

function computeAdaptiveVectorLength(
  point: LayoutGroup,
  direction: { x: number; y: number; crowdAngle: number; concaveDepth: number; isConcave: boolean },
  rect: LogicalRect,
): number {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const maxSize = Math.max(width, height);
  const diagonal = Math.hypot(width, height);
  const expandedMapRect = {
    left: -MAP_SIZE / 2 - GROUP_SAFE_GAP - rect.right,
    right: MAP_SIZE / 2 + GROUP_SAFE_GAP - rect.left,
    top: -MAP_SIZE / 2 - GROUP_SAFE_GAP - rect.bottom,
    bottom: MAP_SIZE / 2 + GROUP_SAFE_GAP - rect.top,
  };
  const exitDistance = computeRayExitDistance(point.x, point.y, direction.x, direction.y, expandedMapRect);
  const crowdRatio = 1 - Math.min(direction.crowdAngle, Math.PI) / Math.PI;
  const concaveCompression = direction.isConcave
    ? Math.max(0.45, 1 - Math.min(0.42, direction.concaveDepth / Math.max(diagonal, 1)))
    : 1;
  const extraLength = (maxSize * 0.45 + diagonal * 0.18 + GROUP_SAFE_GAP * (1.4 + crowdRatio * 1.8)) * concaveCompression;
  return exitDistance + extraLength;
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
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function findRadialBand(rects: LogicalRect[], centers: Array<{ x: number; y: number }>) {
  const radii = centers.map((center) => Math.hypot(center.x, center.y));
  const medianRadius = computeMedian(radii);
  const deviations = radii.map((radius) => Math.abs(radius - medianRadius));
  const medianDeviation = computeMedian(deviations);
  const maxRectSize = rects.reduce((max, rect) => Math.max(max, rect.right - rect.left, rect.bottom - rect.top), 0);
  const lower = Math.max(0, medianRadius - Math.max(maxRectSize * 0.4, medianDeviation * 2.2));
  const upper = medianRadius + Math.max(maxRectSize * 0.8, medianDeviation * 2.6, GROUP_SAFE_GAP * 6);
  return { lower, upper };
}

function constrainLayerRadii(
  groups: Array<{
    point: LayoutGroup;
    rect: LogicalRect;
    centerX: number;
    centerY: number;
  }>,
  occupiedRects: LogicalRect[],
) {
  if (groups.length <= 2) return groups.map((group) => ({ x: group.centerX, y: group.centerY }));

  let centers = groups.map((group) => ({ x: group.centerX, y: group.centerY }));

  for (let pass = 0; pass < MAX_RADIAL_PULL_PASSES; pass++) {
    const band = findRadialBand(groups.map((group) => group.rect), centers);
    let changed = false;

    for (let index = 0; index < groups.length; index++) {
      const group = groups[index];
      const center = centers[index];
      const radius = Math.hypot(center.x, center.y);
      if (radius <= band.upper + 1e-4 && radius >= band.lower - 1e-4) continue;

      const angle = Math.atan2(center.y - group.point.y, center.x - group.point.x);
      const targetRadius = Math.min(Math.max(radius, band.lower), band.upper);
      const blockedRects = [...occupiedRects];
      for (let otherIndex = 0; otherIndex < groups.length; otherIndex++) {
        if (otherIndex === index) continue;
        blockedRects.push(translateRect(groups[otherIndex].rect, centers[otherIndex].x, centers[otherIndex].y));
      }
      const candidate = findRelaxedCenter(
        group.point,
        group.rect,
        angle,
        targetRadius,
        blockedRects,
      );
      const candidateRadius = Math.hypot(candidate.x - group.point.x, candidate.y - group.point.y);
      if (candidateRadius > band.upper + 1e-4) continue;

      centers[index] = candidate;
      changed = true;
    }

    if (!changed) break;
  }

  return centers;
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
      let resolvedCenter = center;

      for (let offsetStep = 1; offsetStep <= 12; offsetStep++) {
        const candidateAngles = [
          baseAngle - LINK_AVOID_ANGLE_STEP * offsetStep,
          baseAngle + LINK_AVOID_ANGLE_STEP * offsetStep,
        ];

        for (const candidateAngle of candidateAngles) {
          const blockedRects = [...occupiedRects];
          for (let otherIndex = 0; otherIndex < groups.length; otherIndex++) {
            if (otherIndex === index) continue;
            blockedRects.push(translateRect(groups[otherIndex].rect, centers[otherIndex].x, centers[otherIndex].y));
          }

          const candidateCenter = findRelaxedCenter(
            group.point,
            group.rect,
            candidateAngle,
            baseRadius,
            blockedRects,
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
  const ordered = [...groups].sort((a, b) => a.point.order - b.point.order);
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

function buildConvexHullIds(points: TestPoint[]) {
  return new Set(buildConvexHull(points).map((point) => point.id));
}

function buildLayeredContours(points: TestPoint[]) {
  const remaining = [...points];
  const layers: TestPoint[][] = [];

  while (remaining.length > 0) {
    if (remaining.length <= 3) {
      layers.push(buildImprovedCycle(buildRadialOrder(remaining)));
      break;
    }

    const hull = buildConvexHull(remaining);
    const hullIds = buildConvexHullIds(remaining);
    layers.push(buildImprovedCycle(hull));

    const nextRemaining = remaining.filter((point) => !hullIds.has(point.id));
    if (nextRemaining.length === remaining.length) {
      layers.push(buildImprovedCycle(buildRadialOrder(nextRemaining)));
      break;
    }
    remaining.splice(0, remaining.length, ...nextRemaining);
  }

  return layers;
}

function buildLayout(points: TestPoint[]) {
  if (points.length === 0) return [] as LayoutGroup[];

  const layers = buildLayeredContours(points);
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

function findRelaxedCenter(
  point: LayoutGroup,
  rect: LogicalRect,
  angle: number,
  baseRadius: number,
  occupiedRects: LogicalRect[],
) {
  const layerStep = computeLayerStep(rect);
  for (let layer = 0; layer < MAX_VECTOR_LAYERS; layer++) {
    const radius = baseRadius + layer * layerStep;
    const centerCandidate = {
      x: point.x + Math.cos(angle) * radius,
      y: point.y + Math.sin(angle) * radius,
    };
    const nextRect = translateRect(rect, centerCandidate.x, centerCandidate.y);
    if (occupiedRects.some((occupiedRect) => rectsOverlap(nextRect, occupiedRect, GROUP_SAFE_GAP))) continue;
    return centerCandidate;
  }

  return {
    x: point.x + Math.cos(angle) * baseRadius,
    y: point.y + Math.sin(angle) * baseRadius,
  };
}

function relaxPlacedGroupAngles(
  groups: Array<{
    point: LayoutGroup;
    rect: LogicalRect;
    centerX: number;
    centerY: number;
  }>,
) {
  if (groups.length <= 2) return groups.map((group) => ({ x: group.centerX, y: group.centerY }));

  let centers = groups.map((group) => ({ x: group.centerX, y: group.centerY }));

  for (let pass = 0; pass < MAX_ANGULAR_RELAX_PASSES; pass++) {
    const ordered = groups.map((group, index) => ({
      ...group,
      index,
      angle: normalizeAngle(Math.atan2(centers[index].y - group.point.y, centers[index].x - group.point.x)),
      radius: Math.hypot(centers[index].x - group.point.x, centers[index].y - group.point.y),
    })).sort((a, b) => a.angle - b.angle);

    let changed = false;

    for (let i = 0; i < ordered.length; i++) {
      const current = ordered[i];
      const next = ordered[(i + 1) % ordered.length];
      const currentSpan = computeAngularHalfSpan(current.rect, current.radius);
      const nextSpan = computeAngularHalfSpan(next.rect, next.radius);
      const safeGap = currentSpan + nextSpan;
      const delta = normalizeAngle(next.angle - current.angle);
      if (delta >= safeGap - 1e-4) continue;

      const deficit = safeGap - delta;
      const currentTargetAngle = normalizeAngle(current.angle - deficit / 2);
      const nextTargetAngle = normalizeAngle(next.angle + deficit / 2);
      const currentOccupied = ordered
        .filter((item) => item.index !== current.index)
        .map((item) => translateRect(item.rect, centers[item.index].x, centers[item.index].y));
      const nextOccupied = ordered
        .filter((item) => item.index !== next.index)
        .map((item) => translateRect(item.rect, centers[item.index].x, centers[item.index].y));

      const currentCandidate = findRelaxedCenter(
        current.point,
        current.rect,
        currentTargetAngle,
        current.radius,
        currentOccupied,
      );
      const nextCandidate = findRelaxedCenter(
        next.point,
        next.rect,
        nextTargetAngle,
        next.radius,
        nextOccupied,
      );

      const currentRect = translateRect(current.rect, currentCandidate.x, currentCandidate.y);
      const nextRect = translateRect(next.rect, nextCandidate.x, nextCandidate.y);
      if (rectsOverlap(currentRect, nextRect, GROUP_SAFE_GAP)) continue;

      const currentMoved = Math.abs(shortestSignedAngleDelta(
        current.angle,
        Math.atan2(currentCandidate.y - current.point.y, currentCandidate.x - current.point.x),
      )) > 1e-4;
      const nextMoved = Math.abs(shortestSignedAngleDelta(
        next.angle,
        Math.atan2(nextCandidate.y - next.point.y, nextCandidate.x - next.point.x),
      )) > 1e-4;
      if (!currentMoved && !nextMoved) continue;

      centers[current.index] = currentCandidate;
      centers[next.index] = nextCandidate;
      changed = true;
    }

    if (!changed) break;
  }

  return centers;
}

function unwrapPerimeterPositions(positions: number[]) {
  const perimeter = MAP_SIZE * 4;
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

function computeDirectionalGapAverage(positions: number[], index: number, direction: -1 | 1) {
  if (positions.length <= 2) return Number.POSITIVE_INFINITY;
  const perimeter = MAP_SIZE * 4;
  let total = 0;
  let samples = 0;
  let unwrappedCursor = positions[index];

  for (let step = 0; step < DENSITY_NEIGHBOR_SPAN; step++) {
    const neighborIndex = ((index + direction * (step + 1)) % positions.length + positions.length) % positions.length;
    let neighborPosition = positions[neighborIndex];
    if (direction > 0) {
      while (neighborPosition <= unwrappedCursor) {
        neighborPosition += perimeter;
      }
      total += neighborPosition - unwrappedCursor;
    } else {
      while (neighborPosition >= unwrappedCursor) {
        neighborPosition -= perimeter;
      }
      total += unwrappedCursor - neighborPosition;
    }

    const rawGap = Math.abs(neighborPosition - unwrappedCursor);
    if (rawGap > TOL) {
      samples += 1;
    }
    unwrappedCursor = neighborPosition;
  }

  return samples === 0 ? Number.POSITIVE_INFINITY : total / samples;
}

function rebalanceBoundaryPositions(layer: LayoutGroup[]) {
  const perimeter = MAP_SIZE * 4;
  if (layer.length <= 2) {
    return layer.map((point) => boundaryPerimeterPosition(projectPointToMapBoundary(point)));
  }

  const adjusted = unwrapPerimeterPositions(
    layer.map((point) => boundaryPerimeterPosition(projectPointToMapBoundary(point))),
  );

  for (let pass = 0; pass < MAX_GAP_SHIFT_PASSES; pass++) {
    let changed = false;

    for (let index = 0; index < adjusted.length; index++) {
      const prev = index === 0 ? adjusted[adjusted.length - 1] - perimeter : adjusted[index - 1];
      const next = index === adjusted.length - 1 ? adjusted[0] + perimeter : adjusted[index + 1];
      const current = adjusted[index];
      const leftGap = current - prev;
      const rightGap = next - current;
      const smallerGap = Math.min(leftGap, rightGap);
      const largerGap = Math.max(leftGap, rightGap);
      const leftDensityGap = computeDirectionalGapAverage(adjusted, index, -1);
      const rightDensityGap = computeDirectionalGapAverage(adjusted, index, 1);
      const densitySmallerGap = Math.min(leftDensityGap, rightDensityGap);
      const densityLargerGap = Math.max(leftDensityGap, rightDensityGap);

      const gapTriggered = smallerGap >= TOL && largerGap >= smallerGap * GAP_SHIFT_RATIO;
      const densityTriggered = Number.isFinite(densitySmallerGap)
        && Number.isFinite(densityLargerGap)
        && densitySmallerGap >= TOL
        && densityLargerGap >= densitySmallerGap * DENSITY_SHIFT_RATIO;

      if (!gapTriggered && !densityTriggered) continue;

      const gapDirection = rightGap > leftGap ? 1 : -1;
      const densityDirection = rightDensityGap > leftDensityGap ? 1 : -1;
      const shiftDirection = gapTriggered && densityTriggered && gapDirection !== densityDirection
        ? (largerGap - smallerGap >= densityLargerGap - densitySmallerGap ? gapDirection : densityDirection)
        : (gapTriggered ? gapDirection : densityDirection);
      const gapDelta = largerGap - smallerGap;
      const densityDelta = Number.isFinite(densityLargerGap) && Number.isFinite(densitySmallerGap)
        ? densityLargerGap - densitySmallerGap
        : 0;
      const preferredShift = Math.max(
        MIN_PERIMETER_GAP * 0.65,
        gapDelta * GAP_REBALANCE_STRENGTH + densityDelta * DENSITY_SHIFT_STRENGTH,
      );
      const candidate = current + shiftDirection * preferredShift;
      const minAllowed = prev + MIN_PERIMETER_GAP;
      const maxAllowed = next - MIN_PERIMETER_GAP;
      const clamped = Math.max(minAllowed, Math.min(maxAllowed, candidate));

      if (Math.abs(clamped - current) < 1e-4) continue;
      adjusted[index] = clamped;
      changed = true;
    }

    if (!changed) break;
  }

  return adjusted.map((position) => ((position % perimeter) + perimeter) % perimeter);
}

function boundaryPositionToPoint(position: number) {
  const side = MAP_SIZE;
  const half = side / 2;
  const perimeter = side * 4;
  const normalized = ((position % perimeter) + perimeter) % perimeter;

  if (normalized <= side) return { x: normalized - half, y: -half };
  if (normalized <= side * 2) return { x: half, y: normalized - side - half };
  if (normalized <= side * 3) return { x: half - (normalized - side * 2), y: half };
  return { x: -half, y: half - (normalized - side * 3) };
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
      const directions = layer.map((_, index) => buildOutwardVector(layer, index));
      const balancedBoundaryPositions = rebalanceBoundaryPositions(layer);
      const provisionalGroups = layer.map((point, index) => {
        const { photos, photoRect } = buildMockPhotos(point);
        const geometry = buildGroupGeometryFromPhotoRect(photoRect, `图片组 ${point.order}`);
        const direction = directions[index];
        const baseLength = computeAdaptiveVectorLength(point, direction, geometry.overallRect);
        const layerStep = computeLayerStep(geometry.overallRect);
        const boundaryTarget = boundaryPositionToPoint(balancedBoundaryPositions[index]);
        const initialAngle = Math.atan2(boundaryTarget.y - point.y, boundaryTarget.x - point.x);
        let centerX = point.x + Math.cos(initialAngle) * baseLength;
        let centerY = point.y + Math.sin(initialAngle) * baseLength;
        const groupRect = geometry.overallRect;
        let placedRect = translateRect(groupRect, centerX, centerY);

        for (let ring = 0; ring < MAX_VECTOR_LAYERS; ring++) {
          const nextLength = baseLength + ring * layerStep;
          const nextCenterX = point.x + Math.cos(initialAngle) * nextLength;
          const nextCenterY = point.y + Math.sin(initialAngle) * nextLength;
          const nextRect = translateRect(groupRect, nextCenterX, nextCenterY);
          if (occupiedRects.some((occupiedRect) => rectsOverlap(nextRect, occupiedRect, GROUP_SAFE_GAP))) {
            continue;
          }
          centerX = nextCenterX;
          centerY = nextCenterY;
          placedRect = nextRect;
          break;
        }

        occupiedRects.push(placedRect);

        return {
          point,
          title: `图片组 ${point.order}`,
          photos,
          localPhotoRect: photoRect,
          geometry,
          centerX,
          centerY,
          rect: groupRect,
        };
      });

      const relaxedCenters = relaxPlacedGroupAngles(provisionalGroups);
      const constrainedCenters = constrainLayerRadii(
        provisionalGroups.map((group, index) => ({
          ...group,
          centerX: relaxedCenters[index].x,
          centerY: relaxedCenters[index].y,
        })),
        placed.map((group) => group.rect),
      );
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
      }
    }

    return avoidGlobalLinkCrossings(placed);
  }, [layeredPoints]);
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
