import {
  buildGroupGeometryFromPhotoRect,
  rectsOverlap,
  resolveGroupGeometryAsWhole,
  resolvePreferredLabelSideForMap,
  type GroupGeometry,
} from './localMapGroupGeometry';
import { buildRadialLayout } from './localMapLayoutEngine';
import type { FootprintPlacement, LockedPlaceGroup, LogicalRect, PendingPlaceGroup } from './footprintLayoutTypes';
import {
  fitsLabelRectAroundMap,
  fitsGroupRectAroundMap,
  fitsPhotoRectAroundMap,
  hasLabelCollisions,
  hasPhotoAgainstLabelCollisions,
  rectDistanceToMap,
  rectOverlapsOccupiedPhotos,
} from './footprintLayoutConstraints';
import { refineRadialPlacements } from './footprintSectorLayoutEngine';
import { chooseFinalPlacementVariant } from './footprintLayoutSelection';
import {
  buildPlacementLayers,
  placeGroupsLayerByLayer,
  refineAnglesAndRadii,
  type PlacementState,
} from './footprintLayoutLayeredPlacement';
import {
  assignInitialPlacements,
  buildLegacyFallbackState,
  buildLegacySolverInputs,
  optimizeAssignments,
} from './footprintLayoutLegacyFallback';
import {
  analyzePlacementState,
  buildGeometryMapForPlacements,
  countCorridorRiskConflicts,
  hasHardConflicts,
  buildCorridorRepairCandidateSubset,
  improveCorridorRisk,
  improveGroupRectOnlyPairs,
  improvePairCorridorRisk,
  relaxRadialSpacing,
  repairPlacementIfNeeded,
  selectCorridorRepairTargets,
} from './footprintLayoutRepairStages';

const GROUP_GAP = 14;
const LABEL_GAP = 22;
const MAP_GAP = 128;
const LINE_BUNDLE_DISTANCE = 34;
const LOCAL_DENSITY_DISTANCE = 420;
const GLOBAL_SECTOR_COUNT = 16;
const REBALANCE_ITERATION_COUNT = 8;
const RADIAL_RELAX_PASS_LIMIT = 6;
const MAX_CANDIDATES_PER_GROUP = 48;
const CORRIDOR_REPAIR_GROUP_LIMIT = 4;
const CORRIDOR_REPAIR_CANDIDATE_LIMIT = 8;
const CORRIDOR_REPAIR_NEAR_TAIL_LIMIT = 8;
const CORRIDOR_REPAIR_SPREAD_SAMPLE_COUNT = 6;
const PAIR_REPAIR_GROUP_LIMIT = 6;
const PAIR_REPAIR_PASS_LIMIT = 2;
const PAIR_REPAIR_DEEP_SEARCH_LIMIT = 16;
const GROUP_RECT_ONLY_PAIR_LIMIT = 4;
const GROUP_RECT_ONLY_CANDIDATE_LIMIT = 4;
const ANGLE_OFFSETS_DEGREES = [-24, -16, -10, -6, 0, 6, 10, 16, 24];
const RADIUS_FACTORS = [0.78, 0.86, 0.94, 1, 1.08, 1.18];
const OUTER_RING_RADIUS_FACTORS = [1.24, 1.36];
const DENSE_SECTOR_ANGLE_OFFSETS_DEGREES = [-32, -24, 24, 32];
const DENSE_SECTOR_RADIUS_FACTORS = [1.08, 1.18, 1.28];
const DENSE_MAP_ADJACENT_ESCAPE_ANGLE_OFFSETS_DEGREES = [-72, -56, 56, 72];
const DENSE_MAP_ADJACENT_ESCAPE_RADIUS_FACTORS = [1.18, 1.32, 1.46];
const FINAL_VARIANT_REFINEMENT_GROUP_LIMIT = 20;

type MaxViewBounds = {
  width: number;
  height: number;
  area: number;
  radius: number;
};

type PlacementCandidate = {
  placement: FootprintPlacement;
  geometry: GroupGeometry;
  basePenalty: number;
};

type CandidateEvaluation = {
  valid: boolean;
  score: number;
};

export type SolverStageReporter = (stage: string) => void;
export type SolverMetricReporter = (name: string, elapsedMs: number) => void;

let activeMaxViewBounds: MaxViewBounds | null = null;

const layeredDeps = {
  angleDelta,
  buildLine,
  chooseBestGeometryForPlacement,
  countPlacementLineCrossings,
  geometryFitsMap,
  getLabelGap,
  getPhotoGap,
  hasLabelCollisions,
  hasPhotoAgainstLabelCollisions,
  rectOverlapsOccupiedPhotos,
  segmentDistance,
  segmentsIntersect,
};

const legacyDeps = {
  buildCandidatePool,
  compareLegacyGroupOrder,
  computeSectorIndex,
  countPlacementLineCrossings,
  evaluateCandidate,
};

