import {
  applyRuntimeEnvelope,
  buildGroupGeometryFromPhotoRect,
  getBoundaryLabelXMetrics,
  hasBoundaryLabelXConflict,
  rectsOverlap,
  resolveGroupGeometryAsWhole,
  translateGroupGeometry,
  type GroupGeometry,
} from './localMapGroupGeometry';
import { buildRadialLayout } from './localMapLayoutEngine';
import type {
  FootprintPlacement,
  LockedPlaceGroup,
  LogicalRect,
  PendingPlaceGroup,
  SolverFunctionTraceEntry,
  SolverTrace,
} from './footprintLayoutTypes';
import {
  fitsLabelRectAroundMap,
  fitsGroupRectAroundMap,
  fitsPhotoRectAroundMap,
  hasLabelCollisions,
  hasPhotoAgainstLabelCollisions,
  rectDistanceToMap,
  rectOverlapsOccupiedPhotos,
} from './footprintLayoutConstraints';
import {
  buildPlacementLayers,
  lastLayeredPlacementFailures,
  lastLayeredPlacementTrace,
  placeGroupsLayerByLayer,
} from './footprintLayoutLayeredPlacement';
import {
  assignInitialPlacements,
  buildLegacyFallbackState,
  buildLegacySolverInputs,
  optimizeAssignments,
} from './footprintLayoutLegacyFallback';
import {
  buildGeometryMapForPlacements,
  buildCorridorRepairCandidateSubset,
  improveCorridorRisk,
  improveGroupRectOnlyPairs,
  improvePairCorridorRisk,
  relaxRadialSpacing,
  selectCorridorRepairTargets,
} from './footprintLayoutRepairStages';
import type { PlacementState } from './footprintLayoutLayeredPlacement';

const GROUP_GAP = 14;
const LABEL_GAP = 22;
const MAP_GAP = 0;
const LINE_BUNDLE_DISTANCE = 34;
const LOCAL_DENSITY_DISTANCE = 420;
const GLOBAL_SECTOR_COUNT = 16;
const MAX_CANDIDATES_PER_GROUP = 48;
const ANGLE_OFFSETS_DEGREES = [-24, -16, -10, -6, 0, 6, 10, 16, 24];
const RADIUS_FACTORS = [0.78, 0.86, 0.94, 1, 1.08, 1.18];
const OUTER_RING_RADIUS_FACTORS = [1.24, 1.36];
const DENSE_SECTOR_ANGLE_OFFSETS_DEGREES = [-32, -24, 24, 32];
const DENSE_SECTOR_RADIUS_FACTORS = [1.08, 1.18, 1.28];
const DENSE_OUTWARD_SHELL_ANGLE_OFFSETS_DEGREES = [-22, -12, 0, 12, 22];
const DENSE_OUTWARD_SHELL_RADIUS_FACTORS = [1.42, 1.58, 1.74];
const DENSE_MAP_ADJACENT_ESCAPE_ANGLE_OFFSETS_DEGREES = [-72, -56, 56, 72];
const DENSE_MAP_ADJACENT_ESCAPE_RADIUS_FACTORS = [1.18, 1.32, 1.46];
const PRESSURE_YIELD_ANGLE_OFFSETS_DEGREES = [-42, -30, 30, 42];
const PRESSURE_YIELD_RADIUS_FACTORS = [1, 1.08, 1.18];
const CORNER_TRANSITION_ESCAPE_ANGLE_OFFSETS_DEGREES = [-96, -84, 84, 96];
const CORNER_TRANSITION_ESCAPE_RADIUS_FACTORS = [1.08, 1.22, 1.38];
const BOUNDARY_X_ESCAPE_PADDING = 12;
const BASE_LAYOUT_MAP_GAP = 96;
const BASE_LAYOUT_MIN_OUTWARD_PUSH = 24;
const REPAIR_TEST_CONFIG = {
  rebalanceIterationCount: 3,
  radialRelaxPassLimit: 2,
  corridorRepairGroupLimit: 8,
  corridorRepairCandidateLimit: 10,
  corridorRepairNearTailLimit: 6,
  corridorRepairSpreadSampleCount: 5,
  pairRepairGroupLimit: 6,
  pairRepairPassLimit: 2,
  pairRepairDeepSearchLimit: 8,
  groupRectOnlyPairLimit: 6,
  groupRectOnlyCandidateLimit: 6,
} as const;

