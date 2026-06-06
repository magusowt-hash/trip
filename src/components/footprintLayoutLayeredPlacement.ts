import type {
  FootprintPlacement,
  LockedPlaceGroup,
  LogicalRect,
  PendingPlaceGroup,
  SolverFunctionTraceEntry,
} from './footprintLayoutTypes';
import type { GroupGeometry } from './localMapGroupGeometry';
import { rectsOverlap } from './localMapGroupGeometry';
import {
  buildBlockedBandFromGeometry,
  computeFreeArcsAtRadius,
  findPlacementInField,
  resolvePlacementSector,
  type PlacementFieldCandidate,
  type PolarBlockedBand,
  scoreFreeArcAccess,
  scoreFreeArcStructure,
} from './footprintPlacementField';

type LineGroup = Pick<PendingPlaceGroup, 'logicalX' | 'logicalY'> | LockedPlaceGroup;

export type PlacementState = {
  placementById: Map<string, FootprintPlacement>;
  geometryById: Map<string, GroupGeometry>;
  candidateIndexById: Map<string, number>;
};

export type LayeredPlacementFailure = {
  placeKey: string;
  preferredLayerIndex: number;
  attemptedLayers: Array<{
    layerIndex: number;
    fieldCandidateCount: number;
    slotFallbackUsed: boolean;
    placed: boolean;
  }>;
};

export let lastLayeredPlacementFailures: LayeredPlacementFailure[] = [];
export let lastLayeredPlacementTrace: SolverFunctionTraceEntry[] = [];

type EvaluatePlacementResult = {
  valid: boolean;
  score: number;
  geometry: GroupGeometry | null;
};

type RefineCandidate = {
  placement: FootprintPlacement;
  geometry: GroupGeometry;
  score: number;
};

type LayeredGroupEntry = {
  group: PendingPlaceGroup;
  sizeScore: number;
  spanEstimate: number;
  radialDepth: number;
  angle: number;
  sourceRadius: number;
};

type PlacementLayer = {
  index: number;
  radius: number;
  slotCount: number;
  minAngularGap: number;
  entries: LayeredGroupEntry[];
};

type LayeredDeps = {
  angleDelta: (left: number, right: number) => number;
  buildLine: (group: LineGroup, geometry: GroupGeometry) => {
    start: { x: number; y: number };
    end: { x: number; y: number };
  };
  chooseBestGeometryForPlacement: (
    group: PendingPlaceGroup,
    placement: FootprintPlacement,
    mapRect: LogicalRect,
  ) => GroupGeometry;
  countPlacementLineCrossings: (
    groups: PendingPlaceGroup[],
    placementById: Map<string, FootprintPlacement>,
  ) => number;
  geometryFitsMap: (geometry: GroupGeometry, mapRect: LogicalRect) => boolean;
  getLabelGap: (safeGap: number) => number;
  getPhotoGap: (safeGap: number) => number;
  hasLabelCollisions: (
    candidate: GroupGeometry,
    occupiedGeometries: GroupGeometry[],
    safeGap: number,
  ) => boolean;
  hasPhotoAgainstLabelCollisions: (
    candidate: GroupGeometry,
    occupiedGeometries: GroupGeometry[],
    safeGap: number,
  ) => boolean;
  rectOverlapsOccupiedPhotos: (
    rect: LogicalRect,
    occupiedGeometries: GroupGeometry[],
    safeGap: number,
  ) => boolean;
  segmentDistance: (
    a1: { x: number; y: number },
    a2: { x: number; y: number },
    b1: { x: number; y: number },
    b2: { x: number; y: number },
  ) => number;
  segmentsIntersect: (
    a1: { x: number; y: number },
    a2: { x: number; y: number },
    b1: { x: number; y: number },
    b2: { x: number; y: number },
  ) => boolean;
};

const LINE_BUNDLE_DISTANCE = 34;
const LOCAL_DENSITY_DISTANCE = 420;
const LAYER_RADIUS_BASE = 220;
const LAYER_RADIUS_STEP = 64;
const LAYER_FILL_RATIO = 0.8;
const LAYER_RADIUS_PADDING = 28;
const LAYER_SLOT_MIN = 10;
const LAYER_SLOT_PROBE_LIMIT = 7;
const LAYER_ANGLE_JITTER_DEGREES = [0, -4, 4];
const FINAL_REFINE_RADIUS_FACTORS = [1, 0.96, 1.04];
const FINAL_REFINE_ANGLE_DEGREES = [0, -4, 4, -8, 8];
const MIN_REQUIRED_ANGULAR_GAP = Math.PI / 20;
const MAX_REQUIRED_ANGULAR_GAP = Math.PI / 5;
const FIELD_PADDING_RADIUS = 48;
const FIELD_IDEAL_RADIUS_FLOOR = 180;

function getMapViewRadius(mapRect: LogicalRect) {
  return Math.max(
    Math.hypot(mapRect.left, mapRect.top),
    Math.hypot(mapRect.left, mapRect.bottom),
    Math.hypot(mapRect.right, mapRect.top),
    Math.hypot(mapRect.right, mapRect.bottom),
  );
}

function getAdaptiveLayerRadiusBase(mapRect: LogicalRect) {
  return Math.max(LAYER_RADIUS_BASE, getMapViewRadius(mapRect) + LAYER_RADIUS_PADDING);
}

