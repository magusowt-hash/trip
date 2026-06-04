import type { PhotoItem } from './OuterFrameCanvas.tsx';
import type { GroupGeometry, GroupLayoutSnapshot } from './localMapGroupGeometry.ts';
import { buildGroupGeometryFromLayout } from './localMapGroupGeometry.ts';
import type { LockedPlaceGroup } from './footprintLayoutTypes.ts';
import {
  hasLabelCollisions,
  hasPhotoAgainstLabelCollisions,
  rectOverlapsOccupiedPhotos,
} from './footprintLayoutConstraints.ts';

type LogicalPoint = { x: number; y: number };
type GetPhotoLogicalSize = (photo: Pick<PhotoItem, 'pixelWidth' | 'pixelHeight'>) => { width: number; height: number };

export function geometryConflictsWithLockedGroups(
  geometry: GroupGeometry,
  lockedGroups: LockedPlaceGroup[],
  safeGap: number,
) {
  const occupied = lockedGroups.map((group) => group.geometry);
  return (
    rectOverlapsOccupiedPhotos(geometry.photoRect, occupied, safeGap) ||
    hasLabelCollisions(geometry, occupied, safeGap) ||
    hasPhotoAgainstLabelCollisions(geometry, occupied, safeGap)
  );
}

export function collectConflictingSavedPlaceKeys(
  groups: Map<string, PhotoItem[]>,
  scale: number,
  layouts: GroupLayoutSnapshot[],
  getPhotoLogicalSize: GetPhotoLogicalSize,
  logicalPointByPlaceKey?: Map<string, LogicalPoint>,
  safeGap = 80,
) {
  const lockedGroups: LockedPlaceGroup[] = [];
  const conflictingPlaceKeys = new Set<string>();
  const sortedGroups = Array.from(groups.entries()).sort(([leftKey], [rightKey]) => (
    leftKey.localeCompare(rightKey, 'zh-CN')
  ));

  for (const [placeKey, placePhotos] of sortedGroups) {
    if (!placePhotos.every((photo) => photo.frameX != null && photo.frameY != null)) continue;
    const geometry = buildGroupGeometryFromLayout(
      placeKey,
      placePhotos,
      getPhotoLogicalSize,
      scale,
      layouts,
    );
    if (!geometry) continue;

    const conflictIndex = lockedGroups.findIndex((locked) => (
      geometryConflictsWithLockedGroups(geometry, [locked], safeGap)
    ));
    if (conflictIndex >= 0) {
      conflictingPlaceKeys.add(placeKey);
      conflictingPlaceKeys.add(lockedGroups[conflictIndex]!.placeKey);
      continue;
    }

    const logicalPoint = logicalPointByPlaceKey?.get(placeKey) ?? { x: 0, y: 0 };
    lockedGroups.push({
      placeKey,
      logicalX: logicalPoint.x,
      logicalY: logicalPoint.y,
      geometry,
    });
  }

  return conflictingPlaceKeys;
}
