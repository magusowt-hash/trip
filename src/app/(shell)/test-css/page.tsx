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

type GapEntry = {
  key: string;
  fromId: number;
  toId: number;
  value: number;
};

type GapReport = {
  label: string;
  entries: GapEntry[];
  min: number;
  max: number;
  mean: number;
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
const GAUSSIAN_KERNEL = [1, 4, 6, 4, 1];
const CONSERVATION_WINDOW_RADIUS = 2;
const CONSERVATION_ALPHA = 0.42;
const BOUNDARY_CIRCLE_PADDING = 36;
const GLOBAL_REBALANCE_ANGLE_RATIO = 0.4;
const GLOBAL_REBALANCE_MAX_RADIUS_OFFSET = 12;
const LOCAL_GAP_TRIGGER_RATIO_HIGH = 1.25;
const LOCAL_GAP_TRIGGER_RATIO_LOW = 0.78;
const LOCAL_GAP_NEIGHBOR_DEPTH = 1;
const LOCAL_GAP_MIN_ANGLE_RATIO = 0.18;
const LOCAL_GAP_MAX_ANGLE_RATIO = 0.68;
const LAYER_LENGTH_SAMPLE_STEP = 4;
const LAYER_LENGTH_FINE_STEP = 1;
const LAYER_LENGTH_ADJACENT_PASSES = 10;
const LAYER_LENGTH_GLOBAL_PASSES = 12;

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

function getMapBoundaryCircleRadius() {
  return Math.hypot(MAP_SIZE / 2, MAP_SIZE / 2) + BOUNDARY_CIRCLE_PADDING;
}

function projectPointToCircle(point: { x: number; y: number }, radius: number) {
  const dx = point.x;
  const dy = point.y;

  if (Math.abs(dx) < TOL && Math.abs(dy) < TOL) {
    return { x: radius, y: 0 };
  }

  const length = Math.hypot(dx, dy);
  const scale = radius / Math.max(length, TOL);

  return {
    x: dx * scale,
    y: dy * scale,
  };
}

function circlePerimeterPosition(point: { x: number; y: number }, radius: number) {
  return normalizeAngle(Math.atan2(point.y, point.x)) * radius;
}

function circlePositionToPoint(position: number, radius: number) {
  const normalized = position / Math.max(radius, TOL);
  return {
    x: Math.cos(normalized) * radius,
    y: Math.sin(normalized) * radius,
  };
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

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898 + seed * seed * 0.0001) * 43758.5453;
  return value - Math.floor(value);
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

function rebalanceGlobalBoundaryGaps(groups: MockGroup[]) {
  if (groups.length <= 2) return groups;

  const radius = getMapBoundaryCircleRadius();
  const currentPositions = buildRawBoundaryAnchorPositions(groups.map((group) => ({
    point: group.point,
    centerX: group.centerX,
    centerY: group.centerY,
  })), radius);
  const targetPositions = buildSmoothedBoundaryAnchorPositions(
    groups.map((group) => ({
      point: group.point,
      centerX: group.centerX,
      centerY: group.centerY,
    })),
    radius,
  );
  const groupsWithTargets = groups.map((group, index) => ({
    group,
    index,
    currentPosition: currentPositions[index],
    targetPosition: targetPositions[index],
  })).sort((a, b) => a.currentPosition - b.currentPosition || a.group.point.order - b.group.point.order);

  const perimeter = Math.PI * 2 * radius;
  const gaps = groupsWithTargets.map((item, index) => {
    const next = index === groupsWithTargets.length - 1
      ? { ...groupsWithTargets[0], currentPosition: groupsWithTargets[0].currentPosition + perimeter }
      : groupsWithTargets[index + 1];
    return next.currentPosition - item.currentPosition;
  });
  const meanGap = computeGapMean(gaps);
  const adjustable = new Set<number>();

  for (let index = 0; index < gaps.length; index++) {
    const gap = gaps[index];
    if (gap <= meanGap * LOCAL_GAP_TRIGGER_RATIO_HIGH && gap >= meanGap * LOCAL_GAP_TRIGGER_RATIO_LOW) continue;

    for (let offset = -LOCAL_GAP_NEIGHBOR_DEPTH; offset <= LOCAL_GAP_NEIGHBOR_DEPTH + 1; offset++) {
      adjustable.add((index + offset + groupsWithTargets.length) % groupsWithTargets.length);
    }
  }

  if (adjustable.size === 0) return groups;

  const centers = new Array(groups.length);
  const occupiedRects: LogicalRect[] = [];
  const allowedAngleOffset = getAllowedAngleOffset(groups.length) * GLOBAL_REBALANCE_ANGLE_RATIO;

  for (let orderedIndex = 0; orderedIndex < groupsWithTargets.length; orderedIndex++) {
    const item = groupsWithTargets[orderedIndex];
    if (!adjustable.has(orderedIndex)) {
      centers[item.index] = { x: item.group.centerX, y: item.group.centerY };
      occupiedRects.push(translateRect(item.group.geometry.overallRect, item.group.centerX, item.group.centerY));
      continue;
    }

    const currentBoundaryPoint = circlePositionToPoint(item.currentPosition, radius);
    const targetBoundaryPoint = circlePositionToPoint(item.targetPosition, radius);
    const leftGap = gaps[(orderedIndex - 1 + gaps.length) % gaps.length];
    const rightGap = gaps[orderedIndex];
    const severity = Math.max(
      Math.abs(leftGap - meanGap) / Math.max(meanGap, 1e-6),
      Math.abs(rightGap - meanGap) / Math.max(meanGap, 1e-6),
    );
    const angleRatio = clamp(
      LOCAL_GAP_MIN_ANGLE_RATIO + severity * 0.32,
      LOCAL_GAP_MIN_ANGLE_RATIO,
      LOCAL_GAP_MAX_ANGLE_RATIO,
    );
    const currentAngle = Math.atan2(
      currentBoundaryPoint.y - item.group.point.y,
      currentBoundaryPoint.x - item.group.point.x,
    );
    const targetAngle = Math.atan2(
      targetBoundaryPoint.y - item.group.point.y,
      targetBoundaryPoint.x - item.group.point.x,
    );
    const adjustedAngle = currentAngle + shortestSignedAngleDelta(currentAngle, targetAngle) * angleRatio;
    const radiusRange = getIndependentLayerRadiusRange(item.group.point.layerIndex);
    const currentRadius = Math.hypot(
      item.group.centerX - item.group.point.x,
      item.group.centerY - item.group.point.y,
    );
    const center = findCenterInRadiusRange(
      item.group.point,
      item.group.geometry.overallRect,
      adjustedAngle,
      Math.max(radiusRange.min, currentRadius - GLOBAL_REBALANCE_MAX_RADIUS_OFFSET),
      Math.min(radiusRange.max, currentRadius + GLOBAL_REBALANCE_MAX_RADIUS_OFFSET),
      occupiedRects,
      currentRadius,
      Math.min(allowedAngleOffset * (0.8 + severity * 0.35), getAllowedAngleOffset(groups.length)),
    );

    centers[item.index] = center;
    occupiedRects.push(translateRect(item.group.geometry.overallRect, center.x, center.y));
  }

  return groups.map((group, index) => {
    const center = centers[index] ?? { x: group.centerX, y: group.centerY };
    const rect = translateRect(group.geometry.overallRect, center.x, center.y);
    const linkTarget = findLinkTarget(group.point, group.geometry, center.x, center.y);
    return {
      ...group,
      centerX: center.x,
      centerY: center.y,
      rect,
      linkTargetX: linkTarget.x,
      linkTargetY: linkTarget.y,
    };
  });
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

function intersectLinkWithCircle(
  point: { x: number; y: number },
  target: { x: number; y: number },
  radius: number,
) {
  const dx = target.x - point.x;
  const dy = target.y - point.y;
  const a = dx * dx + dy * dy;
  const b = 2 * (point.x * dx + point.y * dy);
  const c = point.x * point.x + point.y * point.y - radius * radius;
  const discriminant = b * b - 4 * a * c;

  if (a < TOL || discriminant < 0) {
    return projectPointToCircle(target, radius);
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const t1 = (-b - sqrtDiscriminant) / (2 * a);
  const t2 = (-b + sqrtDiscriminant) / (2 * a);
  const candidates = [t1, t2].filter((t) => t >= 0);
  if (candidates.length === 0) {
    return projectPointToCircle(target, radius);
  }

  const t = Math.min(...candidates);
  return {
    x: point.x + dx * t,
    y: point.y + dy * t,
  };
}

function computeGapMean(gaps: number[]) {
  return gaps.reduce((sum, gap) => sum + gap, 0) / Math.max(1, gaps.length);
}

function computeGapStdDev(gaps: number[], mean: number) {
  if (gaps.length === 0) return 0;
  const variance = gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length;
  return Math.sqrt(variance);
}

function gaussianSmoothCircular(values: number[]) {
  if (values.length <= 2) return values;

  const kernelSum = GAUSSIAN_KERNEL.reduce((sum, weight) => sum + weight, 0);
  const radius = Math.floor(GAUSSIAN_KERNEL.length / 2);

  return values.map((_, index) => {
    let total = 0;

    for (let offset = -radius; offset <= radius; offset++) {
      const sourceIndex = (index + offset + values.length) % values.length;
      const kernelIndex = offset + radius;
      total += values[sourceIndex] * GAUSSIAN_KERNEL[kernelIndex];
    }

    return total / kernelSum;
  });
}

function compressGapDifferencesWithConservation(values: number[]) {
  if (values.length <= 2) return values;

  const next = [...values];
  const width = CONSERVATION_WINDOW_RADIUS * 2 + 1;

  for (let index = 0; index < values.length; index++) {
    let windowSum = 0;
    for (let offset = -CONSERVATION_WINDOW_RADIUS; offset <= CONSERVATION_WINDOW_RADIUS; offset++) {
      const sourceIndex = (index + offset + values.length) % values.length;
      windowSum += values[sourceIndex];
    }

    const mean = windowSum / width;
    next[index] = Math.max(0, values[index] + CONSERVATION_ALPHA * (mean - values[index]));
  }

  const originalTotal = values.reduce((sum, value) => sum + value, 0);
  const nextTotal = next.reduce((sum, value) => sum + value, 0);
  if (nextTotal <= 1e-6) return values;

  const scale = originalTotal / nextTotal;
  return next.map((value) => value * scale);
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
  const compressedGaps = compressGapDifferencesWithConservation(clippedGaps);
  const smoothedGaps = gaussianSmoothCircular(compressedGaps);
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
  radius: number,
) {
  return groups.map((group) => {
    const boundaryPoint = intersectLinkWithCircle(
      group.point,
      { x: group.centerX, y: group.centerY },
      radius,
    );
    return circlePerimeterPosition(boundaryPoint, radius);
  });
}

function buildOrderedBoundaryAnchors(
  groups: Array<{
    point: LayoutGroup;
    centerX: number;
    centerY: number;
  }>,
  radius: number,
) {
  const perimeter = Math.PI * 2 * radius;
  const sorted = buildRawBoundaryAnchorPositions(groups, radius)
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
  radius: number,
) {
  const perimeter = Math.PI * 2 * radius;
  const ordered = buildOrderedBoundaryAnchors(groups, radius);
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

function buildCenterByAngleAndRadius(point: LayoutGroup, angle: number, radius: number) {
  return {
    x: point.x + Math.cos(angle) * radius,
    y: point.y + Math.sin(angle) * radius,
  };
}

function buildRectByAngleAndRadius(
  point: LayoutGroup,
  rect: LogicalRect,
  angle: number,
  radius: number,
) {
  const center = buildCenterByAngleAndRadius(point, angle, radius);
  return translateRect(rect, center.x, center.y);
}

function computeRayExitDistance(
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  expandedRect: LogicalRect,
) {
  const candidates: number[] = [];

  if (dirX > TOL) candidates.push((expandedRect.right - originX) / dirX);
  else if (dirX < -TOL) candidates.push((expandedRect.left - originX) / dirX);

  if (dirY > TOL) candidates.push((expandedRect.bottom - originY) / dirY);
  else if (dirY < -TOL) candidates.push((expandedRect.top - originY) / dirY);

  const positive = candidates.filter((value) => Number.isFinite(value) && value >= 0);
  if (positive.length === 0) return 0;
  return Math.max(0, Math.min(...positive));
}

function computeMinRadiusOutsideMap(
  point: LayoutGroup,
  rect: LogicalRect,
  angle: number,
) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const expandedMapRect = {
    left: -MAP_SIZE / 2 - GROUP_SAFE_GAP - rect.right,
    right: MAP_SIZE / 2 + GROUP_SAFE_GAP - rect.left,
    top: -MAP_SIZE / 2 - GROUP_SAFE_GAP - rect.bottom,
    bottom: MAP_SIZE / 2 + GROUP_SAFE_GAP - rect.top,
  };

  return computeRayExitDistance(
    point.x,
    point.y,
    dirX,
    dirY,
    expandedMapRect,
  );
}

function findCenterAlongFixedAngle(
  point: LayoutGroup,
  rect: LogicalRect,
  angle: number,
  minRadius: number,
  maxRadius: number,
  occupiedRects: LogicalRect[],
  preferredRadius: number,
) {
  let bestCenter: { x: number; y: number; cost: number } | null = null;

  for (const radius of buildRadiusSamples(minRadius, maxRadius, LAYER_LENGTH_FINE_STEP)) {
    const center = buildCenterByAngleAndRadius(point, angle, radius);
    const nextRect = translateRect(rect, center.x, center.y);
    if (occupiedRects.some((occupiedRect) => rectsOverlap(nextRect, occupiedRect, GROUP_SAFE_GAP))) {
      continue;
    }

    const cost = Math.abs(radius - preferredRadius);
    if (!bestCenter || cost < bestCenter.cost) {
      bestCenter = {
        x: center.x,
        y: center.y,
        cost,
      };
    }
  }

  if (bestCenter) {
    return {
      x: bestCenter.x,
      y: bestCenter.y,
    };
  }

  const fallbackRadius = clamp(preferredRadius, minRadius, maxRadius);
  return buildCenterByAngleAndRadius(point, angle, fallbackRadius);
}

function buildRadiusSamples(min: number, max: number, step: number) {
  const samples: number[] = [];
  for (let value = min; value <= max + TOL; value += step) {
    samples.push(Number(value.toFixed(6)));
  }
  const clampedMax = Number(max.toFixed(6));
  if (samples.length === 0 || Math.abs(samples[samples.length - 1] - clampedMax) > TOL) {
    samples.push(clampedMax);
  }
  return samples;
}

function isRadiusCandidateSafeAgainstNeighbors(
  item: {
    point: LayoutGroup;
    rect: LogicalRect;
    targetAngle: number;
  },
  radius: number,
  prev: {
    point: LayoutGroup;
    rect: LogicalRect;
    targetAngle: number;
  } | null,
  prevRadius: number,
  next: {
    point: LayoutGroup;
    rect: LogicalRect;
    targetAngle: number;
  } | null,
  nextRadius: number,
) {
  const candidateRect = buildRectByAngleAndRadius(item.point, item.rect, item.targetAngle, radius);
  const collidesPrev = prev
    ? rectsOverlap(
      candidateRect,
      buildRectByAngleAndRadius(prev.point, prev.rect, prev.targetAngle, prevRadius),
      GROUP_SAFE_GAP,
    )
    : false;
  const collidesNext = next
    ? rectsOverlap(
      candidateRect,
      buildRectByAngleAndRadius(next.point, next.rect, next.targetAngle, nextRadius),
      GROUP_SAFE_GAP,
    )
    : false;

  return {
    candidateRect,
    collidesPrev,
    collidesNext,
  };
}

function rectCollidesWithOtherLayerItems(
  items: Array<{
    point: LayoutGroup;
    rect: LogicalRect;
    targetAngle: number;
  }>,
  radii: number[],
  currentIndex: number,
  candidateRect: LogicalRect,
  ignoreIndices: number[] = [],
) {
  const ignore = new Set<number>([currentIndex, ...ignoreIndices]);
  for (let index = 0; index < items.length; index++) {
    if (ignore.has(index)) continue;
    const otherRect = buildRectByAngleAndRadius(
      items[index].point,
      items[index].rect,
      items[index].targetAngle,
      radii[index],
    );
    if (rectsOverlap(candidateRect, otherRect, GROUP_SAFE_GAP)) return true;
  }
  return false;
}

function computeLayerLegalRadiusRange(
  item: {
    point: LayoutGroup;
    rect: LogicalRect;
    targetAngle: number;
    baseRadius: number;
  },
  prev: {
    point: LayoutGroup;
    rect: LogicalRect;
    targetAngle: number;
    baseRadius: number;
  } | null,
  next: {
    point: LayoutGroup;
    rect: LogicalRect;
    targetAngle: number;
    baseRadius: number;
  } | null,
  radiusRange: { min: number; max: number },
) {
  let bestRadius = clamp(item.baseRadius, radiusRange.min, radiusRange.max);
  let bestScore = Number.POSITIVE_INFINITY;
  let low = bestRadius;
  let high = bestRadius;
  let foundStart = false;
  let foundEnd = false;

  for (const radius of buildRadiusSamples(radiusRange.min, radiusRange.max, LAYER_LENGTH_SAMPLE_STEP)) {
    const { collidesPrev, collidesNext } = isRadiusCandidateSafeAgainstNeighbors(
      item,
      radius,
      prev,
      prev?.baseRadius ?? radius,
      next,
      next?.baseRadius ?? radius,
    );

    const conflictCount = Number(collidesPrev) + Number(collidesNext);
    const score = conflictCount * 10000 + Math.abs(radius - item.baseRadius);
    if (score < bestScore) {
      bestScore = score;
      bestRadius = radius;
    }

    if (collidesPrev || collidesNext) {
      if (foundStart && !foundEnd) {
        high = Math.max(low, radius - LAYER_LENGTH_SAMPLE_STEP);
        foundEnd = true;
      }
      continue;
    }
    if (!foundStart) {
      low = radius;
      high = radius;
      foundStart = true;
      continue;
    }
    high = radius;
  }

  if (foundStart) {
    return {
      low,
      high: Math.max(low, high),
    };
  }

  return {
    low: bestRadius,
    high: bestRadius,
  };
}

function computeDynamicLayerLegalRadiusRange(
  items: Array<{
    point: LayoutGroup;
    rect: LogicalRect;
    targetAngle: number;
    baseRadius: number;
    radiusLow: number;
    radiusHigh: number;
  }>,
  radii: number[],
  index: number,
) {
  const current = items[index];
  const prevIndex = (index - 1 + items.length) % items.length;
  const nextIndex = (index + 1) % items.length;
  const prev = items[prevIndex];
  const next = items[nextIndex];
  const prevRadius = radii[prevIndex];
  const nextRadius = radii[nextIndex];
  let bestRadius = clamp(radii[index], current.radiusLow, current.radiusHigh);
  let bestScore = Number.POSITIVE_INFINITY;
  let low = bestRadius;
  let high = bestRadius;
  let foundStart = false;
  let foundEnd = false;

  for (const radius of buildRadiusSamples(current.radiusLow, current.radiusHigh, LAYER_LENGTH_SAMPLE_STEP)) {
    const { collidesPrev, collidesNext } = isRadiusCandidateSafeAgainstNeighbors(
      current,
      radius,
      prev,
      prevRadius,
      next,
      nextRadius,
    );
    const conflictCount = Number(collidesPrev) + Number(collidesNext);
    const score = conflictCount * 10000 + Math.abs(radius - current.baseRadius);
    if (score < bestScore) {
      bestScore = score;
      bestRadius = radius;
    }

    if (collidesPrev || collidesNext) {
      if (foundStart && !foundEnd) {
        high = Math.max(low, radius - LAYER_LENGTH_SAMPLE_STEP);
        foundEnd = true;
      }
      continue;
    }

    if (!foundStart) {
      low = radius;
      high = radius;
      foundStart = true;
      continue;
    }
    high = radius;
  }

  if (foundStart) {
    return {
      low,
      high: Math.max(low, high),
    };
  }

  return {
    low: bestRadius,
    high: bestRadius,
  };
}

function findBestPairRadiiForCollision(
  items: Array<{
    point: LayoutGroup;
    rect: LogicalRect;
    targetAngle: number;
    baseRadius: number;
    radiusLow: number;
    radiusHigh: number;
  }>,
  radii: number[],
  currentIndex: number,
  nextIndex: number,
  current: {
    point: LayoutGroup;
    rect: LogicalRect;
    targetAngle: number;
    baseRadius: number;
    radiusLow: number;
    radiusHigh: number;
  },
  next: {
    point: LayoutGroup;
    rect: LogicalRect;
    targetAngle: number;
    baseRadius: number;
    radiusLow: number;
    radiusHigh: number;
  },
  currentRadius: number,
  nextRadius: number,
) {
  let bestPair: { currentRadius: number; nextRadius: number; score: number } | null = null;
  const currentCoarse = buildRadiusSamples(current.radiusLow, current.radiusHigh, LAYER_LENGTH_SAMPLE_STEP);
  const nextCoarse = buildRadiusSamples(next.radiusLow, next.radiusHigh, LAYER_LENGTH_SAMPLE_STEP);

  for (const currentCandidate of currentCoarse) {
    for (const nextCandidate of nextCoarse) {
      const currentRect = buildRectByAngleAndRadius(
        current.point,
        current.rect,
        current.targetAngle,
        currentCandidate,
      );
      const nextRect = buildRectByAngleAndRadius(
        next.point,
        next.rect,
        next.targetAngle,
        nextCandidate,
      );
      if (rectsOverlap(currentRect, nextRect, GROUP_SAFE_GAP)) continue;
      if (rectCollidesWithOtherLayerItems(items, radii, currentIndex, currentRect, [nextIndex])) continue;
      if (rectCollidesWithOtherLayerItems(items, radii, nextIndex, nextRect, [currentIndex])) continue;

      const score = Math.abs(currentCandidate - currentRadius)
        + Math.abs(nextCandidate - nextRadius)
        + Math.abs(currentCandidate - current.baseRadius) * 0.3
        + Math.abs(nextCandidate - next.baseRadius) * 0.3;
      if (!bestPair || score < bestPair.score) {
        bestPair = {
          currentRadius: currentCandidate,
          nextRadius: nextCandidate,
          score,
        };
      }
    }
  }

  if (!bestPair) return null;

  const currentFineMin = Math.max(current.radiusLow, bestPair.currentRadius - LAYER_LENGTH_SAMPLE_STEP);
  const currentFineMax = Math.min(current.radiusHigh, bestPair.currentRadius + LAYER_LENGTH_SAMPLE_STEP);
  const nextFineMin = Math.max(next.radiusLow, bestPair.nextRadius - LAYER_LENGTH_SAMPLE_STEP);
  const nextFineMax = Math.min(next.radiusHigh, bestPair.nextRadius + LAYER_LENGTH_SAMPLE_STEP);

  for (const currentCandidate of buildRadiusSamples(currentFineMin, currentFineMax, LAYER_LENGTH_FINE_STEP)) {
    for (const nextCandidate of buildRadiusSamples(nextFineMin, nextFineMax, LAYER_LENGTH_FINE_STEP)) {
      const currentRect = buildRectByAngleAndRadius(
        current.point,
        current.rect,
        current.targetAngle,
        currentCandidate,
      );
      const nextRect = buildRectByAngleAndRadius(
        next.point,
        next.rect,
        next.targetAngle,
        nextCandidate,
      );
      if (rectsOverlap(currentRect, nextRect, GROUP_SAFE_GAP)) continue;
      if (rectCollidesWithOtherLayerItems(items, radii, currentIndex, currentRect, [nextIndex])) continue;
      if (rectCollidesWithOtherLayerItems(items, radii, nextIndex, nextRect, [currentIndex])) continue;

      const score = Math.abs(currentCandidate - currentRadius)
        + Math.abs(nextCandidate - nextRadius)
        + Math.abs(currentCandidate - current.baseRadius) * 0.3
        + Math.abs(nextCandidate - next.baseRadius) * 0.3;
      if (score < bestPair.score) {
        bestPair = {
          currentRadius: currentCandidate,
          nextRadius: nextCandidate,
          score,
        };
      }
    }
  }

  return bestPair;
}

function resolveAdjacentLayerRadiusConflicts(
  items: Array<{
    point: LayoutGroup;
    rect: LogicalRect;
    targetAngle: number;
    baseRadius: number;
    radiusLow: number;
    radiusHigh: number;
  }>,
  radii: number[],
) {
  const nextRadii = [...radii];

  for (let pass = 0; pass < LAYER_LENGTH_ADJACENT_PASSES; pass++) {
    let changed = false;

    for (let index = 0; index < items.length; index++) {
      const nextIndex = (index + 1) % items.length;
      const current = items[index];
      const next = items[nextIndex];
      const currentRange = computeDynamicLayerLegalRadiusRange(items, nextRadii, index);
      const nextRange = computeDynamicLayerLegalRadiusRange(items, nextRadii, nextIndex);
      const currentRect = buildRectByAngleAndRadius(current.point, current.rect, current.targetAngle, nextRadii[index]);
      const nextRect = buildRectByAngleAndRadius(next.point, next.rect, next.targetAngle, nextRadii[nextIndex]);
      if (!rectsOverlap(currentRect, nextRect, GROUP_SAFE_GAP)) continue;

      const bestPair = findBestPairRadiiForCollision(
        items,
        nextRadii,
        index,
        nextIndex,
        {
          ...current,
          radiusLow: currentRange.low,
          radiusHigh: currentRange.high,
        },
        {
          ...next,
          radiusLow: nextRange.low,
          radiusHigh: nextRange.high,
        },
        nextRadii[index],
        nextRadii[nextIndex],
      );
      if (!bestPair) continue;
      if (Math.abs(bestPair.currentRadius - nextRadii[index]) > TOL || Math.abs(bestPair.nextRadius - nextRadii[nextIndex]) > TOL) {
        nextRadii[index] = bestPair.currentRadius;
        nextRadii[nextIndex] = bestPair.nextRadius;
        changed = true;
      }
    }

    if (!changed) break;
  }

  return nextRadii;
}

function resolveGlobalLayerRadiusConflicts(
  items: Array<{
    point: LayoutGroup;
    rect: LogicalRect;
    targetAngle: number;
    baseRadius: number;
    radiusLow: number;
    radiusHigh: number;
  }>,
  radii: number[],
) {
  const nextRadii = [...radii];

  for (let pass = 0; pass < LAYER_LENGTH_GLOBAL_PASSES; pass++) {
    let changed = false;

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const rectA = buildRectByAngleAndRadius(items[i].point, items[i].rect, items[i].targetAngle, nextRadii[i]);
        const rectB = buildRectByAngleAndRadius(items[j].point, items[j].rect, items[j].targetAngle, nextRadii[j]);
        if (!rectsOverlap(rectA, rectB, GROUP_SAFE_GAP)) continue;

        let bestPair: { radiusI: number; radiusJ: number; score: number } | null = null;

        for (const radiusI of buildRadiusSamples(items[i].radiusLow, items[i].radiusHigh, LAYER_LENGTH_SAMPLE_STEP)) {
          for (const radiusJ of buildRadiusSamples(items[j].radiusLow, items[j].radiusHigh, LAYER_LENGTH_SAMPLE_STEP)) {
            const candidateRectA = buildRectByAngleAndRadius(
              items[i].point,
              items[i].rect,
              items[i].targetAngle,
              radiusI,
            );
            const candidateRectB = buildRectByAngleAndRadius(
              items[j].point,
              items[j].rect,
              items[j].targetAngle,
              radiusJ,
            );
            if (rectsOverlap(candidateRectA, candidateRectB, GROUP_SAFE_GAP)) continue;
            if (rectCollidesWithOtherLayerItems(items, nextRadii, i, candidateRectA, [j])) continue;
            if (rectCollidesWithOtherLayerItems(items, nextRadii, j, candidateRectB, [i])) continue;

            const score = Math.abs(radiusI - nextRadii[i])
              + Math.abs(radiusJ - nextRadii[j])
              + Math.abs(radiusI - items[i].baseRadius) * 0.3
              + Math.abs(radiusJ - items[j].baseRadius) * 0.3;
            if (!bestPair || score < bestPair.score) {
              bestPair = { radiusI, radiusJ, score };
            }
          }
        }

        if (bestPair) {
          const fineMinI = Math.max(items[i].radiusLow, bestPair.radiusI - LAYER_LENGTH_SAMPLE_STEP);
          const fineMaxI = Math.min(items[i].radiusHigh, bestPair.radiusI + LAYER_LENGTH_SAMPLE_STEP);
          const fineMinJ = Math.max(items[j].radiusLow, bestPair.radiusJ - LAYER_LENGTH_SAMPLE_STEP);
          const fineMaxJ = Math.min(items[j].radiusHigh, bestPair.radiusJ + LAYER_LENGTH_SAMPLE_STEP);

          for (const radiusI of buildRadiusSamples(fineMinI, fineMaxI, LAYER_LENGTH_FINE_STEP)) {
            for (const radiusJ of buildRadiusSamples(fineMinJ, fineMaxJ, LAYER_LENGTH_FINE_STEP)) {
              const candidateRectA = buildRectByAngleAndRadius(
                items[i].point,
                items[i].rect,
                items[i].targetAngle,
                radiusI,
              );
              const candidateRectB = buildRectByAngleAndRadius(
                items[j].point,
                items[j].rect,
                items[j].targetAngle,
                radiusJ,
              );
              if (rectsOverlap(candidateRectA, candidateRectB, GROUP_SAFE_GAP)) continue;
              if (rectCollidesWithOtherLayerItems(items, nextRadii, i, candidateRectA, [j])) continue;
              if (rectCollidesWithOtherLayerItems(items, nextRadii, j, candidateRectB, [i])) continue;

              const score = Math.abs(radiusI - nextRadii[i])
                + Math.abs(radiusJ - nextRadii[j])
                + Math.abs(radiusI - items[i].baseRadius) * 0.3
                + Math.abs(radiusJ - items[j].baseRadius) * 0.3;
              if (score < bestPair.score) {
                bestPair = { radiusI, radiusJ, score };
              }
            }
          }
        }

        if (!bestPair) continue;
        if (Math.abs(bestPair.radiusI - nextRadii[i]) > TOL) {
          nextRadii[i] = bestPair.radiusI;
          changed = true;
        }
        if (Math.abs(bestPair.radiusJ - nextRadii[j]) > TOL) {
          nextRadii[j] = bestPair.radiusJ;
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  return nextRadii;
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
  const radiusRange = getIndependentLayerRadiusRange(layerIndex);
  const structured = groups.map((group, index) => {
    const targetAngle = Math.atan2(group.centerY - group.point.y, group.centerX - group.point.x);
    const baseRadius = Math.hypot(group.centerX - group.point.x, group.centerY - group.point.y);
    return {
      ...group,
      index,
      baseRadius,
      targetAngle,
    };
  }).sort((a, b) => a.point.order - b.point.order);
  const constrained = structured.map((item, index) => {
    const prev = index > 0 ? structured[index - 1] : structured[structured.length - 1];
    const next = index < structured.length - 1 ? structured[index + 1] : structured[0];
    const legal = computeLayerLegalRadiusRange(item, prev, next, radiusRange);
    return {
      ...item,
      radiusLow: legal.low,
      radiusHigh: legal.high,
    };
  });
  const sampledRadii = constrained.map((item) => {
    const seed = item.point.id * 97 + item.point.order * 131 + item.point.layerIndex * 173;
    const unit = seededUnit(seed);
    return item.radiusLow + (item.radiusHigh - item.radiusLow) * unit;
  });
  const adjacentResolved = resolveAdjacentLayerRadiusConflicts(constrained, sampledRadii);
  const globallyResolved = resolveGlobalLayerRadiusConflicts(constrained, adjacentResolved);
  const centers = new Array(groups.length);
  const occupiedRects: LogicalRect[] = [];

  for (let index = 0; index < constrained.length; index++) {
    const item = constrained[index];
    const minOutsideRadius = computeMinRadiusOutsideMap(
      item.point,
      item.rect,
      item.targetAngle,
    );
    const resolvedRadius = Math.max(globallyResolved[index], minOutsideRadius);
    const center = findCenterAlongFixedAngle(
      item.point,
      item.rect,
      item.targetAngle,
      Math.max(item.radiusLow, minOutsideRadius),
      Math.max(item.radiusHigh, resolvedRadius),
      occupiedRects,
      resolvedRadius,
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
  const radius = getMapBoundaryCircleRadius();
  const perimeter = Math.PI * 2 * radius;
  if (layer.length <= 2) {
    return layer.map((point) => circlePerimeterPosition(projectPointToCircle(point, radius), radius));
  }

  return unwrapPerimeterPositions(
    layer.map((point) => circlePerimeterPosition(projectPointToCircle(point, radius), radius)),
    perimeter,
  );
}

function buildGapLabels(placedGroups: MockGroup[]) {
  const labels: GapLabel[] = [];
  if (placedGroups.length <= 1) return labels;

  const radius = getMapBoundaryCircleRadius();
  const perimeter = Math.PI * 2 * radius;
  const anchors = buildOrderedBoundaryAnchors(
    placedGroups.map((group) => ({
      point: group.point,
      centerX: group.centerX,
      centerY: group.centerY,
    })),
    radius,
  );

  for (let index = 0; index < anchors.length; index++) {
    const current = anchors[index];
    const next = index === anchors.length - 1
      ? { ...anchors[0], position: anchors[0].position + perimeter }
      : anchors[index + 1];
    const gap = next.position - current.position;
    const midpoint = current.position + gap / 2;
    const anchor = circlePositionToPoint(midpoint, radius);
    const fromGroup = placedGroups[current.index];
    const toGroup = placedGroups[next.index % placedGroups.length];

    labels.push({
      key: `gap-global-${fromGroup.point.id}-${toGroup.point.id}`,
      x: anchor.x,
      y: anchor.y,
      value: gap,
      layerIndex: -1,
    });
  }

  return labels;
}

function buildGapReports(placedGroups: MockGroup[]) {
  if (placedGroups.length <= 1) return [] as GapReport[];

  const radius = getMapBoundaryCircleRadius();
  const perimeter = Math.PI * 2 * radius;
  const anchors = buildOrderedBoundaryAnchors(
    placedGroups.map((group) => ({
      point: group.point,
      centerX: group.centerX,
      centerY: group.centerY,
    })),
    radius,
  );
  const entries: GapEntry[] = [];

  for (let index = 0; index < anchors.length; index++) {
    const current = anchors[index];
    const next = index === anchors.length - 1
      ? { ...anchors[0], position: anchors[0].position + perimeter }
      : anchors[index + 1];
    const fromGroup = placedGroups[current.index];
    const toGroup = placedGroups[next.index % placedGroups.length];
    entries.push({
      key: `gap-report-global-${fromGroup.point.id}-${toGroup.point.id}`,
      fromId: fromGroup.point.id,
      toId: toGroup.point.id,
      value: next.position - current.position,
    });
  }

  const values = entries.map((entry) => entry.value);
  return [{
    label: '全局',
    entries,
    min: Math.min(...values),
    max: Math.max(...values),
    mean: computeGapMean(values),
  }];
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
      const boundaryRadius = getMapBoundaryCircleRadius();
      const radiusRange = getIndependentLayerRadiusRange(layer[0]?.layerIndex ?? 0);
      const layerOccupiedRects = [...occupiedRects];
      const provisionalGroups = layer.map((point, index) => {
        const { photos, photoRect } = buildMockPhotos(point);
        const geometry = buildGroupGeometryFromPhotoRect(photoRect, `图片组 ${point.order}`);
        const boundaryTarget = circlePositionToPoint(balancedBoundaryPositions[index], boundaryRadius);
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

    return avoidGlobalLinkCrossings(rebalanceGlobalBoundaryGaps(avoidGlobalLinkCrossings(placed)));
  }, [layeredPoints]);
  const gapLabels = useMemo(() => buildGapLabels(placedGroups), [placedGroups]);
  const gapReports = useMemo(() => buildGapReports(placedGroups), [placedGroups]);
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

        <div className={styles.gapPanel}>
          {gapReports.map((report) => (
            <section key={`gap-panel-${report.label}`} className={styles.gapSection}>
              <div className={styles.gapSectionHead}>
                <strong>{report.label}</strong>
                <span>
                  min {Math.round(report.min)} / max {Math.round(report.max)} / avg {Math.round(report.mean)}
                </span>
              </div>
              <div className={styles.gapList}>
                {report.entries.map((entry) => (
                  <div key={entry.key} className={styles.gapRow}>
                    <span>
                      {entry.fromId} → {entry.toId}
                    </span>
                    <strong>{Math.round(entry.value)}</strong>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </aside>
    </main>
  );
}