const repairDeps = {
  config: {
    rebalanceIterationCount: REBALANCE_ITERATION_COUNT,
    radialRelaxPassLimit: RADIAL_RELAX_PASS_LIMIT,
    corridorRepairGroupLimit: CORRIDOR_REPAIR_GROUP_LIMIT,
    corridorRepairCandidateLimit: CORRIDOR_REPAIR_CANDIDATE_LIMIT,
    corridorRepairNearTailLimit: CORRIDOR_REPAIR_NEAR_TAIL_LIMIT,
    corridorRepairSpreadSampleCount: CORRIDOR_REPAIR_SPREAD_SAMPLE_COUNT,
    pairRepairGroupLimit: PAIR_REPAIR_GROUP_LIMIT,
    pairRepairPassLimit: PAIR_REPAIR_PASS_LIMIT,
    pairRepairDeepSearchLimit: PAIR_REPAIR_DEEP_SEARCH_LIMIT,
    groupRectOnlyPairLimit: GROUP_RECT_ONLY_PAIR_LIMIT,
    groupRectOnlyCandidateLimit: GROUP_RECT_ONLY_CANDIDATE_LIMIT,
  },
  buildLine,
  chooseBestGeometryForPlacement,
  countPlacementLineCrossings,
  geometryFitsMap,
  getGroupGap: (gap: number) => Math.max(GROUP_GAP, gap),
  getLabelGap,
  hasLabelCollisions,
  hasPhotoAgainstLabelCollisions,
  rectOverlapsOccupiedPhotos,
  rectsOverlap,
  resolveGroupGeometryAsWhole,
  scoreFinalLayoutEnvelope,
  segmentsIntersect,
  analyzePlacementState: (
    groups: PendingPlaceGroup[],
    placementById: Map<string, FootprintPlacement>,
    mapRect: LogicalRect,
    safeGap: number,
    labelGapBoost: number,
    lockedGroups: LockedPlaceGroup[],
    options?: {
      includeCorridorRisk?: boolean;
      includeLineCrossings?: boolean;
    },
  ) => analyzePlacementState(
    {
      buildLine,
      chooseBestGeometryForPlacement,
      countPlacementLineCrossings,
      geometryFitsMap,
      getGroupGap: (gap: number) => Math.max(GROUP_GAP, gap),
      getLabelGap,
      hasLabelCollisions,
      hasPhotoAgainstLabelCollisions,
      rectOverlapsOccupiedPhotos,
      rectsOverlap,
      scoreFinalLayoutEnvelope,
      resolveGroupGeometryAsWhole,
      segmentsIntersect,
    },
    groups,
    placementById,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
    options,
  ),
  improveCorridorRisk: (
    orderedGroups: PendingPlaceGroup[],
    candidatePoolById: Map<string, PlacementCandidate[]>,
    state: PlacementState,
    mapRect: LogicalRect,
    safeGap: number,
    labelGapBoost: number,
    lockedGroups: LockedPlaceGroup[],
  ) => improveCorridorRisk(
    repairDeps,
    orderedGroups,
    candidatePoolById,
    state,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  ),
  relaxRadialSpacing: (
    orderedGroups: PendingPlaceGroup[],
    state: PlacementState,
    mapRect: LogicalRect,
    safeGap: number,
    labelGapBoost: number,
    lockedGroups: LockedPlaceGroup[],
  ) => relaxRadialSpacing(
    repairDeps,
    orderedGroups,
    state,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  ),
  improveGroupRectOnlyPairs: (
    orderedGroups: PendingPlaceGroup[],
    candidatePoolById: Map<string, PlacementCandidate[]>,
    state: PlacementState,
    mapRect: LogicalRect,
    safeGap: number,
    labelGapBoost: number,
    lockedGroups: LockedPlaceGroup[],
  ) => improveGroupRectOnlyPairs(
    repairDeps,
    orderedGroups,
    candidatePoolById,
    state,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  ),
  improvePairCorridorRisk: (
    orderedGroups: PendingPlaceGroup[],
    candidatePoolById: Map<string, PlacementCandidate[]>,
    state: PlacementState,
    mapRect: LogicalRect,
    safeGap: number,
    labelGapBoost: number,
    lockedGroups: LockedPlaceGroup[],
  ) => improvePairCorridorRisk(
    repairDeps,
    orderedGroups,
    candidatePoolById,
    state,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  ),
};

function getPhotoGap(safeGap: number) {
  return Math.max(GROUP_GAP, safeGap);
}

function getLabelGap(safeGap: number) {
  return Math.max(LABEL_GAP, safeGap + 16);
}

function getLabelPressurePenalty(
  candidate: GroupGeometry,
  neighbor: GroupGeometry,
  safeGap: number,
) {
  const targetGap = getLabelGap(safeGap);
  const photoLabelDistance = rectDistanceToMap(candidate.labelRect, neighbor.photoRect);
  const reversePhotoLabelDistance = rectDistanceToMap(candidate.photoRect, neighbor.labelRect);
  const labelDistance = rectDistanceToMap(candidate.labelRect, neighbor.labelRect);

  let penalty = 0;
  if (photoLabelDistance < targetGap) {
    penalty += (targetGap - photoLabelDistance) * (targetGap - photoLabelDistance) * 1.8;
  }
  if (reversePhotoLabelDistance < targetGap) {
    penalty += (targetGap - reversePhotoLabelDistance) * (targetGap - reversePhotoLabelDistance) * 1.8;
  }
  if (labelDistance < targetGap) {
    penalty += (targetGap - labelDistance) * (targetGap - labelDistance) * 1.5;
  }
  return penalty;
}

function normalizeAngle(angle: number) {
  const fullTurn = Math.PI * 2;
  const normalized = angle % fullTurn;
  return normalized >= 0 ? normalized : normalized + fullTurn;
}

function angleDelta(left: number, right: number) {
  const fullTurn = Math.PI * 2;
  let delta = normalizeAngle(left) - normalizeAngle(right);
  if (delta > Math.PI) delta -= fullTurn;
  if (delta < -Math.PI) delta += fullTurn;
  return delta;
}

