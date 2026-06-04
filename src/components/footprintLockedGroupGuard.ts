import type { GroupGeometry } from './localMapGroupGeometry.ts';
import type { LockedPlaceGroup } from './footprintLayoutTypes.ts';
import {
  hasLabelCollisions,
  hasPhotoAgainstLabelCollisions,
  rectOverlapsOccupiedPhotos,
} from './footprintLayoutConstraints.ts';

export function lockedGroupHasConflicts(
  candidate: GroupGeometry,
  occupied: LockedPlaceGroup[],
  safeGap: number,
) {
  return (
    rectOverlapsOccupiedPhotos(candidate.photoRect, occupied.map((group) => group.geometry), safeGap) ||
    hasLabelCollisions(candidate, occupied.map((group) => group.geometry), safeGap) ||
    hasPhotoAgainstLabelCollisions(candidate, occupied.map((group) => group.geometry), safeGap)
  );
}
