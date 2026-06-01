import { buildRadialLayout } from './localMapLayoutEngine';
import type { FootprintPlacement, LogicalRect, PendingPlaceGroup } from './footprintLayoutTypes';

export function solvePendingGroupPlacements(
  groups: PendingPlaceGroup[],
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
  refinePlacements: (
    groups: PendingPlaceGroup[],
    placementById: Map<string, FootprintPlacement>,
    mapRect: LogicalRect,
    safeGap: number,
    labelGapBoost: number,
  ) => Map<string, FootprintPlacement>,
) {
  const placements = buildRadialLayout(
    groups.map((group) => ({
      id: group.placeKey,
      x: group.logicalX,
      y: group.logicalY,
      rect: group.collisionRect,
    })),
    mapRect,
  );

  return refinePlacements(
    groups,
    new Map(placements.map((placement) => [placement.id, placement])),
    mapRect,
    safeGap,
    labelGapBoost,
  );
}
