import type { GroupGeometry } from './localMapGroupGeometry';
import type { LogicalRect } from './footprintLayoutTypes';
import { rectDistance, rectDistanceToMap } from './footprintLayoutConstraints';

export function computeGroupPressureScore(
  candidate: GroupGeometry,
  occupiedGeometries: GroupGeometry[],
  safeGap: number,
) {
  let score = 0;
  const photoPressureGap = safeGap * 2.5;
  const labelPressureGap = safeGap * 3;
  for (const occupied of occupiedGeometries) {
    const photoDistance = rectDistance(candidate.photoRect, occupied.photoRect);
    const labelPhotoDistance = rectDistance(candidate.labelRect, occupied.photoRect);
    const photoLabelDistance = rectDistance(candidate.photoRect, occupied.labelRect);
    const labelDistance = rectDistance(candidate.labelRect, occupied.labelRect);
    if (photoDistance < photoPressureGap) score += (photoPressureGap - photoDistance) ** 2 * 1.1;
    if (labelPhotoDistance < labelPressureGap) score += (labelPressureGap - labelPhotoDistance) ** 2 * 1.25;
    if (photoLabelDistance < labelPressureGap) score += (labelPressureGap - photoLabelDistance) ** 2 * 1.25;
    if (labelDistance < labelPressureGap) score += (labelPressureGap - labelDistance) ** 2;
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
    const reversePhotoDistance = rectDistance(candidate.photoRect, occupied.labelRect);
    const labelDistance = rectDistance(candidate.labelRect, occupied.labelRect);
    if (photoDistance < preferredGap) score += (preferredGap - photoDistance) ** 2;
    if (reversePhotoDistance < preferredGap) score += (preferredGap - reversePhotoDistance) ** 2;
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