function cross(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
) {
  const ab1 = cross(a1, a2, b1);
  const ab2 = cross(a1, a2, b2);
  const ba1 = cross(b1, b2, a1);
  const ba2 = cross(b1, b2, a2);
  return ab1 * ab2 < -1e-6 && ba1 * ba2 < -1e-6;
}

function pointToSegmentDistance(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-6) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq));
  const projX = start.x + t * dx;
  const projY = start.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

function segmentDistance(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
) {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointToSegmentDistance(a1, b1, b2),
    pointToSegmentDistance(a2, b1, b2),
    pointToSegmentDistance(b1, a1, a2),
    pointToSegmentDistance(b2, a1, a2),
  );
}

function buildLine(group: PendingPlaceGroup, geometry: GroupGeometry) {
  return {
    start: { x: group.logicalX, y: group.logicalY },
    end: { x: geometry.lineAnchorX, y: geometry.lineAnchorY },
  };
}

function countPlacementLineCrossings(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
) {
  let crossingCount = 0;

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    const placement = placementById.get(group.placeKey);
    if (!placement) continue;

    for (let neighborIndex = index + 1; neighborIndex < groups.length; neighborIndex++) {
      const neighbor = groups[neighborIndex];
      const neighborPlacement = placementById.get(neighbor.placeKey);
      if (!neighborPlacement) continue;

      if (
        segmentsIntersect(
          { x: group.logicalX, y: group.logicalY },
          { x: placement.centerX, y: placement.centerY },
          { x: neighbor.logicalX, y: neighbor.logicalY },
          { x: neighborPlacement.centerX, y: neighborPlacement.centerY },
        )
      ) {
        crossingCount += 1;
      }
    }
  }

  return crossingCount;
}

function computeSectorIndex(angle: number) {
  const normalized = normalizeAngle(angle);
  return Math.min(
    GLOBAL_SECTOR_COUNT - 1,
    Math.floor((normalized / (Math.PI * 2)) * GLOBAL_SECTOR_COUNT),
  );
}

function buildGeometryForPlacement(
  group: PendingPlaceGroup,
  placement: FootprintPlacement,
) {
  const translatedPhotoRect = {
    left: group.collisionGeometry.photoRect.left + placement.centerX,
    right: group.collisionGeometry.photoRect.right + placement.centerX,
    top: group.collisionGeometry.photoRect.top + placement.centerY,
    bottom: group.collisionGeometry.photoRect.bottom + placement.centerY,
  };

  const labelPartitionRect = group.mapRect
    ? {
        left: group.mapRect.left - MAP_GAP,
        right: group.mapRect.right + MAP_GAP,
        top: group.mapRect.top - MAP_GAP,
        bottom: group.mapRect.bottom + MAP_GAP,
      }
    : undefined;

  return buildGroupGeometryFromPhotoRect(
    translatedPhotoRect,
    group.placePhotos[0]?.placeTitle || '',
    group.placePhotos.length,
    1,
    resolvePreferredLabelSideForMap(placement.centerX, placement.centerY, labelPartitionRect),
    group.reservedLabelOffset,
    labelPartitionRect,
  );
}

function geometryFitsMap(geometry: GroupGeometry, mapRect: LogicalRect) {
  return (
    fitsPhotoRectAroundMap(geometry.photoRect, mapRect, MAP_GAP) &&
    fitsLabelRectAroundMap(geometry.labelRect, mapRect, MAP_GAP) &&
    fitsGroupRectAroundMap(geometry.groupRect, mapRect, MAP_GAP)
  );
}

function chooseBestGeometryForPlacement(
  group: PendingPlaceGroup,
  placement: FootprintPlacement,
  mapRect: LogicalRect,
) {
  return buildGeometryForPlacement(group, placement);
}

function compareLegacyGroupOrder(
  left: PendingPlaceGroup,
  right: PendingPlaceGroup,
  basePlacementById: Map<string, FootprintPlacement>,
  sectorDensityById?: Map<string, number>,
  candidateCountById?: Map<string, number>,
) {
  const leftSectorDensity = sectorDensityById?.get(left.placeKey) ?? 0;
  const rightSectorDensity = sectorDensityById?.get(right.placeKey) ?? 0;
  if (leftSectorDensity !== rightSectorDensity) return rightSectorDensity - leftSectorDensity;

  const leftCandidateCount = candidateCountById?.get(left.placeKey) ?? Number.POSITIVE_INFINITY;
  const rightCandidateCount = candidateCountById?.get(right.placeKey) ?? Number.POSITIVE_INFINITY;
  if (leftCandidateCount !== rightCandidateCount) return leftCandidateCount - rightCandidateCount;

  const leftPlacement = basePlacementById.get(left.placeKey);
  const rightPlacement = basePlacementById.get(right.placeKey);
  const leftRadius = leftPlacement ? Math.hypot(leftPlacement.centerX, leftPlacement.centerY) : 0;
  const rightRadius = rightPlacement ? Math.hypot(rightPlacement.centerX, rightPlacement.centerY) : 0;
  if (Math.abs(rightRadius - leftRadius) > 1e-6) return rightRadius - leftRadius;

  const leftArea =
    Math.max(1, left.collisionRect.right - left.collisionRect.left) *
    Math.max(1, left.collisionRect.bottom - left.collisionRect.top);
  const rightArea =
    Math.max(1, right.collisionRect.right - right.collisionRect.left) *
    Math.max(1, right.collisionRect.bottom - right.collisionRect.top);
  if (Math.abs(rightArea - leftArea) > 1e-6) return rightArea - leftArea;

  return left.placeKey.localeCompare(right.placeKey, 'zh-CN');
}

