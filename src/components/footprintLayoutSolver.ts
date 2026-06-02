import { buildRadialLayout } from './localMapLayoutEngine';
import type { FootprintPlacement, LogicalRect, PendingPlaceGroup } from './footprintLayoutTypes';

const MAX_REFINED_PENDING_GROUPS = 10;
const PARTIAL_REFINED_PENDING_GROUPS = 12;

function computeGroupRefinePriority(
  group: PendingPlaceGroup,
  placement: FootprintPlacement,
) {
  const radius = Math.hypot(placement.centerX, placement.centerY);
  const area =
    Math.max(1, group.collisionRect.right - group.collisionRect.left) *
    Math.max(1, group.collisionRect.bottom - group.collisionRect.top);
  const photoCount = group.placePhotos.length;
  return radius * 1.25 + Math.sqrt(area) * 1.1 + photoCount * 120;
}

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
  const placementById = new Map(placements.map((placement) => [placement.id, placement]));

  if (groups.length > PARTIAL_REFINED_PENDING_GROUPS) {
    const priorityGroups = groups
      .map((group) => ({
        group,
        placement: placementById.get(group.placeKey),
      }))
      .filter((entry): entry is { group: PendingPlaceGroup; placement: FootprintPlacement } => entry.placement != null)
      .sort((left, right) => (
        computeGroupRefinePriority(right.group, right.placement) -
        computeGroupRefinePriority(left.group, left.placement)
      ))
      .slice(0, MAX_REFINED_PENDING_GROUPS)
      .map((entry) => entry.group);

    const refinedSubset = refinePlacements(
      priorityGroups,
      placementById,
      mapRect,
      safeGap,
      labelGapBoost,
    );

    return new Map(placements.map((placement) => [
      placement.id,
      refinedSubset.get(placement.id) ?? placement,
    ]));
  }

  return refinePlacements(
    groups,
    placementById,
    mapRect,
    safeGap,
    labelGapBoost,
  );
}
