import type {
  FootprintPlacement,
  LockedPlaceGroup,
  LogicalRect,
  PendingPlaceGroup,
  SolverFunctionTraceEntry,
} from './footprintLayoutTypes';
import { hasBoundaryLabelXConflictAtMaxScale, type GroupGeometry } from './localMapGroupGeometry';
import { rectsOverlap } from './localMapGroupGeometry';
import { rectDistanceToMap } from './footprintLayoutConstraints';
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
import { propagateLayerAngles } from './footprintLayerAnglePropagation';

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

type PlacementWindowConstraint = {
  startAngle: number;
  endAngle: number;
  centerAngle: number;
  reservedSpan: number;
};

type LayerWindowConstraint = PlacementWindowConstraint & {
  placeKey: string;
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
  outwardPressure: number;
};

type LayerEntryCluster = {
  entries: LayeredGroupEntry[];
  angleStart: number;
  angleEnd: number;
  outwardLoadCount: number;
  spanEstimateSum: number;
  maxDepth: number;
  minSourceRadius: number;
  maxSourceRadius: number;
};

type GroupOutwardPressure = {
  placeKey: string;
  outwardCount: number;
  outwardArea: number;
  pressureScore: number;
};

type GroupEnclosurePressure = {
  placeKey: string;
  enclosureCount: number;
  enclosureWeight: number;
  sameLayerSpacingBoost: number;
  radiusBoost: number;
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
const SAME_LAYER_RADIUS_SPREAD_RELAX_FACTOR = 1.55;
const SAME_LAYER_ANGULAR_RELAX_FACTOR = 1.4;
const MAP_CLEARANCE_TARGET = 24;
const LAYER_OUTER_SHELL_BIAS = 0.72;

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
  return rectsOverlap(candidate.overallRect, neighbor.overallRect, Math.max(48, safeGap * 0.5));
}