function compareLayerPlacementOrder(
  left: PendingPlaceGroup,
  right: PendingPlaceGroup,
) {
  const leftAngle = Math.atan2(left.logicalY, left.logicalX);
  const rightAngle = Math.atan2(right.logicalY, right.logicalX);
  if (Math.abs(leftAngle - rightAngle) > 1e-6) return leftAngle - rightAngle;

  const leftRadius = Math.hypot(left.logicalX, left.logicalY);
  const rightRadius = Math.hypot(right.logicalX, right.logicalY);
  if (Math.abs(leftRadius - rightRadius) > 1e-6) return leftRadius - rightRadius;

  return left.placeKey.localeCompare(right.placeKey, 'zh-CN');
}


function scoreBaseCandidate(
  angle: number,
  radius: number,
  baseAngle: number,
  baseRadius: number,
  geometry: GroupGeometry,
  mapRect: LogicalRect,
  allowWideEscape = false,
) {
  const driftPenalty = Math.abs(angleDelta(angle, baseAngle)) * (allowWideEscape ? 28 : 46);
  const radiusPenalty = Math.abs(radius - baseRadius) * 0.85;
  const outwardPenalty = Math.max(0, radius - baseRadius) * (allowWideEscape ? 0.78 : 1.15);
  const mapDistance = rectDistanceToMap(geometry.groupRect, mapRect);
  const mapDistancePenalty = Math.max(0, mapDistance - 180) * 0.55;
  return driftPenalty + radiusPenalty + outwardPenalty + mapDistancePenalty;
}

function dedupeCandidates(candidates: PlacementCandidate[]) {
  const byKey = new Map<string, PlacementCandidate>();
  for (const candidate of candidates) {
    const key = `${Math.round(candidate.placement.centerX)}:${Math.round(candidate.placement.centerY)}:${candidate.geometry.labelSide}`;
    const existing = byKey.get(key);
    if (!existing || candidate.basePenalty < existing.basePenalty) {
      byKey.set(key, candidate);
    }
  }
  return Array.from(byKey.values())
    .sort((left, right) => left.basePenalty - right.basePenalty)
    .slice(0, MAX_CANDIDATES_PER_GROUP);
}

function buildCandidatePool(
  group: PendingPlaceGroup,
  basePlacement: FootprintPlacement,
  mapRect: LogicalRect,
  sectorDensity = 0,
) {
  const baseAngle = Math.atan2(basePlacement.centerY, basePlacement.centerX);
  const baseRadius = Math.hypot(basePlacement.centerX, basePlacement.centerY);
  const safeBaseRadius = Math.max(baseRadius, 180);
  const mapExpandedRect = {
    left: mapRect.left - MAP_GAP,
    right: mapRect.right + MAP_GAP,
    top: mapRect.top - MAP_GAP,
    bottom: mapRect.bottom + MAP_GAP,
  };
  const nearProtectedMapBand = rectDistanceToMap(group.collisionRect, mapExpandedRect) < 96;
  const allowWideEscape = sectorDensity >= 3 && nearProtectedMapBand;
  const seeds: PlacementCandidate[] = [];

  const addCandidate = (angle: number, radius: number, useWideEscapePenalty = false) => {
    const placement = {
      centerX: Math.cos(angle) * radius,
      centerY: Math.sin(angle) * radius,
    };
    const geometry = chooseBestGeometryForPlacement(group, placement, mapRect);
    if (!geometryFitsMap(geometry, mapRect)) return;
    seeds.push({
      placement,
      geometry,
      basePenalty: scoreBaseCandidate(
        normalizeAngle(angle),
        radius,
        baseAngle,
        safeBaseRadius,
        geometry,
        mapRect,
        useWideEscapePenalty,
      ),
    });
  };

  for (const radiusFactor of RADIUS_FACTORS) {
    const radius = safeBaseRadius * radiusFactor;
    for (const angleOffset of ANGLE_OFFSETS_DEGREES) {
      addCandidate(baseAngle + (angleOffset * Math.PI) / 180, radius);
    }
  }

  for (const radiusFactor of OUTER_RING_RADIUS_FACTORS) {
    const radius = safeBaseRadius * radiusFactor;
    for (const angleOffset of [-18, -10, 0, 10, 18]) {
      addCandidate(baseAngle + (angleOffset * Math.PI) / 180, radius);
    }
  }

  if (sectorDensity >= 3) {
    for (const radiusFactor of DENSE_SECTOR_RADIUS_FACTORS) {
      const radius = safeBaseRadius * radiusFactor;
      for (const angleOffset of DENSE_SECTOR_ANGLE_OFFSETS_DEGREES) {
        addCandidate(baseAngle + (angleOffset * Math.PI) / 180, radius);
      }
    }
  }

  if (allowWideEscape) {
    for (const radiusFactor of DENSE_MAP_ADJACENT_ESCAPE_RADIUS_FACTORS) {
      const radius = safeBaseRadius * radiusFactor;
      for (const angleOffset of DENSE_MAP_ADJACENT_ESCAPE_ANGLE_OFFSETS_DEGREES) {
        addCandidate(baseAngle + (angleOffset * Math.PI) / 180, radius, true);
      }
    }
  }

  addCandidate(baseAngle, safeBaseRadius);
  return dedupeCandidates(seeds);
}

