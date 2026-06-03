import { rectsOverlap } from './localMapGroupGeometry.ts';

type LogicalRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type GeometryRects = {
  photoRect: LogicalRect;
  labelRect: LogicalRect;
};

export type OccupiedGeometryGapPolicy = {
  photoGap: number;
  labelPhotoGap: number;
  labelGap: number;
};

export function buildOccupiedGeometryGapPolicy(safeGap: number): OccupiedGeometryGapPolicy {
  return {
    photoGap: Math.max(10, safeGap),
    labelPhotoGap: Math.max(14, safeGap + 4),
    labelGap: Math.max(12, safeGap + 2),
  };
}

export function geometryOverlapsOccupiedWithGapPolicy(
  candidate: GeometryRects,
  occupiedGeometries: GeometryRects[],
  policy: OccupiedGeometryGapPolicy,
) {
  return occupiedGeometries.some((occupied) => (
    rectsOverlap(candidate.photoRect, occupied.photoRect, policy.photoGap) ||
    rectsOverlap(candidate.labelRect, occupied.photoRect, policy.labelPhotoGap) ||
    rectsOverlap(candidate.photoRect, occupied.labelRect, policy.labelPhotoGap) ||
    rectsOverlap(candidate.labelRect, occupied.labelRect, policy.labelGap)
  ));
}
