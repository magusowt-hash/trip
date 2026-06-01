import type { GroupGeometry } from './localMapGroupGeometry';
import type { LogicalRect } from './footprintLayoutTypes';
import { rectDistance, rectDistanceToMap } from './footprintLayoutConstraints';

export function computeGroupPressureScore(
  candidate: GroupGeometry,
  occupiedGeometries: GroupGeometry[],
  safeGap: number,
) {
  let score = 0;
  const pressureGap = safeGap * 2.5;
  for (const occupied of occupiedGeometries) {
    const groupDistance = rectDistance(candidate.groupRect, occupied.groupRect);
    if (groupDistance < pressureGap) {
      score += (pressureGap - groupDistance) ** 2;
    }
  }
  return score;
}

export function computeLabelClearanceScore(
  candidate: GroupGeometry,
  occupiedGeometries: GroupGeometry[],
  mapRect: LogicalRect,
  safeGap: number,
) {
  let score = 0;
  const preferredGap = safeGap * 3;
  for (const occupied of occupiedGeometries) {
    const photoDistance = rectDistance(candidate.labelRect, occupied.photoRect);
    const labelDistance = rectDistance(candidate.labelRect, occupied.labelRect);
    if (photoDistance < preferredGap) score += (preferredGap - photoDistance) ** 2;
    if (labelDistance < preferredGap) score += (preferredGap - labelDistance) ** 2;
  }
  const mapDistance = rectDistanceToMap(candidate.labelRect, mapRect);
  if (mapDistance < preferredGap) score += (preferredGap - mapDistance) ** 2;
  return score;
}

export function computeSectorCrowdingScore(
  placeKey: string,
  centerX: number,
  centerY: number,
  placementById: Map<string, { centerX: number; centerY: number }>,
  angleDelta: (left: number, right: number) => number,
) {
  const candidateAngle = Math.atan2(centerY, centerX);
  const candidateRadius = Math.hypot(centerX, centerY);
  let score = 0;

  placementById.forEach((placement, key) => {
    if (key === placeKey) return;
    const angle = Math.atan2(placement.centerY, placement.centerX);
    const radius = Math.hypot(placement.centerX, placement.centerY);
    const deltaAngleAbs = Math.abs(angleDelta(candidateAngle, angle));
    const deltaRadius = Math.abs(candidateRadius - radius);
    if (deltaAngleAbs < Math.PI / 10) {
      score += (Math.PI / 10 - deltaAngleAbs) * 180;
      if (deltaRadius < 420) score += (420 - deltaRadius) * 0.4;
    }
  });

  return score;
}