function buildSectorCounts(
  groups: PendingPlaceGroup[],
  state: PlacementState,
  overrideKey?: string,
  overrideCandidate?: PlacementCandidate,
) {
  const counts = Array.from({ length: GLOBAL_SECTOR_COUNT }, () => 0);
  for (const group of groups) {
    const geometry =
      group.placeKey === overrideKey
        ? overrideCandidate?.geometry
        : state.geometryById.get(group.placeKey);
    if (!geometry) continue;
    const centerX = (geometry.groupRect.left + geometry.groupRect.right) / 2;
    const centerY = (geometry.groupRect.top + geometry.groupRect.bottom) / 2;
    counts[computeSectorIndex(Math.atan2(centerY, centerX))] += 1;
  }
  return counts;
}

function computeSectorPenalty(counts: number[], total: number) {
  const average = total / GLOBAL_SECTOR_COUNT;
  return counts.reduce((sum, count) => {
    const delta = count - average;
    return sum + delta * delta;
  }, 0);
}

function computeEnvelopePenalty(
  groups: PendingPlaceGroup[],
  state: PlacementState,
  overrideKey?: string,
  overrideCandidate?: PlacementCandidate,
) {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (const group of groups) {
    const geometry =
      group.placeKey === overrideKey
        ? overrideCandidate?.geometry
        : state.geometryById.get(group.placeKey);
    if (!geometry) continue;
    left = Math.min(left, geometry.groupRect.left);
    right = Math.max(right, geometry.groupRect.right);
    top = Math.min(top, geometry.groupRect.top);
    bottom = Math.max(bottom, geometry.groupRect.bottom);
  }

  if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
    return 0;
  }

  const width = right - left;
  const height = bottom - top;
  const area = width * height;
  const maxViewRadius = Math.max(
    Math.hypot(left, top),
    Math.hypot(left, bottom),
    Math.hypot(right, top),
    Math.hypot(right, bottom),
  );
  const targetBounds = activeMaxViewBounds;
  const widthOverflow = targetBounds ? Math.max(0, width - targetBounds.width) : 0;
  const heightOverflow = targetBounds ? Math.max(0, height - targetBounds.height) : 0;
  const areaOverflow = targetBounds ? Math.max(0, area - targetBounds.area) : 0;
  const radiusOverflow = targetBounds ? Math.max(0, maxViewRadius - targetBounds.radius) : 0;

  return (
    width * 0.18 +
    height * 0.16 +
    area * 0.00006 +
    maxViewRadius * 0.42 +
    widthOverflow * 0.9 +
    heightOverflow * 0.86 +
    areaOverflow * 0.0002 +
    radiusOverflow * 1.35
  );
}

function computeCorridorRiskPenalty(
  candidate: GroupGeometry,
  neighbor: GroupGeometry,
  safeGap: number,
) {
  const preferredGroupGap = Math.max(48, safeGap * 0.5);
  const preferredLabelGap = Math.max(LABEL_GAP, safeGap + 16);

  const horizontalGap = Math.max(
    0,
    Math.max(
      neighbor.groupRect.left - candidate.groupRect.right,
      candidate.groupRect.left - neighbor.groupRect.right,
    ),
  );
  const verticalGap = Math.max(
    0,
    Math.max(
      neighbor.groupRect.top - candidate.groupRect.bottom,
      candidate.groupRect.top - neighbor.groupRect.bottom,
    ),
  );

  let penalty = 0;
  if (horizontalGap < preferredGroupGap) {
    penalty += (preferredGroupGap - horizontalGap) * 1.8;
  }
  if (verticalGap < preferredGroupGap) {
    penalty += (preferredGroupGap - verticalGap) * 1.8;
  }
  if (rectDistanceToMap(candidate.groupRect, neighbor.groupRect) < preferredGroupGap) {
    penalty += (preferredGroupGap - rectDistanceToMap(candidate.groupRect, neighbor.groupRect)) * 4.2;
  }
  if (rectDistanceToMap(candidate.labelRect, neighbor.photoRect) < preferredLabelGap) {
    penalty += (preferredLabelGap - rectDistanceToMap(candidate.labelRect, neighbor.photoRect)) * 3.4;
  }
  if (rectDistanceToMap(candidate.photoRect, neighbor.labelRect) < preferredLabelGap) {
    penalty += (preferredLabelGap - rectDistanceToMap(candidate.photoRect, neighbor.labelRect)) * 3.4;
  }
  if (rectDistanceToMap(candidate.labelRect, neighbor.labelRect) < preferredLabelGap) {
    penalty += (preferredLabelGap - rectDistanceToMap(candidate.labelRect, neighbor.labelRect)) * 2.8;
  }
  return penalty;
}

function hasGroupRectConflict(
  candidate: GroupGeometry,
  neighbor: GroupGeometry,
  safeGap: number,
) {
  return rectsOverlap(candidate.groupRect, neighbor.groupRect, Math.max(48, safeGap * 0.5));
}

