import type { PendingPlaceGroup, FootprintPlacement, LogicalRect } from './footprintLayoutTypes';

type GroupGeometryLike = unknown;

type BuildRadialRefineOrder = (groups: PendingPlaceGroup[]) => PendingPlaceGroup[];
type BuildGeometry = (
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  excludePlaceKey: string,
) => GroupGeometryLike[];
type FindMinimalFeasibleRadius = (
  group: PendingPlaceGroup,
  currentPlacement: FootprintPlacement,
  basePlacement: FootprintPlacement,
  occupiedGeometries: GroupGeometryLike[],
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
  placementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
) => {
  centerX: number;
  centerY: number;
  score: number;
};
type RefineGroupCenterFromCurrentPlacement = (
  placeKey: string,
  baseGeometry: unknown,
  currentPlacement: FootprintPlacement,
  basePlacement: FootprintPlacement,
  logicalX: number,
  logicalY: number,
  occupiedGeometries: GroupGeometryLike[],
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
  placementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
) => {
  centerX: number;
  centerY: number;
  score: number;
};
type FindClosestNeighborForGroup = (
  targetKey: string,
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
) => PendingPlaceGroup | null;
type TryNeighborNudge = (
  group: PendingPlaceGroup,
  neighbor: PendingPlaceGroup,
  placementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
) => {
  groupPlacement: FootprintPlacement;
  neighborPlacement: FootprintPlacement;
  score: number;
} | null;
type RefineSectorClusters = (
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  basePlacementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
) => Map<string, FootprintPlacement>;

type RefinerDeps = {
  buildRadialRefineOrder: BuildRadialRefineOrder;
  buildOccupiedGeometries: BuildGeometry;
  findMinimalFeasibleRadius: FindMinimalFeasibleRadius;
  refineGroupCenterFromCurrentPlacement: RefineGroupCenterFromCurrentPlacement;
  findClosestNeighborForGroup: FindClosestNeighborForGroup;
  tryNeighborNudge: TryNeighborNudge;
  refineSectorClusters: RefineSectorClusters;
  refinePasses: number;
};

export function refineRadialPlacementsWithDeps(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
  deps: RefinerDeps,
) {
  if (groups.length === 0) return placementById;

  const basePlacementById = new Map(placementById);
  const nextPlacementById = new Map(placementById);
  const orderedGroups = deps.buildRadialRefineOrder(groups);

  for (const group of orderedGroups) {
    const currentPlacement = nextPlacementById.get(group.placeKey);
    if (!currentPlacement) continue;
    const occupiedGeometries = deps.buildOccupiedGeometries(groups, nextPlacementById, group.placeKey);
    const shrunk = deps.findMinimalFeasibleRadius(
      group,
      currentPlacement,
      basePlacementById.get(group.placeKey) ?? currentPlacement,
      occupiedGeometries,
      mapRect,
      safeGap,
      labelGapBoost,
      nextPlacementById,
      groups,
    );
    if (
      Number.isFinite(shrunk.score) &&
      (Math.abs(shrunk.centerX - currentPlacement.centerX) > 1 ||
        Math.abs(shrunk.centerY - currentPlacement.centerY) > 1)
    ) {
      nextPlacementById.set(group.placeKey, { centerX: shrunk.centerX, centerY: shrunk.centerY });
    }
  }

  for (let pass = 0; pass < deps.refinePasses; pass++) {
    let changed = false;

    for (const group of orderedGroups) {
      const currentPlacement = nextPlacementById.get(group.placeKey);
      if (!currentPlacement) continue;

      const occupiedGeometries = deps.buildOccupiedGeometries(groups, nextPlacementById, group.placeKey);
      const refined = deps.refineGroupCenterFromCurrentPlacement(
        group.placeKey,
        group.collisionGeometry,
        currentPlacement,
        basePlacementById.get(group.placeKey) ?? currentPlacement,
        group.logicalX,
        group.logicalY,
        occupiedGeometries,
        mapRect,
        safeGap,
        labelGapBoost,
        nextPlacementById,
        groups,
      );

      if (
        Math.abs(refined.centerX - currentPlacement.centerX) > 1 ||
        Math.abs(refined.centerY - currentPlacement.centerY) > 1
      ) {
        nextPlacementById.set(group.placeKey, { centerX: refined.centerX, centerY: refined.centerY });
        changed = true;
        continue;
      }

      const neighbor = deps.findClosestNeighborForGroup(group.placeKey, groups, nextPlacementById);
      if (!neighbor) continue;
      const nudged = deps.tryNeighborNudge(group, neighbor, nextPlacementById, groups, mapRect, safeGap, labelGapBoost);
      if (!nudged) continue;
      nextPlacementById.set(group.placeKey, nudged.groupPlacement);
      nextPlacementById.set(neighbor.placeKey, nudged.neighborPlacement);
      changed = true;
    }

    if (!changed) break;
  }

  return deps.refineSectorClusters(groups, nextPlacementById, basePlacementById, mapRect, safeGap, labelGapBoost);
}
