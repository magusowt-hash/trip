import type { GroupGeometry } from './localMapGroupGeometry.ts';
import { rectsOverlap } from './localMapGroupGeometry.ts';
import type { LogicalRect } from './footprintLayoutTypes.ts';

export function fitsPhotoRectAroundMap(rect: LogicalRect, mapRect: LogicalRect, gap: number) {
  const photoGap = gap + 12;
  return (
    rect.right <= mapRect.left - photoGap ||
    rect.left >= mapRect.right + photoGap ||
    rect.bottom <= mapRect.top - photoGap ||
    rect.top >= mapRect.bottom + photoGap
  );
}

export function fitsLabelRectAroundMap(rect: LogicalRect, mapRect: LogicalRect, gap: number) {
  return (
    rect.right <= mapRect.left - gap ||
    rect.left >= mapRect.right + gap ||
    rect.bottom <= mapRect.top - gap ||
    rect.top >= mapRect.bottom + gap
  );
}

export function fitsGroupRectAroundMap(rect: LogicalRect, mapRect: LogicalRect, gap: number) {
  return (
    rect.right <= mapRect.left - gap ||
    rect.left >= mapRect.right + gap ||
    rect.bottom <= mapRect.top - gap ||
    rect.top >= mapRect.bottom + gap
  );
}

export function rectOverlapsOccupiedPhotos(
  rect: LogicalRect,
  occupiedGeometries: GroupGeometry[],
  safeGap: number,
) {
  return occupiedGeometries.some((occupied) => rectsOverlap(rect, occupied.photoRect, safeGap));
}

export function rectOverlapsOccupiedLabels(
  rect: LogicalRect,
  occupiedGeometries: GroupGeometry[],
  safeGap: number,
) {
  return occupiedGeometries.some((occupied) => rectsOverlap(rect, occupied.labelRect, safeGap));
}

export function hasLabelCollisions(
  candidate: GroupGeometry,
  occupiedGeometries: GroupGeometry[],
  safeGap: number,
) {
  const labelSafeGap = safeGap + 16;
  return (
    rectOverlapsOccupiedPhotos(candidate.labelRect, occupiedGeometries, labelSafeGap) ||
    rectOverlapsOccupiedLabels(candidate.labelRect, occupiedGeometries, labelSafeGap)
  );
}

export function hasPhotoAgainstLabelCollisions(
  candidate: GroupGeometry,
  occupiedGeometries: GroupGeometry[],
  safeGap: number,
) {
  return rectOverlapsOccupiedLabels(candidate.photoRect, occupiedGeometries, safeGap + 16);
}

export function computeLateralOffsetFromRay(baseAngle: number, centerX: number, centerY: number) {
  const tangentX = -Math.sin(baseAngle);
  const tangentY = Math.cos(baseAngle);
  return centerX * tangentX + centerY * tangentY;
}

export function rectDistance(left: LogicalRect, right: LogicalRect) {
  const dx = Math.max(0, left.left - right.right, right.left - left.right);
  const dy = Math.max(0, left.top - right.bottom, right.top - left.bottom);
  return Math.hypot(dx, dy);
}

export function rectDistanceToMap(rect: LogicalRect, mapRect: LogicalRect) {
  if (
    rect.right <= mapRect.left ||
    rect.left >= mapRect.right ||
    rect.bottom <= mapRect.top ||
    rect.top >= mapRect.bottom
  ) {
    return rectDistance(rect, mapRect);
  }
  return 0;
}

export function hasGeometryPressureBetweenGroups(
  left: GroupGeometry,
  right: GroupGeometry,
  safeGap: number,
) {
  return (
    rectsOverlap(left.groupRect, right.groupRect, safeGap)
  );
}