function evaluateCandidate(
  group: PendingPlaceGroup,
  candidate: PlacementCandidate,
  groups: PendingPlaceGroup[],
  state: PlacementState,
  lockedGroups: LockedPlaceGroup[],
  safeGap: number,
) : CandidateEvaluation {
  const line = buildLine(group, candidate.geometry);
  let bundlePenalty = 0;
  let densityPenalty = 0;
  const photoGap = getPhotoGap(safeGap);
  const labelGap = getLabelGap(safeGap);

  for (const neighbor of groups) {
    if (neighbor.placeKey === group.placeKey) continue;
    const neighborPlacement = state.placementById.get(neighbor.placeKey);
    const neighborGeometry = state.geometryById.get(neighbor.placeKey);
    if (!neighborPlacement || !neighborGeometry) continue;

    if (hasGroupRectConflict(candidate.geometry, neighborGeometry, safeGap)) {
      return { valid: false, score: Number.POSITIVE_INFINITY };
    }

    densityPenalty += getLabelPressurePenalty(candidate.geometry, neighborGeometry, safeGap);

    const neighborLine = buildLine(neighbor, neighborGeometry);
    if (segmentsIntersect(line.start, line.end, neighborLine.start, neighborLine.end)) {
      return { valid: false, score: Number.POSITIVE_INFINITY };
    }

    const lineDistance = segmentDistance(line.start, line.end, neighborLine.start, neighborLine.end);
    if (lineDistance < LINE_BUNDLE_DISTANCE) {
      bundlePenalty += (LINE_BUNDLE_DISTANCE - lineDistance) * (LINE_BUNDLE_DISTANCE - lineDistance) * 8;
    }

    const centerDistance = Math.hypot(
      candidate.placement.centerX - neighborPlacement.centerX,
      candidate.placement.centerY - neighborPlacement.centerY,
    );
    if (centerDistance < LOCAL_DENSITY_DISTANCE) {
      densityPenalty += (LOCAL_DENSITY_DISTANCE - centerDistance) * 4.6;
    }

    densityPenalty += computeCorridorRiskPenalty(candidate.geometry, neighborGeometry, safeGap);
  }

  for (const locked of lockedGroups) {
    if (hasGroupRectConflict(candidate.geometry, locked.geometry, safeGap)) {
      return { valid: false, score: Number.POSITIVE_INFINITY };
    }

    densityPenalty += getLabelPressurePenalty(candidate.geometry, locked.geometry, safeGap);
    densityPenalty += computeCorridorRiskPenalty(candidate.geometry, locked.geometry, safeGap);

    const lockedLine = buildLine(locked, locked.geometry);
    if (segmentsIntersect(line.start, line.end, lockedLine.start, lockedLine.end)) {
      return { valid: false, score: Number.POSITIVE_INFINITY };
    }

    const lineDistance = segmentDistance(line.start, line.end, lockedLine.start, lockedLine.end);
    if (lineDistance < LINE_BUNDLE_DISTANCE) {
      bundlePenalty += (LINE_BUNDLE_DISTANCE - lineDistance) * (LINE_BUNDLE_DISTANCE - lineDistance) * 8;
    }
  }

  const sectorCounts = buildSectorCounts(groups, state, group.placeKey, candidate);
  const sectorPenalty = computeSectorPenalty(sectorCounts, groups.length);
  const envelopePenalty = computeEnvelopePenalty(groups, state, group.placeKey, candidate);

  return {
    valid: true,
    score:
      candidate.basePenalty +
      bundlePenalty +
      densityPenalty +
      sectorPenalty * 56 +
      envelopePenalty,
  };
}

function scoreFinalLayoutEnvelope(
  groups: PendingPlaceGroup[],
  geometryById: Map<string, GroupGeometry>,
) {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  let radiusSum = 0;
  let count = 0;
  for (const group of groups) {
    const geometry = geometryById.get(group.placeKey);
    if (!geometry) continue;
    left = Math.min(left, geometry.groupRect.left);
    right = Math.max(right, geometry.groupRect.right);
    top = Math.min(top, geometry.groupRect.top);
    bottom = Math.max(bottom, geometry.groupRect.bottom);
    radiusSum += Math.hypot(geometry.photoCenterX, geometry.photoCenterY);
    count += 1;
  }

  if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
    return Number.POSITIVE_INFINITY;
  }

  return (right - left) * 0.82 + (bottom - top) * 0.82 + (count > 0 ? radiusSum / count : 0) * 1.18;
}

function computeMaxViewBounds(
  groups: PendingPlaceGroup[],
  geometryById: Map<string, GroupGeometry>,
): MaxViewBounds | null {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (const group of groups) {
    const geometry = geometryById.get(group.placeKey);
    if (!geometry) continue;
    left = Math.min(left, geometry.groupRect.left);
    right = Math.max(right, geometry.groupRect.right);
    top = Math.min(top, geometry.groupRect.top);
    bottom = Math.max(bottom, geometry.groupRect.bottom);
  }

  if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
    return null;
  }

  const width = right - left;
  const height = bottom - top;
  return {
    width,
    height,
    area: width * height,
    radius: Math.max(
      Math.hypot(left, top),
      Math.hypot(left, bottom),
      Math.hypot(right, top),
      Math.hypot(right, bottom),
    ),
  };
}

function buildFallbackState(
  orderedGroups: PendingPlaceGroup[],
  basePlacementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
) {
  const state: PlacementState = {
    placementById: new Map<string, FootprintPlacement>(),
    geometryById: new Map<string, GroupGeometry>(),
    candidateIndexById: new Map<string, number>(),
  };

  for (const group of orderedGroups) {
    const placement = basePlacementById.get(group.placeKey) ?? { centerX: 0, centerY: 0 };
    const geometry = chooseBestGeometryForPlacement(group, placement, mapRect);
    state.placementById.set(group.placeKey, placement);
    state.geometryById.set(group.placeKey, geometry);
    state.candidateIndexById.set(group.placeKey, 0);
  }

  return state;
}

