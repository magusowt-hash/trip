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
const MIN_STAGE_SCALE = 0.54;
const GROUP_SAFE_GAP = 14;
const MAX_VECTOR_LAYERS = 24;
const MAX_ANGULAR_RELAX_PASSES = 10;
const TOL = 1e-8;
const ANGLE_BOUND = 1e-3;
const SHARP_ANGLE = (150 * Math.PI) / 180;
const NORMAL_ANGLE = (60 * Math.PI) / 180;

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
  const concaveBlend = isConcave ? Math.min(0.56, 0.18 + concaveDepth / Math.max(edgeSpan, 1) * 0.55) : 0;
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

function buildLayout(points: TestPoint[]) {
  if (points.length === 0) return [] as LayoutGroup[];

  const orderedRadialPath = buildImprovedCycle(buildRadialOrder(points));
  return orderedRadialPath.map((point, index) => {
    return {
      ...point,
      order: index + 1,
    };
  });
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

function computeStageScale(count: number) {
  if (count <= 12) return 1;
  const progress = Math.min((count - 12) / (50 - 12), 1);
  return 1 - (1 - MIN_STAGE_SCALE) * progress;
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

export default function TestCssPage() {
  const [count, setCount] = useState(9);
  const [seed, setSeed] = useState(0);

  const points = useMemo(() => {
    void seed;
    return buildRandomPoints(count);
  }, [count, seed]);

  const orderedPoints = useMemo(() => buildLayout(points), [points]);

  const segments = useMemo(() => {
    if (orderedPoints.length <= 1) return [] as Segment[];
    return orderedPoints.map((point, index) => ({
      from: point,
      to: orderedPoints[(index + 1) % orderedPoints.length],
    }));
  }, [orderedPoints]);

  const intersectionCount = useMemo(() => countIntersections(segments), [segments]);
  const pathLength = useMemo(() => (
    segments.reduce((sum, segment) => sum + distance(segment.from, segment.to), 0)
  ), [segments]);
  const stageScale = useMemo(() => computeStageScale(count), [count]);
  const placedGroups = useMemo(() => {
    const directions = orderedPoints.map((_, index) => buildOutwardVector(orderedPoints, index));
    const occupiedRects: LogicalRect[] = [];
    const provisionalGroups = orderedPoints.map((point, index) => {
      const { photos, photoRect } = buildMockPhotos(point);
      const geometry = buildGroupGeometryFromPhotoRect(photoRect, `图片组 ${point.order}`);
      const direction = directions[index];
      const baseLength = computeAdaptiveVectorLength(point, direction, geometry.overallRect);
      const layerStep = computeLayerStep(geometry.overallRect);
      let centerX = point.x + direction.x * baseLength;
      let centerY = point.y + direction.y * baseLength;
      const groupRect = geometry.overallRect;
      let placedRect = translateRect(groupRect, centerX, centerY);

      for (let layer = 0; layer < MAX_VECTOR_LAYERS; layer++) {
        const nextLength = baseLength + layer * layerStep;
        const nextCenterX = point.x + direction.x * nextLength;
        const nextCenterY = point.y + direction.y * nextLength;
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

    return provisionalGroups.map((group, index) => {
      const centerX = relaxedCenters[index].x;
      const centerY = relaxedCenters[index].y;
      const placedRect = translateRect(group.rect, centerX, centerY);
      const linkTarget = intersectRayWithRect(group.point.x, group.point.y, translateRect(group.geometry.photoRect, centerX, centerY));

      return {
        ...group,
        centerX,
        centerY,
        rect: placedRect,
        linkTargetX: linkTarget.x,
        linkTargetY: linkTarget.y,
      } satisfies MockGroup;
    });
  }, [orderedPoints]);

  return (
    <main className={styles.rootFull}>
      <section className={styles.stagePane}>
        <div className={styles.stage}>
          <svg viewBox={`0 0 ${STAGE_SIZE} ${STAGE_SIZE}`} className={styles.svg}>
            <g transform={`translate(${STAGE_SIZE / 2} ${STAGE_SIZE / 2}) scale(${stageScale}) translate(${-STAGE_SIZE / 2} ${-STAGE_SIZE / 2})`}>
              <rect
                x={(STAGE_SIZE - MAP_SIZE) / 2}
                y={(STAGE_SIZE - MAP_SIZE) / 2}
                width={MAP_SIZE}
                height={MAP_SIZE}
                rx="24"
                className={styles.mapRect}
              />

              {segments.map((segment) => (
                <line
                  key={`line-${segment.from.id}-${segment.to.id}`}
                  x1={STAGE_SIZE / 2 + segment.from.x}
                  y1={STAGE_SIZE / 2 + segment.from.y}
                  x2={STAGE_SIZE / 2 + segment.to.x}
                  y2={STAGE_SIZE / 2 + segment.to.y}
                  className={styles.link}
                />
              ))}

              {placedGroups.map((group) => (
                <line
                  key={`group-link-${group.point.id}`}
                  x1={STAGE_SIZE / 2 + group.point.x}
                  y1={STAGE_SIZE / 2 + group.point.y}
                  x2={STAGE_SIZE / 2 + group.linkTargetX}
                  y2={STAGE_SIZE / 2 + group.linkTargetY}
                  className={styles.groupLink}
                />
              ))}

              {placedGroups.map((group) => (
                <g key={`group-${group.point.id}`}>
                  <rect
                    x={STAGE_SIZE / 2 + group.rect.left}
                    y={STAGE_SIZE / 2 + group.rect.top}
                    width={group.rect.right - group.rect.left}
                    height={group.rect.bottom - group.rect.top}
                    rx="20"
                    className={styles.groupCard}
                  />

                  {group.photos.map((photo) => (
                    <rect
                      key={photo.id}
                      x={STAGE_SIZE / 2 + group.centerX + photo.offsetX - photo.width / 2}
                      y={STAGE_SIZE / 2 + group.centerY + photo.offsetY - photo.height / 2}
                      width={photo.width}
                      height={photo.height}
                      rx="14"
                      className={styles.groupPhoto}
                    />
                  ))}

                  <text
                    x={STAGE_SIZE / 2 + group.centerX + group.geometry.labelAnchorX}
                    y={STAGE_SIZE / 2 + group.centerY + group.geometry.labelAnchorY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={styles.groupLabel}
                  >
                    {group.title}
                  </text>

                  <circle
                    cx={STAGE_SIZE / 2 + group.centerX + group.geometry.lineAnchorX}
                    cy={STAGE_SIZE / 2 + group.centerY + group.geometry.lineAnchorY}
                    r="5"
                    className={styles.groupAnchor}
                  />
                </g>
              ))}

              {orderedPoints.map((point) => (
                <g key={`poi-${point.id}`}>
                  <circle
                    cx={STAGE_SIZE / 2 + point.x}
                    cy={STAGE_SIZE / 2 + point.y}
                    r="8"
                    className={styles.poi}
                  />
                  <text
                    x={STAGE_SIZE / 2 + point.x}
                    y={STAGE_SIZE / 2 + point.y - 16}
                    textAnchor="middle"
                    className={styles.poiLabel}
                  >
                    {point.order}
                  </text>
                </g>
              ))}
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