function getAdaptiveLayerRadiusStep(mapRect: LogicalRect) {
  return Math.max(LAYER_RADIUS_STEP, getMapViewRadius(mapRect) * 0.1);
}

function hasGroupRectConflict(
  candidate: GroupGeometry,
  neighbor: GroupGeometry,
  safeGap: number,
) {
  return rectsOverlap(candidate.groupRect, neighbor.groupRect, Math.max(48, safeGap * 0.5));
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

export function scoreGroupSize(group: PendingPlaceGroup) {
  const width = Math.max(1, group.collisionRect.right - group.collisionRect.left);
  const height = Math.max(1, group.collisionRect.bottom - group.collisionRect.top);
  const area = width * height;
  const labelWidth = Math.max(1, group.collisionGeometry.labelRect.right - group.collisionGeometry.labelRect.left);
  const photoCountWeight = Math.max(0, group.placePhotos.length - 1) * 320;
  return area + labelWidth * 28 + photoCountWeight;
}

function estimateGroupSpan(group: PendingPlaceGroup) {
  const geometry = group.collisionGeometry;
  const groupWidth = Math.max(1, geometry.groupRect.right - geometry.groupRect.left);
  const groupHeight = Math.max(1, geometry.groupRect.bottom - geometry.groupRect.top);
  const labelWidth = Math.max(1, geometry.labelRect.right - geometry.labelRect.left);
  const labelHeight = Math.max(1, geometry.labelRect.bottom - geometry.labelRect.top);
  return Math.max(groupWidth, groupHeight * 0.9, labelWidth * 0.88, labelHeight * 1.2);
}

function estimateGroupDepth(group: PendingPlaceGroup) {
  const geometry = group.collisionGeometry;
  const groupWidth = Math.max(1, geometry.groupRect.right - geometry.groupRect.left);
  const groupHeight = Math.max(1, geometry.groupRect.bottom - geometry.groupRect.top);
  return Math.max(groupWidth, groupHeight);
}

function estimateGroupPreferredRadius(group: PendingPlaceGroup) {
  const baseRadius = Math.max(
    FIELD_IDEAL_RADIUS_FLOOR,
    Math.hypot(group.logicalX, group.logicalY),
  );
  const sizeAdjustment = Math.min(96, estimateGroupDepth(group) * 0.12);
  return baseRadius + sizeAdjustment;
}

function computePlacementAngularGapPenalty(
  deps: LayeredDeps,
  angle: number,
  radius: number,
  spanEstimate: number,
  neighborPlacement: FootprintPlacement,
) {
  const neighborAngle = Math.atan2(neighborPlacement.centerY, neighborPlacement.centerX);
  const gap = Math.abs(deps.angleDelta(angle, neighborAngle));
  const requiredGap = computeRequiredAngularGap(radius, spanEstimate);
  if (gap >= requiredGap) return 0;
  return (requiredGap - gap) * radius * 0.28;
}

function compareLayeredEntryOrder(left: LayeredGroupEntry, right: LayeredGroupEntry) {
  const angleGap = left.angle - right.angle;
  if (Math.abs(angleGap) > 1e-6) return angleGap;
  if (Math.abs(left.sizeScore - right.sizeScore) > 1e-6) {
    return left.sizeScore - right.sizeScore;
  }
  return left.group.placeKey.localeCompare(right.group.placeKey, 'zh-CN');
}

function computeRequiredAngularGap(
  radius: number,
  spanEstimate: number,
) {
  const safeRadius = Math.max(LAYER_RADIUS_BASE, radius);
  const gap = (spanEstimate / safeRadius) * 1.18;
  return Math.max(MIN_REQUIRED_ANGULAR_GAP, Math.min(MAX_REQUIRED_ANGULAR_GAP, gap));
}

function findNearestAngularGap(
  angle: number,
  entries: LayeredGroupEntry[],
) {
  let nearestGap = Number.POSITIVE_INFINITY;
  for (const entry of entries) {
    const fullTurn = Math.PI * 2;
    let gap = Math.abs(angle - entry.angle) % fullTurn;
    if (gap > Math.PI) gap = fullTurn - gap;
    nearestGap = Math.min(nearestGap, gap);
  }
  return nearestGap;
}

export function buildPlacementLayers(
  groups: PendingPlaceGroup[],
  basePlacementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
) {
  lastLayeredPlacementTrace = [];
  const adaptiveRadiusBase = getAdaptiveLayerRadiusBase(mapRect);
  const adaptiveRadiusStep = getAdaptiveLayerRadiusStep(mapRect);
  const entries = groups.map((group) => {
    const placement = basePlacementById.get(group.placeKey) ?? { centerX: group.logicalX, centerY: group.logicalY };
    return {
      group,
      sizeScore: scoreGroupSize(group),
      spanEstimate: estimateGroupSpan(group),
      radialDepth: estimateGroupDepth(group),
      angle: Math.atan2(group.logicalY, group.logicalX),
      sourceRadius: Math.max(
        adaptiveRadiusBase,
        Math.hypot(placement.centerX, placement.centerY),
      ),
    };
  }).sort(compareLayeredEntryOrder);

  const layers: PlacementLayer[] = [];
  let currentEntries: LayeredGroupEntry[] = [];
  let currentRadius = adaptiveRadiusBase;
  let nextMinRadius = adaptiveRadiusBase;

  const finalizeLayer = (layerEntries: LayeredGroupEntry[]) => {
    if (layerEntries.length === 0) return;
    const sortedEntries = [...layerEntries].sort((left, right) => left.angle - right.angle);
    const sourceRadius = sortedEntries.reduce((sum, entry) => sum + entry.sourceRadius, 0) / sortedEntries.length;
    const maxDepth = sortedEntries.reduce((maxDepth, entry) => Math.max(maxDepth, entry.radialDepth), 0);
    const slotCount = Math.max(LAYER_SLOT_MIN, sortedEntries.length * 2 + 2);
    const requiredAngularGap = sortedEntries.reduce((maxGap, entry) => (
      Math.max(maxGap, computeRequiredAngularGap(Math.max(currentRadius, sourceRadius), entry.spanEstimate))
    ), 0);
    layers.push({
      index: layers.length,
      radius: Math.max(currentRadius, sourceRadius),
      slotCount,
      minAngularGap: Math.max((Math.PI * 2 / slotCount) * 0.72, requiredAngularGap),
      entries: sortedEntries,
    });
    lastLayeredPlacementTrace.push({
      fn: 'buildPlacementLayers',
      stage: 'finalize-layer',
      meta: {
        layerIndex: layers.length - 1,
        radius: Math.max(currentRadius, sourceRadius),
        sourceRadius,
        maxDepth,
        slotCount,
        requiredAngularGap,
        placeKeys: sortedEntries.map((entry) => entry.group.placeKey),
      },
    });
    nextMinRadius = Math.max(
      nextMinRadius,
      Math.max(currentRadius, sourceRadius) + maxDepth + adaptiveRadiusStep,
    );
  };

  for (const entry of entries) {
    const projectedEntries = [...currentEntries, entry];
    const projectedSpan = projectedEntries.reduce((sum, item) => sum + item.spanEstimate, 0);
    const projectedMaxDepth = projectedEntries.reduce((maxDepth, item) => Math.max(maxDepth, item.radialDepth), 0);
    const projectedRadius = Math.max(
      nextMinRadius,
      projectedEntries.reduce((sum, item) => sum + item.sourceRadius, 0) / projectedEntries.length,
    );
    const availableCircumference = Math.PI * 2 * Math.max(projectedRadius, adaptiveRadiusBase);
    const exceedsCircumference =
      currentEntries.length > 0 &&
      projectedSpan > availableCircumference * LAYER_FILL_RATIO;
    const exceedsDepthBand =
      currentEntries.length > 0 &&
      projectedRadius < currentRadius + projectedMaxDepth * 0.38;
    const nearestAngularGap = findNearestAngularGap(entry.angle, currentEntries);
    const requiredAngularGap = computeRequiredAngularGap(projectedRadius, entry.spanEstimate);
    const exceedsDenseAngularBand =
      currentEntries.length > 0 &&
      nearestAngularGap < requiredAngularGap;

    lastLayeredPlacementTrace.push({
      fn: 'buildPlacementLayers',
      stage: 'evaluate-entry',
      placeKey: entry.group.placeKey,
      meta: {
        currentLayerSize: currentEntries.length,
        projectedSpan,
        projectedMaxDepth,
        projectedRadius,
        availableCircumference,
        nearestAngularGap,
        requiredAngularGap,
        exceedsCircumference,
        exceedsDepthBand,
        exceedsDenseAngularBand,
      },
    });

    if (exceedsCircumference || exceedsDepthBand || exceedsDenseAngularBand) {
      finalizeLayer(currentEntries);
      currentEntries = [entry];
      currentRadius = Math.max(
        nextMinRadius,
        Math.min(entry.sourceRadius, nextMinRadius + entry.radialDepth * 0.18),
      );
      lastLayeredPlacementTrace.push({
        fn: 'buildPlacementLayers',
        stage: 'start-new-layer',
        placeKey: entry.group.placeKey,
        meta: {
          nextMinRadius,
          currentRadius,
        },
      });
      continue;
    }

    currentEntries = projectedEntries;
    currentRadius = projectedRadius;
  }

  finalizeLayer(currentEntries);

  return layers;
}

function normalizeAngle(angle: number) {
  const fullTurn = Math.PI * 2;
  const normalized = angle % fullTurn;
  return normalized >= 0 ? normalized : normalized + fullTurn;
}

function buildLayerAngleCandidates(
  baseAngle: number,
  slotCount: number,
) {
  const normalizedBase = normalizeAngle(baseAngle);
  const step = (Math.PI * 2) / slotCount;
  const baseIndex = Math.round(normalizedBase / step) % slotCount;
  const indexes: number[] = [];

  for (let offset = 0; offset < slotCount && indexes.length < LAYER_SLOT_PROBE_LIMIT; offset++) {
    const leftIndex = (baseIndex - offset + slotCount) % slotCount;
    const rightIndex = (baseIndex + offset) % slotCount;
    if (offset === 0) {
      indexes.push(baseIndex);
      continue;
    }
    indexes.push(leftIndex);
    if (indexes.length < LAYER_SLOT_PROBE_LIMIT) {
      indexes.push(rightIndex);
    }
  }

  return indexes.map((index) => index * step);
}

function findPlacedNeighborsInSector(
  groups: PendingPlaceGroup[],
  state: PlacementState,
  currentGroupKey: string,
  sector: PlacementSector,
) {
  const neighbors: Array<{ angle: number; radius: number }> = [];
  for (const group of groups) {
    if (group.placeKey === currentGroupKey) continue;
    const placement = state.placementById.get(group.placeKey);
    if (!placement) continue;
    const angle = Math.atan2(placement.centerY, placement.centerX);
    if (!isAngleInsideArc(angle, sector.start, sector.end)) continue;
    neighbors.push({
      angle,
      radius: Math.hypot(placement.centerX, placement.centerY),
    });
  }
  return neighbors.sort((left, right) => left.angle - right.angle);
}

function computeNeighborAngleGaps(
  deps: LayeredDeps,
  targetAngle: number,
  neighborAngles: number[],
) {
  if (neighborAngles.length === 0) {
    return { leftGap: Math.PI, rightGap: Math.PI };
  }

  let leftGap = Math.PI;
  let rightGap = Math.PI;
  for (const neighborAngle of neighborAngles) {
    const delta = deps.angleDelta(targetAngle, neighborAngle);
    if (delta >= 0) {
      leftGap = Math.min(leftGap, delta);
    } else {
      rightGap = Math.min(rightGap, Math.abs(delta));
    }
  }

  return { leftGap, rightGap };
}

function computeAngularCenteringPenalty(
  deps: LayeredDeps,
  angle: number,
  preferredAngle: number,
  radius: number,
  sector: PlacementSector,
) {
  const sectorCenter = normalizeAngle(sector.start <= sector.end
    ? (sector.start + sector.end) * 0.5
    : normalizeAngle((sector.start + sector.end + Math.PI * 2) * 0.5));
  const sourceDrift = Math.abs(deps.angleDelta(angle, preferredAngle));
  const sectorDrift = Math.abs(deps.angleDelta(angle, sectorCenter));
  const combinedDrift = sourceDrift * 0.7 + sectorDrift * 0.3;
  return combinedDrift * (18 + radius * 0.012);
}

function computeOccupancyAlignmentPenalty(
  deps: LayeredDeps,
  candidate: PlacementFieldCandidate,
  preferredAngle: number,
) {
  const occupancyDrift = Math.abs(deps.angleDelta(candidate.occupancyCenter, preferredAngle));
  const widthPenalty = Math.abs(candidate.occupancyWidth - (candidate.occupancyEnd - candidate.occupancyStart)) * 40;
  const freeArcSlack = (candidate.freeArc.angleEnd - candidate.freeArc.angleStart) - candidate.occupancyWidth;
  const edgeHugPenalty = Math.max(0, 0.18 - freeArcSlack) * 120;
  return occupancyDrift * candidate.radius * 0.16 + widthPenalty + edgeHugPenalty;
}

function computeSectorBalancePenalty(
  deps: LayeredDeps,
  group: PendingPlaceGroup,
  angle: number,
  radius: number,
  sector: PlacementSector,
  groups: PendingPlaceGroup[],
  state: PlacementState,
) {
  const neighbors = findPlacedNeighborsInSector(groups, state, group.placeKey, sector);
  if (neighbors.length === 0) return 0;

  const neighborAngles = neighbors.map((neighbor) => neighbor.angle);
  const { leftGap, rightGap } = computeNeighborAngleGaps(deps, angle, neighborAngles);
  const balancePenalty = Math.abs(leftGap - rightGap) * radius * 0.42;
  const nearestGap = Math.min(leftGap, rightGap);
  const averageNeighborRadius = neighbors.reduce((sum, neighbor) => sum + neighbor.radius, 0) / neighbors.length;
  const desiredGap = Math.max(
    MIN_REQUIRED_ANGULAR_GAP,
    Math.min(MAX_REQUIRED_ANGULAR_GAP, estimateGroupSpan(group) / Math.max((radius + averageNeighborRadius) * 0.5, 1)),
  );
  const squeezePenalty = nearestGap < desiredGap
    ? (desiredGap - nearestGap) * radius * 0.8
    : 0;
  return balancePenalty + squeezePenalty;
}

function computeSectorOrderPenalty(
  deps: LayeredDeps,
  group: PendingPlaceGroup,
  angle: number,
  sector: PlacementSector,
  groups: PendingPlaceGroup[],
  state: PlacementState,
) {
  const sourceAngle = Math.atan2(group.logicalY, group.logicalX);
  let penalty = 0;

  for (const neighbor of groups) {
    if (neighbor.placeKey === group.placeKey) continue;
    const neighborPlacement = state.placementById.get(neighbor.placeKey);
    if (!neighborPlacement) continue;

    const neighborSourceAngle = Math.atan2(neighbor.logicalY, neighbor.logicalX);
    if (!isAngleInsideArc(neighborSourceAngle, sector.start, sector.end)) continue;

    const sourceDelta = deps.angleDelta(sourceAngle, neighborSourceAngle);
    if (Math.abs(sourceDelta) <= 1e-6) continue;

    const placedDelta = deps.angleDelta(angle, Math.atan2(neighborPlacement.centerY, neighborPlacement.centerX));
    if (Math.abs(placedDelta) <= 1e-6) {
      penalty += 240;
      continue;
    }

    const sourceSign = Math.sign(sourceDelta);
    const placedSign = Math.sign(placedDelta);
    if (sourceSign !== placedSign) {
      penalty += 680 + Math.abs(sourceDelta - placedDelta) * 120;
    }
  }

  return penalty;
}

function isAngleInsideArc(
  angle: number,
  start: number,
  end: number,
) {
  const normalized = normalizeAngle(angle);
  const normalizedStart = normalizeAngle(start);
  const normalizedEnd = normalizeAngle(end);
  return normalizedStart <= normalizedEnd
    ? normalized >= normalizedStart && normalized <= normalizedEnd
    : normalized >= normalizedStart || normalized <= normalizedEnd;
}

function splitArcSegments(start: number, end: number) {
  const normalizedStart = normalizeAngle(start);
  const normalizedEnd = normalizeAngle(end);
  if (normalizedStart <= normalizedEnd) {
    return [{ start: normalizedStart, end: normalizedEnd }];
  }
  return [
    { start: 0, end: normalizedEnd },
    { start: normalizedStart, end: Math.PI * 2 },
  ];
}

function sectorsOverlap(
  left: { start: number; end: number },
  right: { start: number; end: number },
) {
  const leftSegments = splitArcSegments(left.start, left.end);
  const rightSegments = splitArcSegments(right.start, right.end);
  return leftSegments.some((leftSegment) => (
    rightSegments.some((rightSegment) => (
      leftSegment.start <= rightSegment.end && rightSegment.start <= leftSegment.end
    ))
  ));
}

function estimateRequiredSpanAngleAtRadius(
  group: PendingPlaceGroup,
  radius: number,
) {
  return Math.max(Math.PI / 36, Math.min(Math.PI * 0.75, estimateGroupSpan(group) / Math.max(radius, 1)));
}

function buildBlockedBandsForEvaluation(
  state: PlacementState,
  lockedGroups: LockedPlaceGroup[],
  candidateGeometry: GroupGeometry,
) {
  const blockedBands: PolarBlockedBand[] = [];
  for (const geometry of state.geometryById.values()) {
    blockedBands.push(buildBlockedBandFromGeometry(geometry, FIELD_PADDING_RADIUS));
  }
  for (const locked of lockedGroups) {
    blockedBands.push(buildBlockedBandFromGeometry(locked.geometry, FIELD_PADDING_RADIUS));
  }
  blockedBands.push(buildBlockedBandFromGeometry(candidateGeometry, FIELD_PADDING_RADIUS));
  return blockedBands;
}

function computeEnclosurePenalty(
  group: PendingPlaceGroup,
  placement: FootprintPlacement,
  geometry: GroupGeometry,
  groups: PendingPlaceGroup[],
  state: PlacementState,
  lockedGroups: LockedPlaceGroup[],
) {
  const candidateBand = buildBlockedBandFromGeometry(geometry, FIELD_PADDING_RADIUS);
  const candidateSector = resolvePlacementSector(Math.atan2(placement.centerY, placement.centerX));
  const blockedBands = buildBlockedBandsForEvaluation(state, lockedGroups, geometry);
  let enclosurePenalty = 0;

  for (const futureGroup of groups) {
    if (futureGroup.placeKey === group.placeKey) continue;
    if (state.placementById.has(futureGroup.placeKey)) continue;

    const futureAngle = Math.atan2(futureGroup.logicalY, futureGroup.logicalX);
    const futureSector = resolvePlacementSector(futureAngle);
    if (!sectorsOverlap(candidateSector, futureSector)) continue;

    const baseRadius = Math.max(
      FIELD_IDEAL_RADIUS_FLOOR,
      Math.hypot(futureGroup.logicalX, futureGroup.logicalY),
    );
    const radiusStep = Math.max(18, baseRadius * 0.05);
    const requiredSpanBase = estimateRequiredSpanAngleAtRadius(futureGroup, baseRadius);
    const directlyCovered = isAngleInsideArc(futureAngle, candidateBand.angleStart - requiredSpanBase * 0.5, candidateBand.angleEnd + requiredSpanBase * 0.5);
    const impactWeight = directlyCovered ? 1.2 : 0.55;
    let bestFuturePenalty = Number.POSITIVE_INFINITY;

    for (let stepIndex = 0; stepIndex < 4; stepIndex++) {
      const radius = baseRadius + stepIndex * radiusStep;
      const requiredSpan = estimateRequiredSpanAngleAtRadius(futureGroup, radius);
      const freeArcs = computeFreeArcsAtRadius(
        blockedBands,
        radius,
        futureSector.start,
        futureSector.end,
      );
      const structureScore = scoreFreeArcStructure(freeArcs);
      const accessScore = scoreFreeArcAccess(freeArcs, futureAngle, requiredSpan);
      const candidatePenalty =
        accessScore.total +
        structureScore.total * 0.45 +
        stepIndex * 24;
      bestFuturePenalty = Math.min(bestFuturePenalty, candidatePenalty);
    }

    enclosurePenalty += bestFuturePenalty * impactWeight;
  }

  return enclosurePenalty;
}

export function evaluatePlacementAgainstState(
  deps: LayeredDeps,
  group: PendingPlaceGroup,
  placement: FootprintPlacement,
  groups: PendingPlaceGroup[],
  state: PlacementState,
  lockedGroups: LockedPlaceGroup[],
  safeGap: number,
  mapRect: LogicalRect,
  preferredAngle = Math.atan2(group.logicalY, group.logicalX),
  preferredRadius = Math.max(LAYER_RADIUS_BASE, Math.hypot(group.logicalX, group.logicalY)),
  minAngularGap = 0,
): EvaluatePlacementResult {
  const geometry = deps.chooseBestGeometryForPlacement(group, placement, mapRect);
  if (!deps.geometryFitsMap(geometry, mapRect)) {
    return { valid: false, score: Number.POSITIVE_INFINITY, geometry: null };
  }

  const line = deps.buildLine(group, geometry);
  const photoGap = deps.getPhotoGap(safeGap);
  const labelGap = deps.getLabelGap(safeGap);
  let spacingPenalty = 0;
  const angle = Math.atan2(placement.centerY, placement.centerX);
  const radius = Math.hypot(placement.centerX, placement.centerY);
  const sector = resolvePlacementSector(preferredAngle);

  for (const neighbor of groups) {
    if (neighbor.placeKey === group.placeKey) continue;
    const neighborPlacement = state.placementById.get(neighbor.placeKey);
    const neighborGeometry = state.geometryById.get(neighbor.placeKey);
    if (!neighborPlacement || !neighborGeometry) continue;

    if (hasGroupRectConflict(geometry, neighborGeometry, safeGap)) {
      return { valid: false, score: Number.POSITIVE_INFINITY, geometry: null };
    }

    const neighborLine = deps.buildLine(neighbor, neighborGeometry);
    if (deps.segmentsIntersect(line.start, line.end, neighborLine.start, neighborLine.end)) {
      return { valid: false, score: Number.POSITIVE_INFINITY, geometry: null };
    }

    const lineDistance = deps.segmentDistance(line.start, line.end, neighborLine.start, neighborLine.end);
    if (lineDistance < LINE_BUNDLE_DISTANCE) {
      spacingPenalty += (LINE_BUNDLE_DISTANCE - lineDistance) * 2.4;
    }

    const centerDistance = Math.hypot(
      placement.centerX - neighborPlacement.centerX,
      placement.centerY - neighborPlacement.centerY,
    );
    if (centerDistance < LOCAL_DENSITY_DISTANCE) {
      spacingPenalty += (LOCAL_DENSITY_DISTANCE - centerDistance) * 0.9;
    }

    if (minAngularGap > 0) {
      const neighborAngle = Math.atan2(neighborPlacement.centerY, neighborPlacement.centerX);
      const gap = Math.abs(deps.angleDelta(angle, neighborAngle));
      if (gap < minAngularGap) {
        spacingPenalty += (minAngularGap - gap) * radius * 0.12;
      }
    }

    spacingPenalty += computePlacementAngularGapPenalty(
      deps,
      angle,
      radius,
      estimateGroupSpan(group),
      neighborPlacement,
    );
  }

  for (const locked of lockedGroups) {
    if (hasGroupRectConflict(geometry, locked.geometry, safeGap)) {
      return { valid: false, score: Number.POSITIVE_INFINITY, geometry: null };
    }

    const lockedLine = deps.buildLine(locked, locked.geometry);
    if (deps.segmentsIntersect(line.start, line.end, lockedLine.start, lockedLine.end)) {
      return { valid: false, score: Number.POSITIVE_INFINITY, geometry: null };
    }

    const lineDistance = deps.segmentDistance(line.start, line.end, lockedLine.start, lockedLine.end);
    if (lineDistance < LINE_BUNDLE_DISTANCE) {
      spacingPenalty += (LINE_BUNDLE_DISTANCE - lineDistance) * 2.4;
    }
  }

  const driftPenalty = computeAngularCenteringPenalty(
    deps,
    angle,
    preferredAngle,
    radius,
    sector,
  );
  const radiusPenalty = Math.abs(radius - preferredRadius) * 0.24;
  const outwardPenalty = Math.max(0, radius - preferredRadius) * 0.28;
  const inwardPenalty = Math.max(0, preferredRadius - radius) * 0.42;
  const sectorBalancePenalty = computeSectorBalancePenalty(
    deps,
    group,
    angle,
    radius,
    sector,
    groups,
    state,
  );
  const sectorOrderPenalty = computeSectorOrderPenalty(
    deps,
    group,
    angle,
    sector,
    groups,
    state,
  );
  const enclosurePenalty = computeEnclosurePenalty(
    group,
    placement,
    geometry,
    groups,
    state,
    lockedGroups,
  );

  return {
    valid: true,
    score: driftPenalty + radiusPenalty + outwardPenalty + inwardPenalty + spacingPenalty + sectorBalancePenalty + sectorOrderPenalty + enclosurePenalty,
    geometry,
  };
}

export function placeGroupsLayerByLayer(
  deps: LayeredDeps,
  orderedGroups: PendingPlaceGroup[],
  layers: PlacementLayer[],
  mapRect: LogicalRect,
  safeGap: number,
  lockedGroups: LockedPlaceGroup[],
) {
  lastLayeredPlacementFailures = [];
  lastLayeredPlacementTrace.push({
    fn: 'placeGroupsLayerByLayer',
    stage: 'start',
    meta: {
      groupCount: orderedGroups.length,
      layerCount: layers.length,
    },
  });
  const state: PlacementState = {
    placementById: new Map<string, FootprintPlacement>(),
    geometryById: new Map<string, GroupGeometry>(),
    candidateIndexById: new Map<string, number>(),
  };
  const failures: LayeredPlacementFailure[] = [];
  const layerByKey = new Map<string, number>();
  layers.forEach((layer, index) => {
    layer.entries.forEach((entry) => {
      layerByKey.set(entry.group.placeKey, index);
    });
  });

  const orderedByLayer = [...orderedGroups].sort((left, right) => {
    const leftLayer = layerByKey.get(left.placeKey) ?? Number.MAX_SAFE_INTEGER;
    const rightLayer = layerByKey.get(right.placeKey) ?? Number.MAX_SAFE_INTEGER;
    if (leftLayer !== rightLayer) return leftLayer - rightLayer;
    return compareLayerPlacementOrder(left, right);
  });

  const buildBlockedBandsForState = (currentGroupKey: string) => {
    const blockedBands: PolarBlockedBand[] = [];
    for (const group of orderedByLayer) {
      if (group.placeKey === currentGroupKey) continue;
      const geometry = state.geometryById.get(group.placeKey);
      if (!geometry) continue;
      blockedBands.push(buildBlockedBandFromGeometry(geometry, FIELD_PADDING_RADIUS));
    }
    for (const locked of lockedGroups) {
      blockedBands.push(buildBlockedBandFromGeometry(locked.geometry, FIELD_PADDING_RADIUS));
    }
    return blockedBands;
  };

  const tryPlaceInLayer = (
    group: PendingPlaceGroup,
    layerIndex: number,
    preferredLayerIndex: number,
    failureRecord?: LayeredPlacementFailure,
  ) => {
    const layer = layers[layerIndex];
    if (!layer) return false;
    const baseAngle = Math.atan2(group.logicalY, group.logicalX);
    const layerRadius = layer.radius;
    const idealRadius = estimateGroupPreferredRadius(group);
    let best:
      | {
          placement: FootprintPlacement;
          geometry: GroupGeometry;
          score: number;
        }
      | null = null;

    const fieldSearch = findPlacementInField(
      group,
      group.collisionGeometry,
      buildBlockedBandsForState(group.placeKey),
      {
        idealAngle: baseAngle,
        idealRadius,
        minRadius: FIELD_IDEAL_RADIUS_FLOOR,
        radiusStep: Math.max(18, Math.min(64, estimateGroupDepth(group) * 0.45)),
        radiusScanLimit: 18,
      },
    );
    lastLayeredPlacementTrace.push({
      fn: 'findPlacementInField',
      stage: 'result',
      placeKey: group.placeKey,
      meta: {
        layerIndex,
        preferredLayerIndex,
        idealRadius,
        layerRadius,
        candidateCount: fieldSearch.candidates.length,
        scannedRadius: fieldSearch.scannedRadius,
        trace: fieldSearch.trace,
      },
    });
    const attemptedLayer = {
      layerIndex,
      fieldCandidateCount: fieldSearch.candidates.length,
      slotFallbackUsed: false,
      placed: false,
    };
    failureRecord?.attemptedLayers.push(attemptedLayer);

    if (fieldSearch.candidates.length > 0) {
      for (const fieldCandidate of fieldSearch.candidates) {
        const evaluation = evaluatePlacementAgainstState(
          deps,
          group,
          fieldCandidate.placement,
          orderedByLayer,
          state,
          lockedGroups,
          safeGap,
          mapRect,
          baseAngle,
          idealRadius,
          layer.minAngularGap,
        );
        if (!evaluation.valid || !evaluation.geometry) continue;
        const layerPenalty = Math.max(0, layer.index - preferredLayerIndex) * 120;
        const fieldRadiusPenalty = Math.max(0, fieldCandidate.radius - idealRadius) * 0.18;
        const occupancyPenalty = computeOccupancyAlignmentPenalty(
          deps,
          fieldCandidate,
          baseAngle,
        );
        const totalScore = evaluation.score + layerPenalty + fieldRadiusPenalty + occupancyPenalty;
        if (!best || totalScore < best.score) {
          best = {
            placement: fieldCandidate.placement,
            geometry: evaluation.geometry,
            score: totalScore,
          };
        }
      }
    }

    if (!best && fieldSearch.candidates.length === 0) {
      attemptedLayer.slotFallbackUsed = true;
      const angleCandidates = buildLayerAngleCandidates(baseAngle, layer.slotCount);
      for (const slotAngle of angleCandidates) {
        for (const angleOffset of LAYER_ANGLE_JITTER_DEGREES) {
          const angle = slotAngle + (angleOffset * Math.PI) / 180;
          for (const radiusFactor of FINAL_REFINE_RADIUS_FACTORS) {
            const placement = {
              centerX: Math.cos(angle) * layerRadius * radiusFactor,
              centerY: Math.sin(angle) * layerRadius * radiusFactor,
            };
            const evaluation = evaluatePlacementAgainstState(
              deps,
              group,
              placement,
              orderedByLayer,
              state,
              lockedGroups,
              safeGap,
              mapRect,
              baseAngle,
              layerRadius,
              layer.minAngularGap,
            );
            if (!evaluation.valid || !evaluation.geometry) continue;
            const layerPenalty = Math.max(0, layer.index - preferredLayerIndex) * 120;
            const totalScore = evaluation.score + layerPenalty;
            if (!best || totalScore < best.score) {
              best = {
                placement,
                geometry: evaluation.geometry,
                score: totalScore,
              };
            }
          }
        }
      }
    }

    if (!best && fieldSearch.candidates.length === 0) {
      attemptedLayer.slotFallbackUsed = true;
      for (const radiusFactor of FINAL_REFINE_RADIUS_FACTORS) {
        const placement = {
          centerX: Math.cos(baseAngle) * layerRadius * radiusFactor,
          centerY: Math.sin(baseAngle) * layerRadius * radiusFactor,
        };
        const evaluation = evaluatePlacementAgainstState(
          deps,
          group,
          placement,
          orderedByLayer,
          state,
          lockedGroups,
          safeGap,
          mapRect,
          baseAngle,
          layerRadius,
          layer.minAngularGap,
        );
        if (!evaluation.valid || !evaluation.geometry) continue;
        const layerPenalty = Math.max(0, layer.index - preferredLayerIndex) * 120;
        const totalScore = evaluation.score + layerPenalty;
        if (!best || totalScore < best.score) {
          best = {
            placement,
            geometry: evaluation.geometry,
            score: totalScore,
          };
        }
      }
    }

    if (!best) return false;
    attemptedLayer.placed = true;
    lastLayeredPlacementTrace.push({
      fn: 'placeGroupsLayerByLayer',
      stage: 'placed-in-layer',
      placeKey: group.placeKey,
      meta: {
        layerIndex,
        preferredLayerIndex,
        placement: best.placement,
        score: best.score,
      },
    });
    state.placementById.set(group.placeKey, best.placement);
    state.geometryById.set(group.placeKey, best.geometry);
    state.candidateIndexById.set(group.placeKey, 0);
    return true;
  };

  for (const group of orderedByLayer) {
    const preferredLayerIndex = layerByKey.get(group.placeKey) ?? 0;
    let placed = false;
    const failureRecord: LayeredPlacementFailure = {
      placeKey: group.placeKey,
      preferredLayerIndex,
      attemptedLayers: [],
    };
    for (let layerIndex = preferredLayerIndex; layerIndex < layers.length; layerIndex++) {
      if (tryPlaceInLayer(group, layerIndex, preferredLayerIndex, failureRecord)) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      failures.push(failureRecord);
      lastLayeredPlacementFailures = [...failures];
      lastLayeredPlacementTrace.push({
        fn: 'placeGroupsLayerByLayer',
        stage: 'group-failed',
        placeKey: group.placeKey,
        meta: {
          preferredLayerIndex,
          attemptedLayers: failureRecord.attemptedLayers,
        },
      });
      return null;
    }
  }

  lastLayeredPlacementFailures = [...failures];
  return state;
}

export function refineAnglesAndRadii(
  deps: LayeredDeps,
  groups: PendingPlaceGroup[],
  state: PlacementState,
  mapRect: LogicalRect,
  safeGap: number,
  lockedGroups: LockedPlaceGroup[],
) {
  for (const group of groups) {
    const currentPlacement = state.placementById.get(group.placeKey);
    if (!currentPlacement) continue;

    const baseAngle = Math.atan2(currentPlacement.centerY, currentPlacement.centerX);
    const baseRadius = Math.hypot(currentPlacement.centerX, currentPlacement.centerY);
    let bestPlacement = currentPlacement;
    let bestGeometry = state.geometryById.get(group.placeKey) ?? deps.chooseBestGeometryForPlacement(group, currentPlacement, mapRect);
    let bestScore = Number.POSITIVE_INFINITY;
    const viableCandidates: RefineCandidate[] = [];

    state.placementById.delete(group.placeKey);
    state.geometryById.delete(group.placeKey);

    for (const angleOffset of FINAL_REFINE_ANGLE_DEGREES) {
      const angle = baseAngle + (angleOffset * Math.PI) / 180;
      for (const radiusFactor of FINAL_REFINE_RADIUS_FACTORS) {
        const placement = {
          centerX: Math.cos(angle) * baseRadius * radiusFactor,
          centerY: Math.sin(angle) * baseRadius * radiusFactor,
        };
        const evaluation = evaluatePlacementAgainstState(
          deps,
          group,
          placement,
          groups,
          state,
          lockedGroups,
          safeGap,
          mapRect,
          baseAngle,
          baseRadius,
        );
        if (!evaluation.valid || !evaluation.geometry) continue;
        viableCandidates.push({
          placement,
          geometry: evaluation.geometry,
          score: evaluation.score,
        });
        if (evaluation.score < bestScore) {
          bestScore = evaluation.score;
          bestPlacement = placement;
          bestGeometry = evaluation.geometry;
        }
      }
    }
    lastLayeredPlacementTrace.push({
      fn: 'refineAnglesAndRadii',
      stage: 'group-refine',
      placeKey: group.placeKey,
      meta: {
        baseAngle,
        baseRadius,
        viableCandidateCount: viableCandidates.length,
        bestScore,
      },
    });

    if (groups.length >= 20 && viableCandidates.length > 1) {
      const narrowedCandidates = [...viableCandidates]
        .sort((left, right) => left.score - right.score)
        .slice(0, Math.min(3, viableCandidates.length));
      let bestCandidate = narrowedCandidates[0];
      let bestLineCrossings = Number.POSITIVE_INFINITY;
      for (const candidate of narrowedCandidates) {
        const lineCrossings = deps.countPlacementLineCrossings(
          groups,
          new Map(state.placementById).set(group.placeKey, candidate.placement),
        );
        if (
          lineCrossings < bestLineCrossings ||
          (lineCrossings === bestLineCrossings && candidate.score < bestCandidate.score)
        ) {
          bestLineCrossings = lineCrossings;
          bestCandidate = candidate;
        }
      }
      bestPlacement = bestCandidate.placement;
      bestGeometry = bestCandidate.geometry;
      bestScore = bestCandidate.score;
    }

    state.placementById.set(group.placeKey, bestPlacement);
    state.geometryById.set(group.placeKey, bestGeometry);
  }
}