function finalizePlacementVariant(
  orderedGroups: PendingPlaceGroup[],
  workingState: PlacementState,
  basePlacementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
  lockedGroups: LockedPlaceGroup[],
  reportMetric?: SolverMetricReporter,
) {
  const finalizeStartedAt = performance.now();
  const markFinalizeMetric = (name: string) => {
    reportMetric?.(name, Number((performance.now() - finalizeStartedAt).toFixed(1)));
  };
  if (orderedGroups.length >= FINAL_VARIANT_REFINEMENT_GROUP_LIMIT) {
    markFinalizeMetric('finalize.skipLargeRefinementMs');
    return {
      placements: workingState.placementById,
      geometries: buildGeometryMapForPlacements(
        repairDeps,
        orderedGroups,
        workingState.placementById,
        mapRect,
        safeGap,
        labelGapBoost,
        lockedGroups,
      ),
    };
  }
  const refinedPlacementById = refineRadialPlacements(
    orderedGroups,
    new Map(workingState.placementById),
    mapRect,
    Math.max(safeGap, MAP_GAP),
    labelGapBoost,
  );
  markFinalizeMetric('finalize.refineRadialPlacementsMs');
  const refinedGeometryById = buildGeometryMapForPlacements(
    repairDeps,
    orderedGroups,
    refinedPlacementById,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  );
  markFinalizeMetric('finalize.refinedGeometryMs');
  const optimizedGeometryById = buildGeometryMapForPlacements(
    repairDeps,
    orderedGroups,
    workingState.placementById,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  );
  markFinalizeMetric('finalize.optimizedGeometryMs');

  const refinedHasHardConflicts = hasHardConflicts(
    repairDeps,
    orderedGroups,
    refinedPlacementById,
    refinedGeometryById,
    mapRect,
    safeGap,
    lockedGroups,
  );
  markFinalizeMetric('finalize.refinedHardConflictsMs');
  const optimizedHasHardConflicts = hasHardConflicts(
    repairDeps,
    orderedGroups,
    workingState.placementById,
    optimizedGeometryById,
    mapRect,
    safeGap,
    lockedGroups,
  );
  markFinalizeMetric('finalize.optimizedHardConflictsMs');
  const refinedCorridorRisk = countCorridorRiskConflicts(
    repairDeps,
    orderedGroups,
    refinedGeometryById,
    safeGap,
    lockedGroups,
  );
  markFinalizeMetric('finalize.refinedCorridorRiskMs');
  const optimizedCorridorRisk = countCorridorRiskConflicts(
    repairDeps,
    orderedGroups,
    optimizedGeometryById,
    safeGap,
    lockedGroups,
  );
  markFinalizeMetric('finalize.optimizedCorridorRiskMs');
  const refinedEnvelopeScore = scoreFinalLayoutEnvelope(orderedGroups, refinedGeometryById);
  const optimizedEnvelopeScore = scoreFinalLayoutEnvelope(orderedGroups, optimizedGeometryById);
  markFinalizeMetric('finalize.envelopeScoreMs');
  const finalVariant = chooseFinalPlacementVariant({
    refinedHasHardConflicts,
    optimizedHasHardConflicts,
    refinedCorridorRisk,
    optimizedCorridorRisk,
    refinedEnvelopeScore,
    optimizedEnvelopeScore,
  });
  markFinalizeMetric('finalize.chooseVariantMs');
  const finalPlacements = finalVariant === 'refined'
    ? refinedPlacementById
    : workingState.placementById;
  const finalGeometryById = finalPlacements === refinedPlacementById
    ? refinedGeometryById
    : optimizedGeometryById;
  const baseGeometryById = buildGeometryMapForPlacements(
    repairDeps,
    orderedGroups,
    basePlacementById,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  );
  markFinalizeMetric('finalize.baseGeometryMs');
  const baseLineCrossings = countPlacementLineCrossings(orderedGroups, basePlacementById);
  const finalLineCrossings = countPlacementLineCrossings(orderedGroups, finalPlacements);
  markFinalizeMetric('finalize.lineCrossingsMs');

  if (orderedGroups.length >= 20 && baseLineCrossings === 0 && finalLineCrossings > 0) {
    return {
      placements: basePlacementById,
      geometries: baseGeometryById,
    };
  }

  return {
    placements: finalPlacements,
    geometries: finalGeometryById,
  };
}