type PlacementCandidate = {
  placement: FootprintPlacement;
  geometry: GroupGeometry;
  basePenalty: number;
};

type CandidateEvaluation = {
  valid: boolean;
  score: number;
};

function getMapViewRadius(mapRect: LogicalRect) {
  return Math.max(
    Math.hypot(mapRect.left, mapRect.top),
    Math.hypot(mapRect.left, mapRect.bottom),
    Math.hypot(mapRect.right, mapRect.top),
    Math.hypot(mapRect.right, mapRect.bottom),
  );
}

function getAdaptiveBaseRadius(baseRadius: number, mapRect: LogicalRect) {
  return Math.max(
    baseRadius + BASE_LAYOUT_MIN_OUTWARD_PUSH,
    180,
    getMapViewRadius(mapRect) + BASE_LAYOUT_MAP_GAP,
  );
}

function getAdaptiveOuterRingFactors(baseRadius: number, mapRect: LogicalRect) {
  const adaptiveBaseRadius = getAdaptiveBaseRadius(baseRadius, mapRect);
  const targetRadius = adaptiveBaseRadius + Math.max(96, getMapViewRadius(mapRect) * 0.14);
  return Array.from(
    new Set(
      [...OUTER_RING_RADIUS_FACTORS, Number((targetRadius / adaptiveBaseRadius).toFixed(3))]
        .filter((factor) => factor > 1),
    ),
  ).sort((left, right) => left - right);
}

export type SolverStageReporter = (stage: string) => void;
export type SolverMetricReporter = (name: string, elapsedMs: number) => void;

function snapshotPlacements(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
) {
  return groups.flatMap((group) => {
    const placement = placementById.get(group.placeKey);
    if (!placement) return [];
    return [{
      placeKey: group.placeKey,
      centerX: placement.centerX,
      centerY: placement.centerY,
      angle: Math.atan2(placement.centerY, placement.centerX),
      radius: Math.hypot(placement.centerX, placement.centerY),
    }];
  });
}

function snapshotGeometries(
  groups: PendingPlaceGroup[],
  geometryById: Map<string, GroupGeometry>,
) {
  return groups.flatMap((group) => {
    const geometry = geometryById.get(group.placeKey);
    if (!geometry) return [];
    return [{
      placeKey: group.placeKey,
      labelSide: geometry.labelSide,
      lineAnchorX: geometry.lineAnchorX,
      lineAnchorY: geometry.lineAnchorY,
      groupRect: geometry.groupRect,
    }];
  });
}

const layeredDeps = {
  angleDelta,
  buildLine,
  chooseBestGeometryForPlacement: choosePlanningGeometryForPlacement,
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
  evaluateCandidate: (
    group: PendingPlaceGroup,
    candidate: PlacementCandidate,
    groups: PendingPlaceGroup[],
    state: PlacementState,
    lockedGroups: LockedPlaceGroup[],
    safeGap: number,
  ) => evaluateCandidate(group, candidate, groups, state, lockedGroups, safeGap, group.mapRect),
};