function hasBoundaryConflict(
  group: PendingPlaceGroup,
  geometry: GroupGeometry,
  neighbor: Pick<PendingPlaceGroup, 'logicalX' | 'logicalY'>,
  neighborGeometry: GroupGeometry,
  mapRect: LogicalRect,
) {
  return hasBoundaryLabelXConflictAtMaxScale(
    { x: group.logicalX, y: group.logicalY },
    geometry,
    { x: neighbor.logicalX, y: neighbor.logicalY },
    neighborGeometry,
    mapRect,
  );
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

function estimateGroupOuterShellRadius(group: PendingPlaceGroup, mapRect: LogicalRect) {
  const preferredRadius = estimateGroupPreferredRadius(group);
  const safeRadius = Math.max(
    preferredRadius + MAP_CLEARANCE_TARGET,
    Math.max(Math.abs(mapRect.left), Math.abs(mapRect.right), Math.abs(mapRect.top), Math.abs(mapRect.bottom)) + MAP_CLEARANCE_TARGET,
  );
  return safeRadius;
}

function resolveLayerRadiusBand(
  layers: PlacementLayer[],
  layerIndex: number,
) {
  const layer = layers[layerIndex];
  if (!layer) {
    return {
      minRadius: FIELD_IDEAL_RADIUS_FLOOR,
      targetRadius: FIELD_IDEAL_RADIUS_FLOOR,
      maxRadius: FIELD_IDEAL_RADIUS_FLOOR,
    };
  }

  const prevLayer = layerIndex > 0 ? layers[layerIndex - 1] : null;
  const nextLayer = layerIndex < layers.length - 1 ? layers[layerIndex + 1] : null;
  const prevBoundary = prevLayer
    ? (prevLayer.radius + layer.radius) * 0.5
    : Math.max(FIELD_IDEAL_RADIUS_FLOOR, layer.radius - LAYER_RADIUS_BASE);
  const nextBoundary = nextLayer
    ? (layer.radius + nextLayer.radius) * 0.5
    : layer.radius + Math.max(LAYER_RADIUS_STEP, (layer.radius - prevBoundary) || LAYER_RADIUS_STEP);

  return {
    minRadius: Math.max(
      FIELD_IDEAL_RADIUS_FLOOR,
      prevBoundary,
      layer.radius * 0.68,
    ),
    targetRadius: Math.max(FIELD_IDEAL_RADIUS_FLOOR, layer.radius),
    maxRadius: Math.max(Math.max(FIELD_IDEAL_RADIUS_FLOOR, layer.radius), nextBoundary),
  };
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

function getAngularDelta(left: number, right: number) {
  const fullTurn = Math.PI * 2;
  let delta = normalizeAngle(left) - normalizeAngle(right);
  if (delta > Math.PI) delta -= fullTurn;
  if (delta < -Math.PI) delta += fullTurn;
  return delta;
}

function computeContinuousLayerAnchor(entries: LayeredGroupEntry[]) {
  if (entries.length === 0) return 0;

  let previousAngle = entries[0]!.angle;
  let angleSum = previousAngle;
  for (let index = 1; index < entries.length; index++) {
    let angle = entries[index]!.angle;
    while (angle < previousAngle) {
      angle += Math.PI * 2;
    }
    previousAngle = angle;
    angleSum += angle;
  }

  return angleSum / entries.length;
}

function countFutureEntriesWithinAngleWindow(
  entries: LayeredGroupEntry[],
  startIndex: number,
  targetAngle: number,
  windowAngle: number,
) {
  let count = 0;
  for (let index = startIndex + 1; index < entries.length; index++) {
    const delta = Math.abs(getAngularDelta(entries[index]!.angle, targetAngle));
    if (delta <= windowAngle) {
      count += 1;
    }
  }
  return count;
}

function countCurrentNeighborsWithinAngleWindow(
  entries: LayeredGroupEntry[],
  targetAngle: number,
  windowAngle: number,
) {
  let count = 0;
  for (const entry of entries) {
    const delta = Math.abs(getAngularDelta(entry.angle, targetAngle));
    if (delta <= windowAngle) {
      count += 1;
    }
  }
  return count;
}

function buildEntryClusters(
  entries: LayeredGroupEntry[],
  adaptiveRadiusBase: number,
) {
  const clusters: LayerEntryCluster[] = [];
  let currentCluster: LayeredGroupEntry[] = [];

  const finalizeCluster = (clusterEntries: LayeredGroupEntry[]) => {
    if (clusterEntries.length === 0) return;
    const angleStart = clusterEntries[0]!.angle;
    const angleEnd = clusterEntries[clusterEntries.length - 1]!.angle;
    const outwardLoadCount = clusterEntries.reduce((count, entry, index) => {
      return count + countFutureEntriesWithinAngleWindow(
        entries,
        entries.findIndex((candidate) => candidate.group.placeKey === entry.group.placeKey),
        entry.angle,
        Math.max(computeRequiredAngularGap(Math.max(adaptiveRadiusBase, entry.sourceRadius), entry.spanEstimate) * 2.8, Math.PI / 5),
      );
    }, 0);
    clusters.push({
      entries: clusterEntries,
      angleStart,
      angleEnd,
      outwardLoadCount,
      spanEstimateSum: clusterEntries.reduce((sum, entry) => sum + entry.spanEstimate, 0),
      maxDepth: clusterEntries.reduce((maxDepth, entry) => Math.max(maxDepth, entry.radialDepth), 0),
      minSourceRadius: clusterEntries.reduce((min, entry) => Math.min(min, entry.sourceRadius), Number.POSITIVE_INFINITY),
      maxSourceRadius: clusterEntries.reduce((max, entry) => Math.max(max, entry.sourceRadius), 0),
    });
  };

  for (const entry of entries) {
    if (currentCluster.length === 0) {
      currentCluster = [entry];
      continue;
    }

    const previous = currentCluster[currentCluster.length - 1]!;
    const averageRadius = currentCluster.reduce((sum, clusterEntry) => sum + clusterEntry.sourceRadius, 0) / currentCluster.length;
    const requiredGap = computeRequiredAngularGap(
      Math.max(adaptiveRadiusBase, averageRadius),
      Math.max(previous.spanEstimate, entry.spanEstimate),
    );
    const gap = Math.abs(getAngularDelta(entry.angle, previous.angle));
    const radiusSpread = Math.abs(entry.sourceRadius - averageRadius);
    const shouldStayInCluster =
      gap <= requiredGap * 2.6 &&
      radiusSpread <= Math.max(entry.radialDepth, previous.radialDepth) * 1.9;

    if (shouldStayInCluster) {
      currentCluster.push(entry);
      continue;
    }

    finalizeCluster(currentCluster);
    currentCluster = [entry];
  }

  finalizeCluster(currentCluster);
  return clusters;
}

function buildOutwardPressureByGroup(
  layers: PlacementLayer[],
) {
  const pressureByKey = new Map<string, GroupOutwardPressure>();
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    const layer = layers[layerIndex]!;
    for (const entry of layer.entries) {
      let outwardCount = 0;
      let outwardArea = 0;
      for (let outerIndex = layerIndex + 1; outerIndex < layers.length; outerIndex++) {
        const outerLayer = layers[outerIndex]!;
        for (const outerEntry of outerLayer.entries) {
          const angleGap = Math.abs(getAngularDelta(entry.angle, outerEntry.angle));
          const angleWindow = Math.max(layer.minAngularGap * 2.2, Math.PI / 6);
          if (angleGap > angleWindow) continue;
          outwardCount += 1;
          outwardArea += outerEntry.sizeScore;
        }
      }
      pressureByKey.set(entry.group.placeKey, {
        placeKey: entry.group.placeKey,
        outwardCount,
        outwardArea,
        pressureScore: outwardCount * 1.8 + outwardArea / 24000,
      });
    }
  }
  return pressureByKey;
}

function buildEnclosurePressureByGroup(
  layers: PlacementLayer[],
) {
  const pressureByKey = new Map<string, GroupEnclosurePressure>();
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    const layer = layers[layerIndex]!;
    for (const entry of layer.entries) {
      let enclosureCount = 0;
      let enclosureWeight = 0;
      const innerRequiredGap = computeRequiredAngularGap(
        Math.max(layer.radius, FIELD_IDEAL_RADIUS_FLOOR),
        entry.spanEstimate,
      );

      for (let outerIndex = layerIndex + 1; outerIndex < layers.length; outerIndex++) {
        const outerLayer = layers[outerIndex]!;
        const layerDistance = outerIndex - layerIndex;
        for (const outerEntry of outerLayer.entries) {
          const outerRequiredGap = computeRequiredAngularGap(
            Math.max(outerLayer.radius, FIELD_IDEAL_RADIUS_FLOOR),
            outerEntry.spanEstimate,
          );
          const coverageWindow = Math.max(
            innerRequiredGap * 2.4,
            outerRequiredGap * 1.1,
            Math.PI / 7,
          );
          const angleGap = Math.abs(getAngularDelta(entry.angle, outerEntry.angle));
          if (angleGap > coverageWindow) continue;
          enclosureCount += 1;
          enclosureWeight += 1 + outerEntry.sizeScore / 30000 + layerDistance * 0.35;
        }
      }

      pressureByKey.set(entry.group.placeKey, {
        placeKey: entry.group.placeKey,
        enclosureCount,
        enclosureWeight,
        sameLayerSpacingBoost: Math.min(0.65, enclosureWeight * 0.08),
        radiusBoost: Math.min(140, enclosureWeight * 14),
      });
    }
  }
  return pressureByKey;
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
    const preferredRadius = estimateGroupPreferredRadius(group);
    const outerShellRadius = estimateGroupOuterShellRadius(group, mapRect);
    return {
      group,
      sizeScore: scoreGroupSize(group),
      spanEstimate: estimateGroupSpan(group),
      radialDepth: estimateGroupDepth(group),
      angle: Math.atan2(group.logicalY, group.logicalX),
      sourceRadius: Math.max(
        adaptiveRadiusBase,
        Math.max(
          Math.hypot(placement.centerX, placement.centerY),
          preferredRadius * (1 - LAYER_OUTER_SHELL_BIAS) + outerShellRadius * LAYER_OUTER_SHELL_BIAS,
        ),
      ),
    };
  }).sort(compareLayeredEntryOrder);
  const clusters = buildEntryClusters(entries, adaptiveRadiusBase);

  const layers: PlacementLayer[] = [];
  let currentEntries: LayeredGroupEntry[] = [];
  let currentRadius = adaptiveRadiusBase;
  let nextMinRadius = adaptiveRadiusBase;

  const finalizeLayer = (layerEntries: LayeredGroupEntry[]) => {
    if (layerEntries.length === 0) return;
    const sortedEntries = [...layerEntries].sort(compareLayeredEntryOrder);
    const sourceRadius = sortedEntries.reduce((sum, entry) => sum + entry.sourceRadius, 0) / sortedEntries.length;
    const shellRadius = sortedEntries.reduce((maxRadius, entry) => Math.max(maxRadius, entry.sourceRadius), 0);
    const maxDepth = sortedEntries.reduce((maxDepth, entry) => Math.max(maxDepth, entry.radialDepth), 0);
    const slotCount = Math.max(LAYER_SLOT_MIN, sortedEntries.length * 2 + 2);
    const outwardPressure = sortedEntries.reduce((sum, entry) => sum + Math.max(0, entry.sourceRadius - sourceRadius), 0);
    const requiredAngularGap = sortedEntries.reduce((maxGap, entry) => (
      Math.max(maxGap, computeRequiredAngularGap(Math.max(currentRadius, shellRadius), entry.spanEstimate))
    ), 0);
    const layerRadius = Math.max(currentRadius, shellRadius);
    layers.push({
      index: layers.length,
      radius: layerRadius,
      slotCount,
      minAngularGap: Math.max(
        (Math.PI * 2 / slotCount) * 0.72,
        requiredAngularGap + Math.min(Math.PI / 14, outwardPressure / Math.max(shellRadius * 24, 1)),
      ),
      outwardPressure,
      entries: sortedEntries,
    });
    lastLayeredPlacementTrace.push({
      fn: 'buildPlacementLayers',
        stage: 'finalize-layer',
        meta: {
          layerIndex: layers.length - 1,
          radius: layerRadius,
          sourceRadius,
          shellRadius,
          maxDepth,
          slotCount,
          requiredAngularGap,
          placeKeys: sortedEntries.map((entry) => entry.group.placeKey),
        },
      });
    nextMinRadius = Math.max(
      nextMinRadius,
      layerRadius + maxDepth + adaptiveRadiusStep,
    );
  };

  for (const cluster of clusters) {
    const projectedEntries = [...currentEntries, ...cluster.entries];
    const projectedSpan = projectedEntries.reduce((sum, item) => sum + item.spanEstimate, 0);
    const projectedMaxDepth = projectedEntries.reduce((maxDepth, item) => Math.max(maxDepth, item.radialDepth), 0);
    const projectedRadius = Math.max(
      nextMinRadius,
      projectedEntries.reduce((sum, item) => sum + item.sourceRadius, 0) / projectedEntries.length,
    );
    const projectedShellRadius = projectedEntries.reduce((maxRadius, item) => Math.max(maxRadius, item.sourceRadius), 0);
    const sourceRadiusValues = projectedEntries.map((item) => item.sourceRadius);
    const minProjectedSourceRadius = Math.min(...sourceRadiusValues);
    const maxProjectedSourceRadius = Math.max(...sourceRadiusValues);
    const availableCircumference = Math.PI * 2 * Math.max(projectedShellRadius, adaptiveRadiusBase);
    const exceedsCircumference =
      currentEntries.length > 0 &&
      projectedSpan > availableCircumference * LAYER_FILL_RATIO;
    const exceedsDepthBand =
      currentEntries.length > 0 &&
      maxProjectedSourceRadius - minProjectedSourceRadius > projectedMaxDepth * SAME_LAYER_RADIUS_SPREAD_RELAX_FACTOR + adaptiveRadiusStep;
    const clusterCenterAngle = (cluster.angleStart + cluster.angleEnd) * 0.5;
    const nearestAngularGap = findNearestAngularGap(clusterCenterAngle, currentEntries);
    const requiredAngularGap = cluster.entries.reduce((maxGap, entry) => (
      Math.max(maxGap, computeRequiredAngularGap(projectedShellRadius, entry.spanEstimate))
    ), 0);
    const currentNeighborCount = countCurrentNeighborsWithinAngleWindow(
      currentEntries,
      clusterCenterAngle,
      Math.max(requiredAngularGap * 2.1, Math.PI / 7),
    );
    const outerLoadGapBoost = cluster.outwardLoadCount > 0
      ? Math.min(MAX_REQUIRED_ANGULAR_GAP * 0.7, cluster.outwardLoadCount * (requiredAngularGap * 0.16))
      : 0;
    const clusterSharingRelax = currentNeighborCount >= 2 ? requiredAngularGap * 0.42 : 0;
    const relaxedRequiredGap = Math.max(
      MIN_REQUIRED_ANGULAR_GAP * 0.9,
      requiredAngularGap * SAME_LAYER_ANGULAR_RELAX_FACTOR + outerLoadGapBoost - clusterSharingRelax,
    );
    const exceedsDenseAngularBand =
      currentEntries.length > 0 &&
      nearestAngularGap < relaxedRequiredGap;

    lastLayeredPlacementTrace.push({
      fn: 'buildPlacementLayers',
      stage: 'evaluate-entry',
      placeKey: cluster.entries[0]?.group.placeKey,
      meta: {
        clusterSize: cluster.entries.length,
        currentLayerSize: currentEntries.length,
        projectedSpan,
        projectedMaxDepth,
        projectedRadius,
        projectedShellRadius,
        minProjectedSourceRadius,
        maxProjectedSourceRadius,
        availableCircumference,
        nearestAngularGap,
        requiredAngularGap,
        relaxedRequiredGap,
        currentNeighborCount,
        futureNeighborCount: cluster.outwardLoadCount,
        outerLoadGapBoost,
        clusterSharingRelax,
        exceedsCircumference,
        exceedsDepthBand,
        exceedsDenseAngularBand,
      },
    });

    if (exceedsCircumference || exceedsDepthBand || exceedsDenseAngularBand) {
      finalizeLayer(currentEntries);
      currentEntries = [...cluster.entries];
      currentRadius = Math.max(
        nextMinRadius,
        Math.min(cluster.minSourceRadius, nextMinRadius + cluster.maxDepth * 0.18),
      );
      lastLayeredPlacementTrace.push({
        fn: 'buildPlacementLayers',
        stage: 'start-new-layer',
        placeKey: cluster.entries[0]?.group.placeKey,
        meta: {
          nextMinRadius,
          currentRadius,
          clusterSize: cluster.entries.length,
        },
      });
      continue;
    }

    currentEntries = projectedEntries;
    currentRadius = Math.max(projectedRadius, projectedShellRadius);
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

function sortAnglesByProximity(
  angles: number[],
  preferredAngle: number,
) {
  return [...angles].sort((left, right) => (
    Math.abs(getAngularDelta(left, preferredAngle)) - Math.abs(getAngularDelta(right, preferredAngle))
  ));
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

function distanceToArcBoundary(
  angle: number,
  start: number,
  end: number,
) {
  if (!isAngleInsideArc(angle, start, end)) {
    const toStart = Math.abs(getAngularDelta(angle, start));
    const toEnd = Math.abs(getAngularDelta(angle, end));
    return -Math.min(toStart, toEnd);
  }

  const toStart = Math.abs(getAngularDelta(angle, start));
  const toEnd = Math.abs(getAngularDelta(end, angle));
  return Math.min(toStart, toEnd);
}

function computeWindowConstraintPenalty(
  deps: LayeredDeps,
  angle: number,
  radius: number,
  window: PlacementWindowConstraint,
) {
  const outsideDistance = isAngleInsideArc(angle, window.startAngle, window.endAngle)
    ? 0
    : Math.min(
      Math.abs(getAngularDelta(angle, window.startAngle)),
      Math.abs(getAngularDelta(angle, window.endAngle)),
    );
  const outsidePenalty = outsideDistance * radius * 180;
  const centerDrift = Math.abs(deps.angleDelta(angle, window.centerAngle));
  const centerPenalty = centerDrift * radius * 0.22;
  const boundaryDistance = distanceToArcBoundary(angle, window.startAngle, window.endAngle);
  const desiredInnerMargin = Math.min(window.reservedSpan * 0.22, Math.PI / 18);
  const edgePenalty = boundaryDistance > 0 && boundaryDistance < desiredInnerMargin
    ? (desiredInnerMargin - boundaryDistance) * radius * 0.9
    : 0;

  return outsidePenalty + centerPenalty + edgePenalty;
}

function computeSameLayerWindowPenalty(
  deps: LayeredDeps,
  group: PendingPlaceGroup,
  angle: number,
  radius: number,
  state: PlacementState,
  groups: PendingPlaceGroup[],
  layerByKey: Map<string, number>,
  targetAngleByKey: Map<string, { angle: number; reservedSpan: number }>,
  enclosurePressureByKey?: Map<string, GroupEnclosurePressure>,
) {
  const layerIndex = layerByKey.get(group.placeKey);
  if (layerIndex == null) return 0;

  const ownTarget = targetAngleByKey.get(group.placeKey);
  if (!ownTarget) return 0;

  let penalty = 0;
  const ownBoost = enclosurePressureByKey?.get(group.placeKey)?.sameLayerSpacingBoost ?? 0;
  for (const neighbor of groups) {
    if (neighbor.placeKey === group.placeKey) continue;
    if (layerByKey.get(neighbor.placeKey) !== layerIndex) continue;

    const neighborPlacement = state.placementById.get(neighbor.placeKey);
    if (!neighborPlacement) continue;

    const neighborAngle = Math.atan2(neighborPlacement.centerY, neighborPlacement.centerX);
    const neighborTarget = targetAngleByKey.get(neighbor.placeKey);
    const targetDelta = ownTarget.angle - (neighborTarget?.angle ?? Math.atan2(neighbor.logicalY, neighbor.logicalX));
    const placedDelta = deps.angleDelta(angle, neighborAngle);
    if (targetDelta !== 0 && placedDelta !== 0 && Math.sign(targetDelta) !== Math.sign(placedDelta)) {
      penalty += radius * 220;
    }

    const neighborBoost = enclosurePressureByKey?.get(neighbor.placeKey)?.sameLayerSpacingBoost ?? 0;
    const reservedGap =
      ((ownTarget.reservedSpan + (neighborTarget?.reservedSpan ?? ownTarget.reservedSpan)) * 0.5) *
      0.76 *
      (1 + ownBoost + neighborBoost * 0.5);
    const actualGap = Math.abs(deps.angleDelta(angle, neighborAngle));
    if (actualGap < reservedGap) {
      penalty += (reservedGap - actualGap) * radius * 3.2;
    }
  }

  return penalty;
}

function buildLayerWindowConstraints(
  layers: PlacementLayer[],
  layerAnchorAngleByIndex: Map<number, number>,
  targetAngleByKey: Map<string, { angle: number; reservedSpan: number }>,
) {
  const windowsByKey = new Map<string, LayerWindowConstraint>();
  const branchMargin = Math.PI / 60;

  for (const layer of layers) {
    const layerAnchorAngle = layerAnchorAngleByIndex.get(layer.index);
    if (layerAnchorAngle == null || layer.entries.length === 0) continue;

    const orderedCenters = layer.entries.flatMap((entry) => {
      const target = targetAngleByKey.get(entry.group.placeKey);
      if (!target) return [];
      return [{
        placeKey: entry.group.placeKey,
        centerAngle: layerAnchorAngle + getAngularDelta(target.angle, layerAnchorAngle),
        reservedSpan: target.reservedSpan,
      }];
    });
    if (orderedCenters.length === 0) continue;

    let previousCenter = orderedCenters[0]!.centerAngle;
    const unwrappedCenters = orderedCenters.map((window, index) => {
      if (index === 0) {
        return window;
      }
      let centerAngle = window.centerAngle;
      while (centerAngle <= previousCenter) {
        centerAngle += Math.PI * 2;
      }
      previousCenter = centerAngle;
      return {
        ...window,
        centerAngle,
      };
    });

    const rawWindows = unwrappedCenters.map((window) => ({
      ...window,
      startAngle: window.centerAngle - window.reservedSpan * 0.5,
      endAngle: window.centerAngle + window.reservedSpan * 0.5,
    }));

    const minStart = Math.min(...rawWindows.map((window) => window.startAngle));
    const maxEnd = Math.max(...rawWindows.map((window) => window.endAngle));
    let shift = 0;
    if (maxEnd > Math.PI - branchMargin) {
      shift = maxEnd - (Math.PI - branchMargin);
    } else if (minStart < -Math.PI + branchMargin) {
      shift = minStart - (-Math.PI + branchMargin);
    }

    for (const window of rawWindows) {
      windowsByKey.set(window.placeKey, {
        placeKey: window.placeKey,
        centerAngle: window.centerAngle - shift,
        startAngle: window.startAngle - shift,
        endAngle: window.endAngle - shift,
        reservedSpan: window.reservedSpan,
      });
    }
  }

  return windowsByKey;
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
  windowConstraint?: PlacementWindowConstraint,
  sameLayerConstraint?: {
    layerByKey: Map<string, number>;
    targetAngleByKey: Map<string, { angle: number; reservedSpan: number }>;
    enclosurePressureByKey?: Map<string, GroupEnclosurePressure>;
  },
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

    if (
      deps.hasLabelCollisions(geometry, [neighborGeometry], safeGap) ||
      deps.hasPhotoAgainstLabelCollisions(geometry, [neighborGeometry], safeGap) ||
      deps.hasPhotoAgainstLabelCollisions(neighborGeometry, [geometry], safeGap)
    ) {
      return { valid: false, score: Number.POSITIVE_INFINITY, geometry: null };
    }

    if (hasGroupRectConflict(geometry, neighborGeometry, safeGap)) {
      spacingPenalty += 68_000;
      continue;
    }

    if (hasBoundaryConflict(group, geometry, neighbor, neighborGeometry, mapRect)) {
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
    if (
      deps.hasLabelCollisions(geometry, [locked.geometry], safeGap) ||
      deps.hasPhotoAgainstLabelCollisions(geometry, [locked.geometry], safeGap) ||
      deps.hasPhotoAgainstLabelCollisions(locked.geometry, [geometry], safeGap)
    ) {
      return { valid: false, score: Number.POSITIVE_INFINITY, geometry: null };
    }

    if (hasGroupRectConflict(geometry, locked.geometry, safeGap)) {
      return { valid: false, score: Number.POSITIVE_INFINITY, geometry: null };
    }

    if (hasBoundaryConflict(group, geometry, locked, locked.geometry, mapRect)) {
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
  const mapClearancePenalty = Math.max(
    0,
    MAP_CLEARANCE_TARGET - rectDistanceToMap(geometry.overallRect, mapRect),
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
  const windowPenalty = windowConstraint == null
    ? 0
    : computeWindowConstraintPenalty(deps, angle, radius, windowConstraint);
  const sameLayerWindowPenalty = sameLayerConstraint == null
    ? 0
    : computeSameLayerWindowPenalty(
      deps,
      group,
      angle,
      radius,
      state,
      groups,
      sameLayerConstraint.layerByKey,
      sameLayerConstraint.targetAngleByKey,
      sameLayerConstraint.enclosurePressureByKey,
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
    score:
      driftPenalty +
      mapClearancePenalty * mapClearancePenalty * 16 +
      radiusPenalty +
      outwardPenalty +
      inwardPenalty +
      spacingPenalty +
      sectorBalancePenalty +
      windowPenalty +
      sameLayerWindowPenalty +
      enclosurePenalty,
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
  const outwardPressureByKey = buildOutwardPressureByGroup(layers);
  const enclosurePressureByKey = buildEnclosurePressureByGroup(layers);
  const targetAngleByKey = propagateLayerAngles(
    layers.map((layer) => ({
      index: layer.index,
      minAngularGap: layer.minAngularGap,
      entries: layer.entries.map((entry) => ({
        placeKey: entry.group.placeKey,
        angle: entry.angle,
        sizeScore: entry.sizeScore,
      })),
    })),
  );
  const state: PlacementState = {
    placementById: new Map<string, FootprintPlacement>(),
    geometryById: new Map<string, GroupGeometry>(),
    candidateIndexById: new Map<string, number>(),
  };
  const failures: LayeredPlacementFailure[] = [];
  const layerByKey = new Map<string, number>();
  const layerAnchorAngleByIndex = new Map<number, number>();
  layers.forEach((layer, index) => {
    if (layer.entries.length > 0) {
      layerAnchorAngleByIndex.set(index, computeContinuousLayerAnchor(layer.entries));
    }
    layer.entries.forEach((entry) => {
      layerByKey.set(entry.group.placeKey, index);
    });
  });
  const layerWindowByKey = buildLayerWindowConstraints(
    layers,
    layerAnchorAngleByIndex,
    targetAngleByKey,
  );
  const orderedByLayer = [...orderedGroups].sort((left, right) => {
    const leftLayer = layerByKey.get(left.placeKey) ?? Number.MAX_SAFE_INTEGER;
    const rightLayer = layerByKey.get(right.placeKey) ?? Number.MAX_SAFE_INTEGER;
    if (leftLayer !== rightLayer) return leftLayer - rightLayer;
    const leftRadiusNeed = Math.hypot(left.logicalX, left.logicalY);
    const rightRadiusNeed = Math.hypot(right.logicalX, right.logicalY);
    if (Math.abs(rightRadiusNeed - leftRadiusNeed) > 1e-6) return rightRadiusNeed - leftRadiusNeed;
    const leftPressure = outwardPressureByKey.get(left.placeKey)?.pressureScore ?? 0;
    const rightPressure = outwardPressureByKey.get(right.placeKey)?.pressureScore ?? 0;
    if (Math.abs(leftPressure - rightPressure) > 1e-6) return rightPressure - leftPressure;
    return compareLayerPlacementOrder(left, right);
  });
  const groupsByLayer = new Map<number, PendingPlaceGroup[]>();
  for (const group of orderedByLayer) {
    const layerIndex = layerByKey.get(group.placeKey) ?? Number.MAX_SAFE_INTEGER;
    const bucket = groupsByLayer.get(layerIndex);
    if (bucket) {
      bucket.push(group);
    } else {
      groupsByLayer.set(layerIndex, [group]);
    }
  }

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
    const layerBand = resolveLayerRadiusBand(layers, layerIndex);
    const idealRadius = Math.max(
      estimateGroupPreferredRadius(group),
      Math.hypot(group.logicalX, group.logicalY) + 24,
    );
    const pressure = outwardPressureByKey.get(group.placeKey);
    const enclosurePressure = enclosurePressureByKey.get(group.placeKey);
    const propagatedTarget = targetAngleByKey.get(group.placeKey);
    const layerWindow = layerWindowByKey.get(group.placeKey);
    const propagatedAngle = layerWindow?.centerAngle ?? propagatedTarget?.angle;
    const layerAnchorAngle = layerAnchorAngleByIndex.get(layerIndex) ?? baseAngle;
    const preferredAngle = propagatedAngle == null
      ? baseAngle
      : layerAnchorAngle + getAngularDelta(propagatedAngle, layerAnchorAngle);
    let preferredRadius = Math.max(layerBand.targetRadius, idealRadius) + (enclosurePressure?.radiusBoost ?? 0);
    let probeGeometry = deps.chooseBestGeometryForPlacement(
      group,
      {
        centerX: Math.cos(preferredAngle) * preferredRadius,
        centerY: Math.sin(preferredAngle) * preferredRadius,
      },
      mapRect,
    );
    let probeCount = 0;
    const probeStep = Math.max(
      24,
      Math.max(
        group.collisionGeometry.groupRect.bottom - group.collisionGeometry.groupRect.top,
        group.collisionGeometry.groupRect.right - group.collisionGeometry.groupRect.left,
      ) * 0.18,
    );
    while (!deps.geometryFitsMap(probeGeometry, mapRect) && probeCount < 16) {
      preferredRadius += probeStep;
      probeGeometry = deps.chooseBestGeometryForPlacement(
        group,
        {
          centerX: Math.cos(preferredAngle) * preferredRadius,
          centerY: Math.sin(preferredAngle) * preferredRadius,
        },
        mapRect,
      );
      probeCount += 1;
    }
    const minSearchRadius = Math.max(layerBand.minRadius, preferredRadius);
    const maxSearchRadius = Math.max(
      layerBand.maxRadius,
      preferredRadius + Math.max(48, layerBand.targetRadius * 0.12) + (enclosurePressure?.radiusBoost ?? 0) * 0.8,
    );
    const reservedSpan = Math.max(
      layer.minAngularGap * 1.2,
      propagatedTarget?.reservedSpan ?? layer.minAngularGap * 1.9,
    ) * (1 + (enclosurePressure?.sameLayerSpacingBoost ?? 0));
    const preferredWindowStart = layerWindow != null
      ? layerWindow.startAngle
      : propagatedTarget == null
      ? preferredAngle - reservedSpan * 0.5
      : preferredAngle + getAngularDelta(propagatedTarget.startAngle, preferredAngle);
    const preferredWindowEnd = layerWindow != null
      ? layerWindow.endAngle
      : propagatedTarget == null
      ? preferredAngle + reservedSpan * 0.5
      : preferredAngle + getAngularDelta(propagatedTarget.endAngle, preferredAngle);
    const windowConstraint: PlacementWindowConstraint = {
      startAngle: preferredWindowStart,
      endAngle: preferredWindowEnd,
      centerAngle: preferredAngle,
      reservedSpan,
    };
    const sameLayerConstraint = {
      layerByKey,
      targetAngleByKey,
      enclosurePressureByKey,
    };
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
        idealAngle: preferredAngle,
        idealRadius: preferredRadius,
        minRadius: minSearchRadius,
        maxRadius: maxSearchRadius,
        radiusStep: Math.max(18, Math.min(
          (maxSearchRadius - minSearchRadius) / 6,
          preferredRadius * 0.045,
        )),
        radiusScanLimit: 12,
        sectorStart: preferredWindowStart,
        sectorEnd: preferredWindowEnd,
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
        layerRadius: preferredRadius,
        layerBand,
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
          preferredAngle,
          preferredRadius,
          layer.minAngularGap,
          windowConstraint,
          sameLayerConstraint,
        );
        if (!evaluation.valid || !evaluation.geometry) continue;
        const layerPenalty = Math.max(0, layer.index - preferredLayerIndex) * 120;
        const fieldRadiusPenalty = Math.abs(fieldCandidate.radius - preferredRadius) * 0.1;
        const occupancyPenalty = computeOccupancyAlignmentPenalty(
          deps,
          fieldCandidate,
          preferredAngle,
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

    if (!best) {
      attemptedLayer.slotFallbackUsed = true;
      const angleCandidates = fieldSearch.candidates.length > 0
        ? [
            preferredAngle,
            preferredAngle - reservedSpan * 0.28,
            preferredAngle + reservedSpan * 0.28,
            preferredAngle - reservedSpan * 0.5,
            preferredAngle + reservedSpan * 0.5,
          ]
        : buildLayerAngleCandidates(preferredAngle, layer.slotCount);
      const dedupedAngleCandidates = sortAnglesByProximity(Array.from(
        new Set(angleCandidates.map((angle) => angle.toFixed(6))),
        (value) => Number(value),
      ), preferredAngle);
      for (const slotAngle of dedupedAngleCandidates) {
        for (const angleOffset of LAYER_ANGLE_JITTER_DEGREES) {
          const angle = slotAngle + (angleOffset * Math.PI) / 180;
          for (const radiusFactor of FINAL_REFINE_RADIUS_FACTORS) {
            const placement = {
              centerX: Math.cos(angle) * preferredRadius * radiusFactor,
              centerY: Math.sin(angle) * preferredRadius * radiusFactor,
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
              preferredAngle,
              preferredRadius,
              layer.minAngularGap,
              windowConstraint,
              sameLayerConstraint,
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

    if (!best) {
      for (const radiusFactor of FINAL_REFINE_RADIUS_FACTORS) {
        const placement = {
          centerX: Math.cos(preferredAngle) * preferredRadius * radiusFactor,
          centerY: Math.sin(preferredAngle) * preferredRadius * radiusFactor,
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
          preferredAngle,
          preferredRadius,
          layer.minAngularGap,
          windowConstraint,
          sameLayerConstraint,
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
        pressure,
        enclosurePressure,
        preferredAngle,
        reservedSpan,
      },
    });
    state.placementById.set(group.placeKey, best.placement);
    state.geometryById.set(group.placeKey, best.geometry);
    state.candidateIndexById.set(group.placeKey, 0);
    return true;
  };

  for (let currentLayerIndex = 0; currentLayerIndex < layers.length; currentLayerIndex++) {
    const layerGroups = [...(groupsByLayer.get(currentLayerIndex) ?? [])];
    while (layerGroups.length > 0) {
      layerGroups.sort((left, right) => {
        const leftEnclosure = enclosurePressureByKey.get(left.placeKey)?.enclosureWeight ?? 0;
        const rightEnclosure = enclosurePressureByKey.get(right.placeKey)?.enclosureWeight ?? 0;
        if (Math.abs(leftEnclosure - rightEnclosure) > 1e-6) return rightEnclosure - leftEnclosure;
        const leftPressure = outwardPressureByKey.get(left.placeKey)?.pressureScore ?? 0;
        const rightPressure = outwardPressureByKey.get(right.placeKey)?.pressureScore ?? 0;
        if (Math.abs(leftPressure - rightPressure) > 1e-6) return rightPressure - leftPressure;
        return compareLayerPlacementOrder(left, right);
      });
      const group = layerGroups.shift()!;
      const preferredLayerIndex = layerByKey.get(group.placeKey) ?? currentLayerIndex;
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