export function solvePendingGroupPlacements(
  groups: PendingPlaceGroup[],
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
  lockedGroups: LockedPlaceGroup[] = [],
  reportStage?: SolverStageReporter,
  reportMetric?: SolverMetricReporter,
) {
  const runSolvePass = (maxViewBounds: MaxViewBounds | null) => {
    activeMaxViewBounds = maxViewBounds;
    const solverStartedAt = performance.now();
    const markMetric = (name: string) => {
      reportMetric?.(name, Number((performance.now() - solverStartedAt).toFixed(1)));
    };
    reportStage?.('生成基座外环');
    const basePlacements = buildRadialLayout(
      groups.map((group) => ({
        id: group.placeKey,
        x: group.logicalX,
        y: group.logicalY,
        rect: group.collisionRect,
      })),
      mapRect,
      { mapGap: MAP_GAP },
    );
    markMetric('baseRadialLayoutMs');

    const basePlacementById = new Map<string, FootprintPlacement>();
    basePlacements.forEach((placement) => {
      basePlacementById.set(placement.id, {
        centerX: placement.centerX,
        centerY: placement.centerY,
      });
    });
    const orderedGroups = [...groups].sort(compareLayerPlacementOrder);
    reportStage?.('构建自动分层');
    const placementLayers = buildPlacementLayers(orderedGroups, basePlacementById);
    markMetric('buildPlacementLayersMs');
    const layeredState =
      placeGroupsLayerByLayer(
        layeredDeps,
        orderedGroups,
        placementLayers,
        mapRect,
        lockedGroups,
        safeGap,
      );
    markMetric('placeGroupsLayerByLayerMs');
    reportStage?.(layeredState ? '完成分层放置' : '进入兼容候选回退');
    const legacyInputs = layeredState
      ? null
      : buildLegacySolverInputs(legacyDeps, groups, basePlacementById, mapRect);
    if (!layeredState) {
      markMetric('buildLegacySolverInputsMs');
    }
    const workingState = layeredState
      ? layeredState
      : buildLegacyFallbackState(
          legacyDeps,
          legacyInputs!.orderedGroups,
          legacyInputs!.candidatePoolById,
          basePlacementById,
          mapRect,
          lockedGroups,
          safeGap,
          buildFallbackState,
        );
    if (!layeredState) {
      markMetric('buildLegacyFallbackStateMs');
    }
    const repairOrderedGroups = layeredState
      ? orderedGroups
      : legacyInputs!.orderedGroups;

    if (layeredState) {
      reportStage?.('微调角度与线长');
      refineAnglesAndRadii(
        layeredDeps,
        repairOrderedGroups,
        workingState,
        mapRect,
        safeGap,
        lockedGroups,
      );
      markMetric('refineAnglesAndRadiiMs');
    }
    reportStage?.('分析冲突并决定修复链');
    const preRepairAnalysis = analyzePlacementState(
      repairDeps,
      repairOrderedGroups,
      workingState.placementById,
      mapRect,
      safeGap,
      labelGapBoost,
      lockedGroups,
      {
        includeCorridorRisk: false,
        includeLineCrossings: true,
      },
    );
    markMetric('preRepairAnalysisMs');
    const needsRepair =
      preRepairAnalysis.hasHardConflicts ||
      preRepairAnalysis.lineCrossings > 0;

    if (legacyInputs && needsRepair) {
      reportStage?.('执行连续修复');
      repairPlacementIfNeeded(
        repairDeps,
        repairOrderedGroups,
        legacyInputs.candidatePoolById,
        workingState,
        mapRect,
        safeGap,
        labelGapBoost,
        lockedGroups,
        reportMetric,
      );
    } else if (needsRepair) {
      const layeredLegacyInputs = buildLegacySolverInputs(legacyDeps, groups, basePlacementById, mapRect);
      markMetric('buildLayeredLegacySolverInputsMs');
      reportStage?.('执行连续修复');
      repairPlacementIfNeeded(
        repairDeps,
        repairOrderedGroups,
        layeredLegacyInputs.candidatePoolById,
        workingState,
        mapRect,
        safeGap,
        labelGapBoost,
        lockedGroups,
        reportMetric,
      );
    }
    if (needsRepair) {
      markMetric('repairPlacementIfNeededMs');
    }

    reportStage?.('收敛最终排布');
    const result = finalizePlacementVariant(
      repairOrderedGroups,
      workingState,
      basePlacementById,
      mapRect,
      safeGap,
      labelGapBoost,
      lockedGroups,
      reportMetric,
    );
    markMetric('finalizePlacementVariantMs');
    return result;
  };

  reportStage?.('预跑最大视图');
  const previewResult = runSolvePass(null);
  const previewBounds = computeMaxViewBounds(groups, previewResult.geometries);
  reportMetric?.(
    'previewMaxViewRadius',
    Number((previewBounds?.radius ?? 0).toFixed(1)),
  );
  reportStage?.('根据最大视图正式排布');
  const finalResult = runSolvePass(previewBounds);
  activeMaxViewBounds = null;
  return finalResult;
}

export const __layoutSolverInternals = {
  angleDelta,
  buildCandidatePool,
  buildCorridorRepairCandidateSubset: (candidates: PlacementCandidate[]) => (
    buildCorridorRepairCandidateSubset(repairDeps, candidates)
  ),
  selectCorridorRepairTargets: (
    groups: PendingPlaceGroup[],
    geometryById: Map<string, GroupGeometry>,
    safeGap: number,
    lockedGroups: LockedPlaceGroup[] = [],
  ) => selectCorridorRepairTargets(repairDeps, groups, geometryById, safeGap, lockedGroups),
  countPlacementLineCrossings,
  assignInitialPlacements: (
    orderedGroups: PendingPlaceGroup[],
    candidatePoolById: Map<string, PlacementCandidate[]>,
    lockedGroups: LockedPlaceGroup[],
    safeGap: number,
  ) => assignInitialPlacements(
    legacyDeps,
    orderedGroups,
    candidatePoolById,
    lockedGroups,
    safeGap,
  ),
  optimizeAssignments: (
    orderedGroups: PendingPlaceGroup[],
    candidatePoolById: Map<string, PlacementCandidate[]>,
    state: PlacementState,
    lockedGroups: LockedPlaceGroup[],
    safeGap: number,
  ) => optimizeAssignments(
    legacyDeps,
    orderedGroups,
    candidatePoolById,
    state,
    lockedGroups,
    safeGap,
  ),
  improveCorridorRisk: (
    orderedGroups: PendingPlaceGroup[],
    candidatePoolById: Map<string, PlacementCandidate[]>,
    state: PlacementState,
    mapRect: LogicalRect,
    safeGap: number,
    labelGapBoost: number,
    lockedGroups: LockedPlaceGroup[],
  ) => improveCorridorRisk(
    repairDeps,
    orderedGroups,
    candidatePoolById,
    state,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  ),
};