const geometryAnalysisDeps = {
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

function getGeometryLabelOffset(geometry: GroupGeometry) {
  return geometry.labelSide === 'top'
    ? Math.max(0, geometry.photoRect.top - geometry.lineAnchorY)
    : Math.max(0, geometry.lineAnchorY - geometry.photoRect.bottom);
}

function applyPlanningEnvelope(
  geometry: GroupGeometry,
  mapRect?: LogicalRect,
) {
  return applyRuntimeEnvelope(geometry, mapRect);
}

function buildGeometryForPlacement(
  group: PendingPlaceGroup,
  placement: FootprintPlacement,
  mapRect?: LogicalRect,
) {
  const rebuiltGeometry = buildGroupGeometryFromPhotoRect(
    group.collisionGeometry.photoRect,
    group.placePhotos[0]?.placeTitle || '',
    group.placePhotos.length,
    group.collisionScale,
    group.collisionGeometry.labelSide,
    getGeometryLabelOffset(group.collisionGeometry),
    mapRect,
  );
  const translated = translateGroupGeometry(
    rebuiltGeometry,
    placement.centerX,
    placement.centerY,
  );
  return translated;
}

function buildPlanningGeometryForPlacement(
  group: PendingPlaceGroup,
  placement: FootprintPlacement,
  mapRect?: LogicalRect,
) {
  const translated = buildGeometryForPlacement(group, placement, mapRect);
  return applyPlanningEnvelope(translated, mapRect);
}

function geometryFitsMap(geometry: GroupGeometry, mapRect: LogicalRect) {
  return (
    fitsPhotoRectAroundMap(geometry.photoRect, mapRect, MAP_GAP) &&
    fitsLabelRectAroundMap(geometry.labelRect, mapRect, MAP_GAP) &&
    fitsGroupRectAroundMap(geometry.overallRect, mapRect, MAP_GAP)
  );
}

function chooseBestGeometryForPlacement(
  group: PendingPlaceGroup,
  placement: FootprintPlacement,
  mapRect: LogicalRect,
) {
  return buildGeometryForPlacement(group, placement, mapRect);
}

function choosePlanningGeometryForPlacement(
  group: PendingPlaceGroup,
  placement: FootprintPlacement,
  mapRect: LogicalRect,
) {
  return buildPlanningGeometryForPlacement(group, placement, mapRect);
}

function buildPlanningGeometry(
  group: PendingPlaceGroup,
  absoluteCenterX: number,
  absoluteCenterY: number,
) {
  const relativeGeometry = buildGroupGeometryFromPhotoRect(
    group.collisionGeometry.photoRect,
    group.placePhotos[0]?.placeTitle || '',
    group.placePhotos.length,
    group.collisionScale,
    group.collisionGeometry.labelSide,
    getGeometryLabelOffset(group.collisionGeometry),
  );
  const absoluteGeometry = translateGroupGeometry(
    relativeGeometry,
    absoluteCenterX,
    absoluteCenterY,
  );
  const plannedAbsoluteGeometry = applyPlanningEnvelope(absoluteGeometry, group.mapRect);
  return translateGroupGeometry(
    plannedAbsoluteGeometry,
    -absoluteCenterX,
    -absoluteCenterY,
  );
}

function buildPlanningGroups(
  groups: PendingPlaceGroup[],
  placementById?: Map<string, FootprintPlacement>,
) {
  return groups.map((group) => {
    const placement = placementById?.get(group.placeKey);
    const planningGeometry = buildPlanningGeometry(
      group,
      placement?.centerX ?? group.logicalX,
      placement?.centerY ?? group.logicalY,
    );
    return {
      ...group,
      collisionGeometry: planningGeometry,
      collisionRect: planningGeometry.overallRect,
    };
  });
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
  const leftSourceRadius = Math.hypot(left.logicalX, left.logicalY);
  const rightSourceRadius = Math.hypot(right.logicalX, right.logicalY);
  const leftOutwardNeed = Math.max(0, leftSourceRadius + BASE_LAYOUT_MIN_OUTWARD_PUSH - leftRadius);
  const rightOutwardNeed = Math.max(0, rightSourceRadius + BASE_LAYOUT_MIN_OUTWARD_PUSH - rightRadius);
  if (Math.abs(rightOutwardNeed - leftOutwardNeed) > 1e-6) return rightOutwardNeed - leftOutwardNeed;
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
  const leftOutwardNeed = Math.max(0, Math.hypot(left.logicalX, left.logicalY) + BASE_LAYOUT_MIN_OUTWARD_PUSH);
  const rightOutwardNeed = Math.max(0, Math.hypot(right.logicalX, right.logicalY) + BASE_LAYOUT_MIN_OUTWARD_PUSH);
  if (Math.abs(rightOutwardNeed - leftOutwardNeed) > 1e-6) return rightOutwardNeed - leftOutwardNeed;

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
  const driftPenalty = Math.abs(angleDelta(angle, baseAngle)) * (allowWideEscape ? 24 : 34);
  const inwardPenalty = Math.max(0, baseRadius - radius) * 4.8;
  const outwardSlackPenalty = Math.max(0, radius - (baseRadius + 220)) * 0.42;
  const mapDistance = rectDistanceToMap(geometry.groupRect, mapRect);
  const mapClearanceTarget = BASE_LAYOUT_MIN_OUTWARD_PUSH;
  const mapClearancePenalty =
    mapDistance < mapClearanceTarget
      ? (mapClearanceTarget - mapDistance) * (mapClearanceTarget - mapDistance) * 4.6
      : Math.max(0, mapDistance - 220) * 0.18;
  return driftPenalty + inwardPenalty + outwardSlackPenalty + mapClearancePenalty;
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
  occupiedGeometries: Array<{
    anchor: { x: number; y: number };
    geometry: GroupGeometry;
    placement: FootprintPlacement;
  }> = [],
) {
  const baseAngle = Math.atan2(basePlacement.centerY, basePlacement.centerX);
  const baseRadius = Math.hypot(basePlacement.centerX, basePlacement.centerY);
  const safeBaseRadius = getAdaptiveBaseRadius(baseRadius, mapRect);
  const adaptiveOuterRingFactors = getAdaptiveOuterRingFactors(baseRadius, mapRect);
  const nearProtectedMapBand = rectDistanceToMap(group.collisionRect, mapRect) < 96;
  const allowWideEscape = sectorDensity >= 3 && nearProtectedMapBand;
  const nearLowerCornerTransition =
    group.logicalY > mapRect.bottom - 28 &&
    Math.abs(group.logicalX) > mapRect.right - 36;
  const groupWidth = Math.max(1, group.collisionRect.right - group.collisionRect.left);
  const groupHeight = Math.max(1, group.collisionRect.bottom - group.collisionRect.top);
  const groupArea = groupWidth * groupHeight;
  const pressureYieldEnabled = sectorDensity >= 2 || groupArea >= 28_000;
  const pressureYieldDegrees = Math.min(
    54,
    Math.max(
      18,
      Math.round(
        (sectorDensity * 7) +
        Math.min(16, groupArea / 4_500),
      ),
    ),
  );
  const seeds: PlacementCandidate[] = [];

  const addCandidate = (
    angle: number,
    radius: number,
    useWideEscapePenalty = false,
    scoreAdjustment = 0,
  ) => {
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
      ) + scoreAdjustment,
    });
  };

  const boundaryExtraRadius = occupiedGeometries.reduce((maxDelta, occupied) => {
    const candidateBaseGeometry = chooseBestGeometryForPlacement(group, basePlacement, mapRect);
    const occupiedGeometry = occupied.placement
      ? translateGroupGeometry(
          occupied.geometry,
          occupied.placement.centerX,
          occupied.placement.centerY,
        )
      : occupied.geometry;
    const metrics = getBoundaryLabelXMetrics(
      { x: group.logicalX, y: group.logicalY },
      candidateBaseGeometry,
      occupied.anchor,
      occupiedGeometry,
      mapRect,
    );
    if (!metrics || metrics.extraSeparationNeeded <= 0) return maxDelta;
    const dx = basePlacement.centerX - group.logicalX;
    const dy = basePlacement.centerY - group.logicalY;
    const radialLength = Math.max(1, Math.hypot(dx, dy));
    const horizontalUnit = Math.abs(dx) / radialLength;
    const requiredRadiusDelta = (metrics.extraSeparationNeeded + BOUNDARY_X_ESCAPE_PADDING) / Math.max(horizontalUnit, 0.35);
    return Math.max(maxDelta, requiredRadiusDelta);
  }, 0);

  for (const radiusFactor of RADIUS_FACTORS) {
    const radius = safeBaseRadius * radiusFactor;
    for (const angleOffset of ANGLE_OFFSETS_DEGREES) {
      addCandidate(baseAngle + (angleOffset * Math.PI) / 180, radius);
    }
  }

  for (const radiusFactor of adaptiveOuterRingFactors) {
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

  if (sectorDensity >= 5 || nearProtectedMapBand) {
    for (const radiusFactor of DENSE_OUTWARD_SHELL_RADIUS_FACTORS) {
      const radius = safeBaseRadius * radiusFactor;
      for (const angleOffset of DENSE_OUTWARD_SHELL_ANGLE_OFFSETS_DEGREES) {
        const shellBonus =
          44 +
          Math.max(0, sectorDensity - 4) * 8 +
          (nearProtectedMapBand ? 20 : 0);
        addCandidate(
          baseAngle + (angleOffset * Math.PI) / 180,
          radius,
          true,
          -shellBonus,
        );
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

  if (nearLowerCornerTransition) {
    for (const radiusFactor of CORNER_TRANSITION_ESCAPE_RADIUS_FACTORS) {
      const radius = safeBaseRadius * radiusFactor;
      for (const angleOffset of CORNER_TRANSITION_ESCAPE_ANGLE_OFFSETS_DEGREES) {
        addCandidate(
          baseAngle + (angleOffset * Math.PI) / 180,
          radius,
          true,
          -36,
        );
      }
    }
  }

  if (pressureYieldEnabled) {
    const dynamicOffsets = Array.from(new Set([
      ...PRESSURE_YIELD_ANGLE_OFFSETS_DEGREES,
      -pressureYieldDegrees,
      pressureYieldDegrees,
      -Math.max(20, Math.round(pressureYieldDegrees * 0.72)),
      Math.max(20, Math.round(pressureYieldDegrees * 0.72)),
    ])).sort((left, right) => left - right);
    for (const radiusFactor of PRESSURE_YIELD_RADIUS_FACTORS) {
      const radius = safeBaseRadius * radiusFactor;
      for (const angleOffset of dynamicOffsets) {
        const normalizedOffset = Math.abs(angleOffset) / Math.max(1, pressureYieldDegrees);
        const denseYieldBonus = sectorDensity >= 3 ? 42 : 24;
        const protectedBandBonus = nearProtectedMapBand ? 20 : 0;
        const areaBonus = Math.min(18, groupArea / 3000);
        const outwardBonus = Math.max(0, radiusFactor - 1) * 12;
        const scoreAdjustment = -(
          denseYieldBonus +
          protectedBandBonus +
          areaBonus +
          normalizedOffset * 18 +
          outwardBonus
        );
        addCandidate(
          baseAngle + (angleOffset * Math.PI) / 180,
          radius,
          true,
          scoreAdjustment,
        );
      }
    }
  }

  if (boundaryExtraRadius > 0) {
    const escapeRadius = safeBaseRadius + boundaryExtraRadius;
    for (const angleOffset of [0, -6, 6, -12, 12]) {
      addCandidate(baseAngle + (angleOffset * Math.PI) / 180, escapeRadius, true, -64);
      addCandidate(baseAngle + (angleOffset * Math.PI) / 180, escapeRadius + boundaryExtraRadius * 0.35, true, -52);
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
  return (
    width * 0.18 +
    height * 0.16 +
    area * 0.00006 +
    maxViewRadius * 0.42
  );
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
  mapRect?: LogicalRect,
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

    if (
      mapRect &&
      hasBoundaryLabelXConflict(
        { x: group.logicalX, y: group.logicalY },
        candidate.geometry,
        { x: neighbor.logicalX, y: neighbor.logicalY },
        neighborGeometry,
        mapRect,
      )
    ) {
      return { valid: false, score: Number.POSITIVE_INFINITY };
    }

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
    if (
      mapRect &&
      hasBoundaryLabelXConflict(
        { x: group.logicalX, y: group.logicalY },
        candidate.geometry,
        { x: locked.logicalX, y: locked.logicalY },
        locked.geometry,
        mapRect,
      )
    ) {
      return { valid: false, score: Number.POSITIVE_INFINITY };
    }

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
    const geometry = choosePlanningGeometryForPlacement(group, placement, mapRect);
    state.placementById.set(group.placeKey, placement);
    state.geometryById.set(group.placeKey, geometry);
    state.candidateIndexById.set(group.placeKey, 0);
  }

  return state;
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
  const solverStartedAt = performance.now();
  const trace: SolverTrace = {
    version: 'solver-trace-v1',
    steps: [],
  };
  const functionTrace: SolverFunctionTraceEntry[] = [];
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
    { mapGap: BASE_LAYOUT_MAP_GAP },
  );
  markMetric('baseRadialLayoutMs');

  const basePlacementById = new Map<string, FootprintPlacement>();
  basePlacements.forEach((placement) => {
    basePlacementById.set(placement.id, {
      centerX: placement.centerX,
      centerY: placement.centerY,
    });
  });
  trace.steps.push({
    step: 'base-radial-layout',
    placements: snapshotPlacements(groups, basePlacementById),
  });
  const orderedGroups = [...groups].sort(compareLayerPlacementOrder);
  reportStage?.('构建自动分层');
  const placementLayers = buildPlacementLayers(orderedGroups, basePlacementById, mapRect);
  markMetric('buildPlacementLayersMs');
  trace.steps.push({
    step: 'placement-layers',
    placements: snapshotPlacements(orderedGroups, basePlacementById),
    meta: {
      layerCount: placementLayers.length,
      layers: placementLayers.map((layer) => ({
        index: layer.index,
        radius: layer.radius,
        slotCount: layer.slotCount,
        minAngularGap: layer.minAngularGap,
        placeKeys: layer.entries.map((entry) => entry.group.placeKey),
      })),
    },
  });
  functionTrace.push(...lastLayeredPlacementTrace);
  const layeredState =
    placeGroupsLayerByLayer(
      layeredDeps,
      orderedGroups,
      placementLayers,
      mapRect,
      safeGap,
      lockedGroups,
    );
  markMetric('placeGroupsLayerByLayerMs');
  functionTrace.push(...lastLayeredPlacementTrace.slice(functionTrace.length));
  if (layeredState) {
    trace.steps.push({
      step: 'layered-placement',
      placements: snapshotPlacements(orderedGroups, layeredState.placementById),
      geometries: snapshotGeometries(orderedGroups, layeredState.geometryById),
      meta: {
        functionTrace,
      },
    });
  } else {
    trace.steps.push({
      step: 'layered-placement-failed',
      placements: [],
      meta: {
        failures: lastLayeredPlacementFailures,
        functionTrace,
      },
    });
  }
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
    trace.steps.push({
      step: 'legacy-fallback-state',
      placements: snapshotPlacements(legacyInputs!.orderedGroups, workingState.placementById),
      geometries: snapshotGeometries(legacyInputs!.orderedGroups, workingState.geometryById),
    });
  }
  const repairOrderedGroups = layeredState
    ? orderedGroups
    : legacyInputs!.orderedGroups;

  if (layeredState) {
    reportStage?.('完成主排布');
  }

  reportStage?.('收敛最终排布');
  const result = {
    placements: workingState.placementById,
    geometries: buildGeometryMapForPlacements(
      geometryAnalysisDeps,
      repairOrderedGroups,
      workingState.placementById,
      mapRect,
      safeGap,
      labelGapBoost,
      lockedGroups,
    ),
  };
  markMetric('finalPlacementGeometryMs');
  trace.steps.push({
    step: 'final-placement',
    placements: snapshotPlacements(repairOrderedGroups, result.placements),
    geometries: snapshotGeometries(repairOrderedGroups, result.geometries),
    meta: {
      functionTrace,
    },
  });
  return {
    ...result,
    trace,
  };
}

export const __layoutSolverInternals = {
  angleDelta,
  buildPlanningGroups,
  buildCandidatePool,
  buildCorridorRepairCandidateSubset: (candidates: PlacementCandidate[]) => (
    buildCorridorRepairCandidateSubset({ config: REPAIR_TEST_CONFIG }, candidates)
  ),
  improveCorridorRisk: (
    orderedGroups: PendingPlaceGroup[],
    candidatePoolById: Map<string, PlacementCandidate[]>,
    state: PlacementState,
    mapRect: LogicalRect,
    safeGap: number,
    labelGapBoost: number,
    lockedGroups: LockedPlaceGroup[] = [],
  ) => improveCorridorRisk(
    { ...geometryAnalysisDeps, config: REPAIR_TEST_CONFIG },
    orderedGroups,
    candidatePoolById,
    state,
    mapRect,
    safeGap,
    labelGapBoost,
      lockedGroups,
  ),
  selectCorridorRepairTargets: (
    groups: PendingPlaceGroup[],
    geometryById: Map<string, GroupGeometry>,
    mapRect: LogicalRect,
    safeGap: number,
    lockedGroups: LockedPlaceGroup[] = [],
  ) => selectCorridorRepairTargets(geometryAnalysisDeps, groups, geometryById, mapRect, safeGap, lockedGroups),
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
};
