import type { GroupGeometry } from './localMapGroupGeometry';
import {
  rectsOverlap,
  resolveGroupGeometryDownward,
  shiftGroupGeometryDown,
  translateGroupGeometry,
} from './localMapGroupGeometry';
import type { FootprintPlacement, LogicalRect, PendingPlaceGroup } from './footprintLayoutTypes';
import {
  computeLateralOffsetFromRay,
  fitsLabelRectAroundMap,
  fitsPhotoRectAroundMap,
  hasGeometryPressureBetweenGroups,
  hasLabelCollisions,
  hasPhotoAgainstLabelCollisions,
  rectOverlapsOccupiedPhotos,
} from './footprintLayoutConstraints';
import {
  computeGroupPressureScore,
  computeLabelClearanceScore,
  computeSectorCrowdingScore,
} from './footprintLayoutScoring';
import { refineRadialPlacementsWithDeps } from './footprintLayoutRefiner';

const GROUP_SAFE_GAP = 11;
const LOCAL_SEARCH_ANGLE_STEPS = [0, -10, 10, -20, 20, -30, 30];
const LOCAL_SEARCH_RADIUS_FACTORS = [0, -0.35, 0.35];
const POST_LAYOUT_SEARCH_ANGLE_STEPS = [0, -6, 6, -12, 12, -18, 18];
const POST_LAYOUT_SEARCH_RADIUS_STEPS = [0, -440, -360, -280, -200, -140, -80];
const POST_LAYOUT_REFINE_PASSES = 2;
const GLOBAL_COMPACTION_PASSES = 6;
const CLUSTER_REARRANGE_PASSES = 2;
const NEIGHBOR_NUDGE_STEPS = [-24, -12, 12, 24];
const OUTER_CORNER_MIN_RADIUS = 2400;
const OUTER_CORNER_ANGLE_LIMIT = Math.PI / 6;
const RADIAL_SHRINK_STEPS = [560, 480, 400, 320, 240, 180, 120, 80, 40];
const SECTOR_SLOT_COUNT = 16;
const SPARSE_SECTOR_CANDIDATE_OFFSETS = [-3, -2, 2, 3];
const GLOBAL_DIRECTIONAL_RADIUS_STEPS = [320, 240, 180, 120, 80];
const GLOBAL_DIRECTIONAL_ANGLE_STEPS = [0, -4, 4, -8, 8];
const GLOBAL_FIELD_RADIUS_STEPS = [320, 240, 180, 120, 80];
const GLOBAL_FIELD_LATERAL_STEPS = [0, -60, 60, -120, 120];

type PlacementCandidate = {
  centerX: number;
  centerY: number;
};

function normalizeAngle(angle: number) {
  const tau = Math.PI * 2;
  const normalized = angle % tau;
  return normalized >= 0 ? normalized : normalized + tau;
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

function hasIntersectingLines(
  placementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
) {
  const links = groups
    .map((group) => {
      const placement = placementById.get(group.placeKey);
      if (!placement) return null;
      return {
        placeKey: group.placeKey,
        start: { x: group.logicalX, y: group.logicalY },
        end: { x: placement.centerX, y: placement.centerY },
      };
    })
    .filter((item): item is { placeKey: string; start: { x: number; y: number }; end: { x: number; y: number } } => item !== null);

  return links.some((left, leftIndex) => (
    links.some((right, rightIndex) => {
      if (leftIndex >= rightIndex) return false;
      if (left.placeKey === right.placeKey) return false;
      return segmentsIntersect(left.start, left.end, right.start, right.end);
    })
  ));
}

function getGroupArea(rect: LogicalRect) {
  return Math.max(1, (rect.right - rect.left) * (rect.bottom - rect.top));
}

function getShrinkAngleStepsByRadius(radius: number) {
  if (radius < 1500) return [0, -3, 3, -6, 6];
  if (radius < 2800) return [0, -4, 4, -8, 8];
  return [0, -6, 6, -10, 10];
}

function getAnglePenaltyWeightsByRadius(radius: number) {
  if (radius < 1500) return { current: 60, anchor: 22 };
  if (radius < 2800) return { current: 44, anchor: 18 };
  return { current: 32, anchor: 14 };
}

function getMovementPolicyByRadius(radius: number) {
  if (radius < 1500) {
    return {
      maxAngleDeviation: 42,
      maxLateralOffset: 640,
    };
  }
  if (radius < 2800) {
    return {
      maxAngleDeviation: 68,
      maxLateralOffset: 1200,
    };
  }
  return {
    maxAngleDeviation: 92,
    maxLateralOffset: 1800,
  };
}

function isWithinOuterCornerSector(
  anchorX: number,
  anchorY: number,
  centerX: number,
  centerY: number,
) {
  const targetAngle = Math.atan2(anchorY, anchorX);
  const candidateAngle = Math.atan2(centerY, centerX);
  return Math.abs(angleDelta(candidateAngle, targetAngle)) <= OUTER_CORNER_ANGLE_LIMIT;
}

function getSectorIndex(angle: number) {
  const normalized = normalizeAngle(angle);
  return Math.floor((normalized / (Math.PI * 2)) * SECTOR_SLOT_COUNT) % SECTOR_SLOT_COUNT;
}

function buildSectorOccupancy(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
) {
  const counts = Array.from({ length: SECTOR_SLOT_COUNT }, () => 0);
  for (const group of groups) {
    const placement = placementById.get(group.placeKey);
    if (!placement) continue;
    counts[getSectorIndex(Math.atan2(placement.centerY, placement.centerX))] += 1;
  }
  return counts;
}

function computeSectorDensityPenalty(occupancy: number[], sectorIndex: number) {
  const local = occupancy[sectorIndex] ?? 0;
  const left = occupancy[(sectorIndex - 1 + SECTOR_SLOT_COUNT) % SECTOR_SLOT_COUNT] ?? 0;
  const right = occupancy[(sectorIndex + 1) % SECTOR_SLOT_COUNT] ?? 0;
  const density = local * 1.2 + (left + right) * 0.55;
  return density * density;
}

function computeRadiusSpreadPenalty(placements: FootprintPlacement[]) {
  if (placements.length <= 1) return 0;
  const radii = placements.map((placement) => Math.hypot(placement.centerX, placement.centerY));
  const average = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
  return radii.reduce((sum, radius) => sum + Math.abs(radius - average), 0);
}

function computeInnerRingCrowdingPenalty(
  placement: FootprintPlacement,
  occupancy: number[],
  sectorIndex: number,
) {
  const radius = Math.hypot(placement.centerX, placement.centerY);
  if (radius >= 1700) return 0;
  const innerPressure = Math.max(0, 1700 - radius);
  const localDensity = occupancy[sectorIndex] ?? 0;
  return innerPressure * Math.max(0, localDensity - 1) * 0.22;
}

function buildSparseSectorCandidates(
  group: PendingPlaceGroup,
  placement: FootprintPlacement,
  occupancy: number[],
) {
  const radius = Math.hypot(placement.centerX, placement.centerY);
  const currentSector = getSectorIndex(Math.atan2(placement.centerY, placement.centerX));
  const baseline = occupancy[currentSector];
  const candidates: PlacementCandidate[] = [];

  for (const offset of SPARSE_SECTOR_CANDIDATE_OFFSETS) {
    const targetSector = (currentSector + offset + SECTOR_SLOT_COUNT) % SECTOR_SLOT_COUNT;
    if (occupancy[targetSector] > baseline - 1) continue;
    const targetAngle = ((targetSector + 0.5) / SECTOR_SLOT_COUNT) * Math.PI * 2;
    const targetRadius = Math.max(0, radius - 180);
    candidates.push({
      centerX: Math.cos(targetAngle) * targetRadius,
      centerY: Math.sin(targetAngle) * targetRadius,
    });
  }

  for (const inward of [360, 260, 180, 120]) {
    const targetRadius = Math.max(0, radius - inward);
    candidates.push({
      centerX: Math.cos(Math.atan2(placement.centerY, placement.centerX)) * targetRadius,
      centerY: Math.sin(Math.atan2(placement.centerY, placement.centerX)) * targetRadius,
    });
  }

  return candidates;
}

function dedupeCandidates(candidates: PlacementCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${Math.round(candidate.centerX)}:${Math.round(candidate.centerY)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function averageAngle(placements: FootprintPlacement[]) {
  const vector = placements.reduce((sum, placement) => ({
    x: sum.x + Math.cos(Math.atan2(placement.centerY, placement.centerX)),
    y: sum.y + Math.sin(Math.atan2(placement.centerY, placement.centerX)),
  }), { x: 0, y: 0 });
  return Math.atan2(vector.y, vector.x);
}

function evaluatePlacementCandidate(
  placeKey: string,
  geometry: GroupGeometry,
  centerX: number,
  centerY: number,
  occupiedGeometries: GroupGeometry[],
  mapRect: LogicalRect,
  safeGap: number,
  basePlacement: FootprintPlacement,
  currentPlacement: FootprintPlacement,
  placementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
) {
  const resolvedGeometry = resolveCandidateGeometryAgainstOccupied(geometry, occupiedGeometries);
  const baseAngle = Math.atan2(basePlacement.centerY, basePlacement.centerX);
  const currentAngle = Math.atan2(currentPlacement.centerY, currentPlacement.centerX);
  const radius = Math.hypot(centerX, centerY);
  const angle = Math.atan2(centerY, centerX);
  const angleDeltaFromBase = Math.abs(angleDelta(angle, baseAngle));
  const radiusDeltaFromBase = Math.abs(radius - Math.hypot(basePlacement.centerX, basePlacement.centerY));
  const lateralOffset = Math.abs(computeLateralOffsetFromRay(baseAngle, centerX, centerY));
  const policy = getMovementPolicyByRadius(Math.hypot(currentPlacement.centerX, currentPlacement.centerY));

  const photoMapInvalid = !fitsPhotoRectAroundMap(resolvedGeometry.photoRect, mapRect, safeGap);
  const labelMapInvalid = !fitsLabelRectAroundMap(resolvedGeometry.labelRect, mapRect, safeGap);
  const mapOverlap = photoMapInvalid || labelMapInvalid;
  const lineTrial = new Map(placementById);
  lineTrial.set(placeKey, { centerX: resolvedGeometry.photoCenterX, centerY: resolvedGeometry.photoCenterY });
  const lineIntersected = hasIntersectingLines(lineTrial, groups);
  const labelOverlap = hasLabelCollisions(resolvedGeometry, occupiedGeometries, safeGap);
  const photoOverlap = rectOverlapsOccupiedPhotos(resolvedGeometry.photoRect, occupiedGeometries, safeGap);
  const photoLabelOverlap = hasPhotoAgainstLabelCollisions(resolvedGeometry, occupiedGeometries, safeGap);
  const angleExceeded = (angleDeltaFromBase * 180) / Math.PI > policy.maxAngleDeviation + 1e-6;
  const lateralExceeded = lateralOffset > policy.maxLateralOffset + 1e-6;
  const isValid = !mapOverlap && !lineIntersected && !labelOverlap && !photoOverlap && !photoLabelOverlap;
  const pressureScore = computeGroupPressureScore(resolvedGeometry, occupiedGeometries, safeGap);
  const labelClearanceScore = computeLabelClearanceScore(resolvedGeometry, occupiedGeometries, mapRect, safeGap);
  const sectorCrowdingScore = computeSectorCrowdingScore(
    placeKey,
    resolvedGeometry.photoCenterX,
    resolvedGeometry.photoCenterY,
    lineTrial,
    angleDelta,
  );

  return {
    isValid,
    geometry: resolvedGeometry,
    collisionScore: pressureScore,
    pressureScore,
    labelClearanceScore,
    sectorCrowdingScore,
    lineLengthScore: radius,
    mapOverlap,
    labelOverlap,
    angleDelta: angleDeltaFromBase,
    radiusDelta: radiusDeltaFromBase,
    lateralOffset,
    photoOverlap,
    photoLabelOverlap,
    angleExceeded,
    lateralExceeded,
    currentAngleDelta: Math.abs(angleDelta(angle, currentAngle)),
  };
}

function scoreCandidateCenter(
  placeKey: string,
  baseGeometry: GroupGeometry,
  centerX: number,
  centerY: number,
  occupiedGeometries: GroupGeometry[],
  mapRect: LogicalRect,
  safeGap: number,
  originAngle: number,
  originRadius: number,
  placementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
) {
  const candidate = translateGroupGeometry(baseGeometry, centerX, centerY);
  const candidateMeta = evaluatePlacementCandidate(
    placeKey,
    candidate,
    centerX,
    centerY,
    occupiedGeometries,
    mapRect,
    safeGap,
    { centerX: Math.cos(originAngle) * originRadius, centerY: Math.sin(originAngle) * originRadius },
    { centerX: Math.cos(originAngle) * originRadius, centerY: Math.sin(originAngle) * originRadius },
    placementById,
    groups,
  );
  if (!candidateMeta.isValid) {
    return { geometry: candidate, score: Number.POSITIVE_INFINITY, collisionScore: candidateMeta.collisionScore };
  }
  const radius = Math.hypot(candidateMeta.geometry.photoCenterX, candidateMeta.geometry.photoCenterY);
  return {
    geometry: candidateMeta.geometry,
    score:
      radius * 0.42 +
      candidateMeta.radiusDelta * 0.28 +
      candidateMeta.sectorCrowdingScore * 1.05 +
      candidateMeta.labelClearanceScore * 1 +
      candidateMeta.pressureScore * 0.72 +
      candidateMeta.angleDelta * 10 +
      candidateMeta.lateralOffset * 0.04 +
      (candidateMeta.angleExceeded ? 180 : 0) +
      (candidateMeta.lateralExceeded ? 120 : 0),
    collisionScore: candidateMeta.pressureScore,
  };
}

export function findBestLocalGroupCenter(
  placeKey: string,
  baseGeometry: GroupGeometry,
  logicalX: number,
  logicalY: number,
  occupiedGeometries: GroupGeometry[],
  mapRect: LogicalRect,
  safeGap: number,
  originAngle: number,
  originRadius: number,
  placementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
) {
  let best = scoreCandidateCenter(
    placeKey,
    baseGeometry,
    Math.cos(originAngle) * originRadius,
    Math.sin(originAngle) * originRadius,
    occupiedGeometries,
    mapRect,
    safeGap,
    originAngle,
    originRadius,
    placementById,
    groups,
  );
  const step = Math.min(96, Math.max(24, Math.sqrt(getGroupArea(baseGeometry.photoRect)) * 0.1));

  for (const angleOffset of LOCAL_SEARCH_ANGLE_STEPS) {
    const angle = originAngle + (angleOffset * Math.PI) / 180;
    for (const radiusFactor of LOCAL_SEARCH_RADIUS_FACTORS) {
      const radius = Math.max(0, originRadius + step * radiusFactor);
      const centerX = Math.cos(angle) * radius;
      const centerY = Math.sin(angle) * radius;
      const candidate = scoreCandidateCenter(
        placeKey,
        baseGeometry,
        centerX,
        centerY,
        occupiedGeometries,
        mapRect,
        safeGap,
        originAngle,
        originRadius,
        placementById,
        groups,
      );
      if (candidate.score < best.score) {
        best = candidate;
      }
    }
  }

  return {
    centerX: best.geometry.photoCenterX,
    centerY: best.geometry.photoCenterY,
    geometry: best.geometry,
    score: best.score,
  };
}

function scoreCandidateAroundCurrentCenter(
  placeKey: string,
  baseGeometry: GroupGeometry,
  centerX: number,
  centerY: number,
  logicalX: number,
  logicalY: number,
  occupiedGeometries: GroupGeometry[],
  mapRect: LogicalRect,
  safeGap: number,
  anchorAngle: number,
  anchorRadius: number,
  currentAngle: number,
  currentRadius: number,
  placementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
) {
  const candidate = translateGroupGeometry(baseGeometry, centerX, centerY);
  if (
    anchorRadius >= OUTER_CORNER_MIN_RADIUS &&
    !isWithinOuterCornerSector(logicalX, logicalY, centerX, centerY)
  ) {
    return { geometry: candidate, score: Number.POSITIVE_INFINITY, collisionScore: Number.POSITIVE_INFINITY };
  }
  const candidateMeta = evaluatePlacementCandidate(
    placeKey,
    candidate,
    centerX,
    centerY,
    occupiedGeometries,
    mapRect,
    safeGap,
    { centerX: Math.cos(anchorAngle) * anchorRadius, centerY: Math.sin(anchorAngle) * anchorRadius },
    { centerX: Math.cos(currentAngle) * currentRadius, centerY: Math.sin(currentAngle) * currentRadius },
    placementById,
    groups,
  );
  if (!candidateMeta.isValid) {
    return { geometry: candidate, score: Number.POSITIVE_INFINITY, collisionScore: candidateMeta.collisionScore };
  }
  const angleWeights = getAnglePenaltyWeightsByRadius(currentRadius);
  return {
    geometry: candidateMeta.geometry,
    score:
      candidateMeta.lineLengthScore * 0.54 +
      candidateMeta.radiusDelta * 0.34 +
      candidateMeta.sectorCrowdingScore * 1.15 +
      candidateMeta.labelClearanceScore * 1.16 +
      candidateMeta.pressureScore * 0.84 +
      candidateMeta.angleDelta * angleWeights.anchor * 0.46 +
      candidateMeta.lateralOffset * 0.05 +
      candidateMeta.currentAngleDelta * angleWeights.current * 0.36 +
      (candidateMeta.angleExceeded ? 260 : 0) +
      (candidateMeta.lateralExceeded ? 180 : 0),
    collisionScore: candidateMeta.pressureScore,
  };
}

function findFeasibleRadiusBracketOnBaseRay(
  group: PendingPlaceGroup,
  currentPlacement: FootprintPlacement,
  basePlacement: FootprintPlacement,
  occupiedGeometries: GroupGeometry[],
  mapRect: LogicalRect,
  safeGap: number,
  placementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
) {
  const currentRadius = Math.hypot(currentPlacement.centerX, currentPlacement.centerY);
  const currentAngle = Math.atan2(currentPlacement.centerY, currentPlacement.centerX);
  const baseRadius = Math.hypot(basePlacement.centerX, basePlacement.centerY);
  const baseAngle = Math.atan2(basePlacement.centerY, basePlacement.centerX);
  let bestFeasibleRadius: number | null = null;
  let nearestInfeasibleRadiusInside: number | null = null;

  for (const step of [...RADIAL_SHRINK_STEPS].reverse()) {
    const radius = Math.max(0, currentRadius - step);
    const centerX = Math.cos(baseAngle) * radius;
    const centerY = Math.sin(baseAngle) * radius;
    const candidate = scoreCandidateAroundCurrentCenter(
      group.placeKey,
      group.collisionGeometry,
      centerX,
      centerY,
      group.logicalX,
      group.logicalY,
      occupiedGeometries,
      mapRect,
      safeGap,
      baseAngle,
      baseRadius,
      currentAngle,
      currentRadius,
      placementById,
      groups,
    );
    if (Number.isFinite(candidate.score)) {
      bestFeasibleRadius = radius;
      continue;
    }
    if (bestFeasibleRadius !== null) {
      nearestInfeasibleRadiusInside = radius;
      break;
    }
  }

  if (bestFeasibleRadius === null) return null;
  return {
    feasibleRadius: bestFeasibleRadius,
    infeasibleRadius: nearestInfeasibleRadiusInside ?? 0,
    baseAngle,
    baseRadius,
    currentAngle,
    currentRadius,
  };
}

function refineFeasibleRadiusInterval(
  group: PendingPlaceGroup,
  bracket: {
    feasibleRadius: number;
    infeasibleRadius: number;
    baseAngle: number;
    baseRadius: number;
    currentAngle: number;
    currentRadius: number;
  },
  occupiedGeometries: GroupGeometry[],
  mapRect: LogicalRect,
  safeGap: number,
  placementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
) {
  let outer = bracket.feasibleRadius;
  let inner = bracket.infeasibleRadius;
  let best = scoreCandidateAroundCurrentCenter(
    group.placeKey,
    group.collisionGeometry,
    Math.cos(bracket.baseAngle) * outer,
    Math.sin(bracket.baseAngle) * outer,
    group.logicalX,
    group.logicalY,
    occupiedGeometries,
    mapRect,
    safeGap,
    bracket.baseAngle,
    bracket.baseRadius,
    bracket.currentAngle,
    bracket.currentRadius,
    placementById,
    groups,
  );

  for (let iteration = 0; iteration < 8; iteration++) {
    if (outer - inner <= 4) break;
    const radius = (outer + inner) / 2;
    const candidate = scoreCandidateAroundCurrentCenter(
      group.placeKey,
      group.collisionGeometry,
      Math.cos(bracket.baseAngle) * radius,
      Math.sin(bracket.baseAngle) * radius,
      group.logicalX,
      group.logicalY,
      occupiedGeometries,
      mapRect,
      safeGap,
      bracket.baseAngle,
      bracket.baseRadius,
      bracket.currentAngle,
      bracket.currentRadius,
      placementById,
      groups,
    );
    if (Number.isFinite(candidate.score)) {
      outer = radius;
      best = candidate;
    } else {
      inner = radius;
    }
  }

  if (!Number.isFinite(best.score)) return null;
  return {
    centerX: best.geometry.photoCenterX,
    centerY: best.geometry.photoCenterY,
    geometry: best.geometry,
    score: best.score,
  };
}

function findMinimalFeasibleRadiusWithMinorAngleAdjust(
  group: PendingPlaceGroup,
  currentPlacement: FootprintPlacement,
  basePlacement: FootprintPlacement,
  occupiedGeometries: GroupGeometry[],
  mapRect: LogicalRect,
  safeGap: number,
  placementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
) {
  const currentRadius = Math.hypot(currentPlacement.centerX, currentPlacement.centerY);
  const currentAngle = Math.atan2(currentPlacement.centerY, currentPlacement.centerX);
  const baseRadius = Math.hypot(basePlacement.centerX, basePlacement.centerY);
  const baseAngle = Math.atan2(basePlacement.centerY, basePlacement.centerX);
  const angleSteps = getShrinkAngleStepsByRadius(currentRadius).filter((step) => step !== 0);
  let best: null | {
    centerX: number;
    centerY: number;
    geometry: GroupGeometry;
    score: number;
    radius: number;
    angleOffsetAbs: number;
  } = null;

  for (const step of [...RADIAL_SHRINK_STEPS].reverse()) {
    const radius = Math.max(0, currentRadius - step);
    for (const angleOffset of angleSteps) {
      const angle = baseAngle + (angleOffset * Math.PI) / 180;
      const centerX = Math.cos(angle) * radius;
      const centerY = Math.sin(angle) * radius;
      const candidate = scoreCandidateAroundCurrentCenter(
        group.placeKey,
        group.collisionGeometry,
        centerX,
        centerY,
        group.logicalX,
        group.logicalY,
        occupiedGeometries,
        mapRect,
        safeGap,
        baseAngle,
        baseRadius,
        currentAngle,
        currentRadius,
        placementById,
        groups,
      );
      if (!Number.isFinite(candidate.score)) continue;
      const next = {
        centerX: candidate.geometry.photoCenterX,
        centerY: candidate.geometry.photoCenterY,
        geometry: candidate.geometry,
        score: candidate.score,
        radius,
        angleOffsetAbs: Math.abs(angleOffset),
      };
      if (
        !best ||
        next.radius < best.radius - 1e-6 ||
        (
          Math.abs(next.radius - best.radius) <= 1e-6 &&
          (
            next.score < best.score - 1e-6 ||
            (
              Math.abs(next.score - best.score) <= 1e-6 &&
              next.angleOffsetAbs < best.angleOffsetAbs
            )
          )
        )
      ) {
        best = next;
      }
    }
  }

  return best;
}

function refineFeasibleRadiusLocally(
  group: PendingPlaceGroup,
  currentPlacement: FootprintPlacement,
  basePlacement: FootprintPlacement,
  seedCandidate: { centerX: number; centerY: number; geometry: GroupGeometry; score: number },
  occupiedGeometries: GroupGeometry[],
  mapRect: LogicalRect,
  safeGap: number,
  placementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
) {
  const currentRadius = Math.hypot(currentPlacement.centerX, currentPlacement.centerY);
  const currentAngle = Math.atan2(currentPlacement.centerY, currentPlacement.centerX);
  const baseRadius = Math.hypot(basePlacement.centerX, basePlacement.centerY);
  const baseAngle = Math.atan2(basePlacement.centerY, basePlacement.centerX);
  let best = seedCandidate;
  const localRadiusSteps = [0, -40, -24, -12];
  const localAngleSteps = [0, -2, 2, -4, 4];

  for (const radiusStep of localRadiusSteps) {
    const radius = Math.max(0, Math.hypot(seedCandidate.centerX, seedCandidate.centerY) + radiusStep);
    for (const angleStep of localAngleSteps) {
      const angle = Math.atan2(seedCandidate.centerY, seedCandidate.centerX) + (angleStep * Math.PI) / 180;
      const centerX = Math.cos(angle) * radius;
      const centerY = Math.sin(angle) * radius;
      const candidate = scoreCandidateAroundCurrentCenter(
        group.placeKey,
        group.collisionGeometry,
        centerX,
        centerY,
        group.logicalX,
        group.logicalY,
        occupiedGeometries,
        mapRect,
        safeGap,
        baseAngle,
        baseRadius,
        currentAngle,
        currentRadius,
        placementById,
        groups,
      );
      if (!Number.isFinite(candidate.score)) continue;
      const candidateRadius = Math.hypot(candidate.geometry.photoCenterX, candidate.geometry.photoCenterY);
      const bestRadius = Math.hypot(best.centerX, best.centerY);
      if (
        candidateRadius < bestRadius - 2 ||
        (
          Math.abs(candidateRadius - bestRadius) <= 2 &&
          candidate.score < best.score - 1e-6
        )
      ) {
        best = {
          centerX: candidate.geometry.photoCenterX,
          centerY: candidate.geometry.photoCenterY,
          geometry: candidate.geometry,
          score: candidate.score,
        };
      }
    }
  }

  return best;
}

function findMinimalFeasibleRadius(
  group: PendingPlaceGroup,
  currentPlacement: FootprintPlacement,
  basePlacement: FootprintPlacement,
  occupiedGeometries: GroupGeometry[],
  mapRect: LogicalRect,
  safeGap: number,
  placementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
) {
  const fallback = scoreCandidateAroundCurrentCenter(
    group.placeKey,
    group.collisionGeometry,
    currentPlacement.centerX,
    currentPlacement.centerY,
    group.logicalX,
    group.logicalY,
    occupiedGeometries,
    mapRect,
    safeGap,
    Math.atan2(basePlacement.centerY, basePlacement.centerX),
    Math.hypot(basePlacement.centerX, basePlacement.centerY),
    Math.atan2(currentPlacement.centerY, currentPlacement.centerX),
    Math.hypot(currentPlacement.centerX, currentPlacement.centerY),
    placementById,
    groups,
  );
  const bracket = findFeasibleRadiusBracketOnBaseRay(
    group,
    currentPlacement,
    basePlacement,
    occupiedGeometries,
    mapRect,
    safeGap,
    placementById,
    groups,
  );
  if (bracket) {
    const onBaseRay = refineFeasibleRadiusInterval(
      group,
      bracket,
      occupiedGeometries,
      mapRect,
      safeGap,
      placementById,
      groups,
    );
    if (onBaseRay) {
      return refineFeasibleRadiusLocally(
        group,
        currentPlacement,
        basePlacement,
        onBaseRay,
        occupiedGeometries,
        mapRect,
        safeGap,
        placementById,
        groups,
      );
    }
  }

  const withAngleAdjust = findMinimalFeasibleRadiusWithMinorAngleAdjust(
    group,
    currentPlacement,
    basePlacement,
    occupiedGeometries,
    mapRect,
    safeGap,
    placementById,
    groups,
  );
  if (withAngleAdjust) {
    return refineFeasibleRadiusLocally(
      group,
      currentPlacement,
      basePlacement,
      withAngleAdjust,
      occupiedGeometries,
      mapRect,
      safeGap,
      placementById,
      groups,
    );
  }

  return {
    centerX: currentPlacement.centerX,
    centerY: currentPlacement.centerY,
    geometry: fallback.geometry,
    score: fallback.score,
  };
}

function buildRadialRefineOrder(groups: PendingPlaceGroup[]) {
  return [...groups].sort((left, right) => {
    const leftRadius = Math.hypot(left.logicalX, left.logicalY);
    const rightRadius = Math.hypot(right.logicalX, right.logicalY);
    if (Math.abs(rightRadius - leftRadius) > 1e-6) return rightRadius - leftRadius;
    const leftArea = getGroupArea(left.collisionGeometry.photoRect);
    const rightArea = getGroupArea(right.collisionGeometry.photoRect);
    if (Math.abs(rightArea - leftArea) > 1e-6) return rightArea - leftArea;
    return left.placeKey.localeCompare(right.placeKey, 'zh-CN');
  });
}

function buildOccupiedGeometriesForGroup(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  excludePlaceKey: string,
) {
  const entries = groups
    .filter((candidate) => candidate.placeKey !== excludePlaceKey)
    .map((candidate) => {
      const placement = placementById.get(candidate.placeKey);
      if (!placement) return null;
      return {
        id: candidate.placeKey,
        geometry: translateGroupGeometry(candidate.collisionGeometry, placement.centerX, placement.centerY),
      };
    })
    .filter((candidate): candidate is { id: string; geometry: GroupGeometry } => candidate !== null);

  const resolved = resolveGroupGeometryDownward(entries, { gap: 10, step: 6, maxOffset: 72 });
  return entries
    .map((entry) => resolved.get(entry.id) ?? entry.geometry);
}

function resolveCandidateGeometryAgainstOccupied(
  geometry: GroupGeometry,
  occupiedGeometries: GroupGeometry[],
) {
  for (let offset = 0; offset <= 108; offset += 6) {
    const candidate = offset === 0 ? geometry : shiftGroupGeometryDown(geometry, offset);
    if (occupiedGeometries.some((occupied) => (
      rectsOverlap(candidate.groupRect, occupied.groupRect, 10) ||
      rectsOverlap(candidate.labelRect, occupied.photoRect, 14) ||
      rectsOverlap(candidate.photoRect, occupied.labelRect, 14) ||
      rectsOverlap(candidate.labelRect, occupied.labelRect, 12)
    ))) {
      continue;
    }
    return candidate;
  }
  return geometry;
}

function buildDirectionalCompactionCandidates(
  group: PendingPlaceGroup,
  currentPlacement: FootprintPlacement,
) {
  const currentRadius = Math.hypot(currentPlacement.centerX, currentPlacement.centerY);
  const currentAngle = Math.atan2(currentPlacement.centerY, currentPlacement.centerX);
  const candidates: PlacementCandidate[] = [];

  for (const radiusStep of GLOBAL_DIRECTIONAL_RADIUS_STEPS) {
    for (const angleStep of GLOBAL_DIRECTIONAL_ANGLE_STEPS) {
      const nextRadius = Math.max(0, currentRadius - radiusStep);
      const nextAngle = currentAngle + (angleStep * Math.PI) / 180;
      candidates.push({
        centerX: Math.cos(nextAngle) * nextRadius,
        centerY: Math.sin(nextAngle) * nextRadius,
      });
    }
  }

  return dedupeCandidates(candidates);
}

function normalizeVector(x: number, y: number) {
  const length = Math.hypot(x, y);
  if (length <= 1e-6) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}

function buildFieldGuidedCandidates(
  group: PendingPlaceGroup,
  currentPlacement: FootprintPlacement,
  occupiedGeometries: GroupGeometry[],
) {
  const currentRadius = Math.hypot(currentPlacement.centerX, currentPlacement.centerY) || 1;
  const inward = normalizeVector(-currentPlacement.centerX, -currentPlacement.centerY);
  let repelX = 0;
  let repelY = 0;

  for (const geometry of occupiedGeometries) {
    const neighborX = geometry.photoCenterX;
    const neighborY = geometry.photoCenterY;
    const dx = currentPlacement.centerX - neighborX;
    const dy = currentPlacement.centerY - neighborY;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const weight = 1 / distance;
    repelX += (dx / distance) * weight;
    repelY += (dy / distance) * weight;
  }

  const repel = normalizeVector(repelX, repelY);
  const guide = normalizeVector(inward.x * 1.8 + repel.x * 0.65, inward.y * 1.8 + repel.y * 0.65);
  const tangent = normalizeVector(-guide.y, guide.x);
  const candidates: PlacementCandidate[] = [];

  for (const radiusStep of GLOBAL_FIELD_RADIUS_STEPS) {
    for (const lateralStep of GLOBAL_FIELD_LATERAL_STEPS) {
      const forward = Math.min(radiusStep, currentRadius);
      candidates.push({
        centerX: currentPlacement.centerX + guide.x * forward + tangent.x * lateralStep,
        centerY: currentPlacement.centerY + guide.y * forward + tangent.y * lateralStep,
      });
    }
  }

  for (const bonusForward of [360, 480]) {
    const forward = Math.min(bonusForward, currentRadius);
    candidates.push({
      centerX: currentPlacement.centerX + guide.x * forward,
      centerY: currentPlacement.centerY + guide.y * forward,
    });
  }

  return dedupeCandidates(candidates);
}

function scoreCompactionCandidate(
  group: PendingPlaceGroup,
  candidate: PlacementCandidate,
  currentPlacement: FootprintPlacement,
  basePlacement: FootprintPlacement,
  occupiedGeometries: GroupGeometry[],
  placementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
  mapRect: LogicalRect,
  safeGap: number,
) {
  const candidateGeometry = translateGroupGeometry(
    group.collisionGeometry,
    candidate.centerX,
    candidate.centerY,
  );
  const evaluation = evaluatePlacementCandidate(
    group.placeKey,
    candidateGeometry,
    candidate.centerX,
    candidate.centerY,
    occupiedGeometries,
    mapRect,
    safeGap,
    basePlacement,
    currentPlacement,
    placementById,
    groups,
  );
  if (!evaluation.isValid) return null;

  const currentRadius = Math.hypot(currentPlacement.centerX, currentPlacement.centerY);
  const nextRadius = Math.hypot(candidate.centerX, candidate.centerY);
  const radiusGain = currentRadius - nextRadius;
  if (radiusGain <= 6) return null;

  return {
    placement: {
      centerX: candidate.centerX,
      centerY: candidate.centerY,
    },
    radiusGain,
    score:
      radiusGain * 2.4 -
      evaluation.pressureScore * 0.06 -
      evaluation.labelClearanceScore * 0.1 -
      evaluation.sectorCrowdingScore * 0.08 -
      evaluation.currentAngleDelta * 4 -
      evaluation.lateralOffset * 0.02,
  };
}

function tryAcceptCompactionPlacement(
  group: PendingPlaceGroup,
  candidatePlacement: FootprintPlacement,
  nextPlacementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
  mapRect: LogicalRect,
  safeGap: number,
  baselineEnergy: number,
) {
  const trialPlacementById = new Map(nextPlacementById);
  trialPlacementById.set(group.placeKey, candidatePlacement);
  const trialEnergy = scoreGlobalLayoutEnergy(groups, trialPlacementById, mapRect, safeGap);
  if (trialEnergy >= baselineEnergy - 1.5) return null;
  return {
    placementById: trialPlacementById,
    energy: trialEnergy,
  };
}

function applyGlobalCompactionPass(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  basePlacementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
  safeGap: number,
) {
  const nextPlacementById = new Map(placementById);
  const orderedGroups = buildRadialRefineOrder(groups);
  let changed = false;
  let currentEnergy = scoreGlobalLayoutEnergy(groups, nextPlacementById, mapRect, safeGap);

  for (const group of orderedGroups) {
    const currentPlacement = nextPlacementById.get(group.placeKey);
    if (!currentPlacement) continue;
    const basePlacement = basePlacementById.get(group.placeKey) ?? currentPlacement;
    const occupiedGeometries = buildOccupiedGeometriesForGroup(groups, nextPlacementById, group.placeKey);

    const compacted = findMinimalFeasibleRadius(
      group,
      currentPlacement,
      basePlacement,
      occupiedGeometries,
      mapRect,
      safeGap,
      nextPlacementById,
      groups,
    );

    if (Number.isFinite(compacted.score)) {
      const acceptedCompacted = tryAcceptCompactionPlacement(
        group,
        { centerX: compacted.centerX, centerY: compacted.centerY },
        nextPlacementById,
        groups,
        mapRect,
        safeGap,
        currentEnergy,
      );
      if (acceptedCompacted) {
        acceptedCompacted.placementById.forEach((placement, key) => nextPlacementById.set(key, placement));
        currentEnergy = acceptedCompacted.energy;
        changed = true;
        continue;
      }
    }

    const fieldCandidates = buildFieldGuidedCandidates(group, currentPlacement, occupiedGeometries)
      .map((candidate) => scoreCompactionCandidate(
        group,
        candidate,
        currentPlacement,
        basePlacement,
        occupiedGeometries,
        nextPlacementById,
        groups,
        mapRect,
        safeGap,
      ))
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((left, right) => right.score - left.score);

    let accepted = false;
    for (const candidate of fieldCandidates) {
      const acceptedField = tryAcceptCompactionPlacement(
        group,
        candidate.placement,
        nextPlacementById,
        groups,
        mapRect,
        safeGap,
        currentEnergy,
      );
      if (!acceptedField) continue;
      acceptedField.placementById.forEach((placement, key) => nextPlacementById.set(key, placement));
      currentEnergy = acceptedField.energy;
      changed = true;
      accepted = true;
      break;
    }
    if (accepted) continue;

    const locallyRefined = refineGroupCenterFromCurrentPlacement(
      group.placeKey,
      group.collisionGeometry,
      currentPlacement,
      basePlacement,
      group.logicalX,
      group.logicalY,
      occupiedGeometries,
      mapRect,
      safeGap,
      nextPlacementById,
      groups,
    );
    if (Number.isFinite(locallyRefined.score)) {
      const acceptedLocal = tryAcceptCompactionPlacement(
        group,
        { centerX: locallyRefined.centerX, centerY: locallyRefined.centerY },
        nextPlacementById,
        groups,
        mapRect,
        safeGap,
        currentEnergy,
      );
      if (acceptedLocal) {
        acceptedLocal.placementById.forEach((placement, key) => nextPlacementById.set(key, placement));
        currentEnergy = acceptedLocal.energy;
        changed = true;
        continue;
      }
    }

    const directionalCandidates = buildDirectionalCompactionCandidates(group, currentPlacement)
      .map((candidate) => scoreCompactionCandidate(
        group,
        candidate,
        currentPlacement,
        basePlacement,
        occupiedGeometries,
        nextPlacementById,
        groups,
        mapRect,
        safeGap,
      ))
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((left, right) => right.score - left.score);

    for (const candidate of directionalCandidates) {
      const acceptedDirectional = tryAcceptCompactionPlacement(
        group,
        candidate.placement,
        nextPlacementById,
        groups,
        mapRect,
        safeGap,
        currentEnergy,
      );
      if (!acceptedDirectional) continue;
      acceptedDirectional.placementById.forEach((placement, key) => nextPlacementById.set(key, placement));
      currentEnergy = acceptedDirectional.energy;
      changed = true;
      break;
    }
  }

  return {
    changed,
    placementById: nextPlacementById,
  };
}

function findClosestNeighborForGroup(
  targetKey: string,
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
) {
  const targetGroup = groups.find((group) => group.placeKey === targetKey);
  const targetPlacement = placementById.get(targetKey);
  if (!targetGroup || !targetPlacement) return null;

  let best: null | { group: PendingPlaceGroup; distance: number } = null;
  const targetGeometry = translateGroupGeometry(
    targetGroup.collisionGeometry,
    targetPlacement.centerX,
    targetPlacement.centerY,
  );

  for (const candidate of groups) {
    if (candidate.placeKey === targetKey) continue;
    const candidatePlacement = placementById.get(candidate.placeKey);
    if (!candidatePlacement) continue;
    const candidateGeometry = translateGroupGeometry(
      candidate.collisionGeometry,
      candidatePlacement.centerX,
      candidatePlacement.centerY,
    );
    const geometryPressure = hasGeometryPressureBetweenGroups(targetGeometry, candidateGeometry, GROUP_SAFE_GAP + 18);
    if (!geometryPressure) continue;
    const dx = candidatePlacement.centerX - targetPlacement.centerX;
    const dy = candidatePlacement.centerY - targetPlacement.centerY;
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) {
      best = { group: candidate, distance };
    }
  }

  return best?.group ?? null;
}

function buildAngularWindows(groups: PendingPlaceGroup[], placementById: Map<string, FootprintPlacement>) {
  const ordered = groups
    .map((group) => {
      const placement = placementById.get(group.placeKey);
      if (!placement) return null;
      return { group, angle: Math.atan2(placement.centerY, placement.centerX) };
    })
    .filter((item): item is { group: PendingPlaceGroup; angle: number } => item !== null)
    .sort((left, right) => left.angle - right.angle);

  const windows: PendingPlaceGroup[][] = [];
  const seen = new Set<string>();
  for (const windowSize of [5, 4, 3]) {
    for (let start = 0; start <= ordered.length - windowSize; start++) {
      const slice = ordered.slice(start, start + windowSize).map((item) => item.group);
      if (slice.length < 3) continue;
      const key = slice.map((group) => group.placeKey).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      windows.push(slice);
    }
  }
  return windows;
}

function scoreClusterCompaction(
  cluster: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  allGroups: PendingPlaceGroup[],
  mapRect: LogicalRect,
  safeGap: number,
) {
  const centers = cluster
    .map((group) => placementById.get(group.placeKey))
    .filter((item): item is FootprintPlacement => item != null);
  if (centers.length === 0) return Number.POSITIVE_INFINITY;
  const left = Math.min(...centers.map((item) => item.centerX));
  const right = Math.max(...centers.map((item) => item.centerX));
  const top = Math.min(...centers.map((item) => item.centerY));
  const bottom = Math.max(...centers.map((item) => item.centerY));
  const totalRadius = centers.reduce((sum, item) => sum + Math.hypot(item.centerX, item.centerY), 0);
  const occupancy = buildSectorOccupancy(allGroups, placementById);
  const spanX = right - left;
  const spanY = bottom - top;
  const occupiedGeometries = allGroups
    .filter((candidate) => !cluster.some((group) => group.placeKey === candidate.placeKey))
    .map((candidate) => {
      const placement = placementById.get(candidate.placeKey);
      if (!placement) return null;
      return translateGroupGeometry(candidate.collisionGeometry, placement.centerX, placement.centerY);
    })
    .filter((candidate): candidate is GroupGeometry => candidate !== null);
  const clusterPlacementById = new Map(placementById);
  let pressure = 0;
  let labelPhotoRiskPenalty = 0;
  let sectorDensityPenalty = 0;
  let maxRadius = 0;

  for (const group of cluster) {
    const placement = placementById.get(group.placeKey);
    if (!placement) continue;
    const geometry = translateGroupGeometry(group.collisionGeometry, placement.centerX, placement.centerY);
    const evaluation = evaluatePlacementCandidate(
      group.placeKey,
      geometry,
      placement.centerX,
      placement.centerY,
      occupiedGeometries,
      mapRect,
      safeGap,
      placement,
      placement,
      clusterPlacementById,
      allGroups,
    );
    if (!evaluation.isValid) return Number.POSITIVE_INFINITY;
    const sectorIndex = getSectorIndex(Math.atan2(placement.centerY, placement.centerX));
    pressure += evaluation.pressureScore + evaluation.labelClearanceScore * 0.7 + evaluation.sectorCrowdingScore * 0.55;
    labelPhotoRiskPenalty += evaluation.labelClearanceScore;
    sectorDensityPenalty += computeSectorDensityPenalty(occupancy, sectorIndex);
    maxRadius = Math.max(maxRadius, Math.hypot(placement.centerX, placement.centerY));
    pressure += occupancy[sectorIndex] * 42;
  }

  if (!Number.isFinite(pressure)) return Number.POSITIVE_INFINITY;
  const sectorVariance = cluster.reduce((sum, group) => {
    const placement = placementById.get(group.placeKey);
    if (!placement) return sum;
    const sectorIndex = getSectorIndex(Math.atan2(placement.centerY, placement.centerX));
    return sum + occupancy[sectorIndex] * occupancy[sectorIndex];
  }, 0);
  const radiusSpreadPenalty = computeRadiusSpreadPenalty(centers);
  const clusterSpanPenalty = Math.max(spanX, spanY) * 0.45 + Math.min(spanX, spanY) * 0.2;

  return (
    totalRadius * 0.72 +
    maxRadius * 0.34 +
    clusterSpanPenalty +
    spanX * spanY * 0.001 +
    pressure * 0.12 +
    labelPhotoRiskPenalty * 0.12 +
    radiusSpreadPenalty * 0.16 +
    sectorDensityPenalty * 11 +
    sectorVariance * 12
  );
}

function scoreGlobalLayoutEnergy(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
  safeGap: number,
) {
  const placements = groups
    .map((group) => placementById.get(group.placeKey))
    .filter((placement): placement is FootprintPlacement => placement != null);

  if (placements.length === 0) return Number.POSITIVE_INFINITY;

  const left = Math.min(...placements.map((placement) => placement.centerX));
  const right = Math.max(...placements.map((placement) => placement.centerX));
  const top = Math.min(...placements.map((placement) => placement.centerY));
  const bottom = Math.max(...placements.map((placement) => placement.centerY));
  const totalRadius = placements.reduce((sum, placement) => (
    sum + Math.hypot(placement.centerX, placement.centerY)
  ), 0);
  const maxRadius = Math.max(...placements.map((placement) => Math.hypot(placement.centerX, placement.centerY)));
  const occupancy = buildSectorOccupancy(groups, placementById);
  let pressure = 0;
  let labelPhotoRiskPenalty = 0;
  let sectorDensityPenalty = 0;

  for (const group of groups) {
    const placement = placementById.get(group.placeKey);
    if (!placement) continue;
    const occupiedGeometries = buildOccupiedGeometriesForGroup(groups, placementById, group.placeKey);
    const geometry = translateGroupGeometry(group.collisionGeometry, placement.centerX, placement.centerY);
    const evaluation = evaluatePlacementCandidate(
      group.placeKey,
      geometry,
      placement.centerX,
      placement.centerY,
      occupiedGeometries,
      mapRect,
      safeGap,
      placement,
      placement,
      placementById,
      groups,
    );
    if (!evaluation.isValid) return Number.POSITIVE_INFINITY;
    pressure += evaluation.pressureScore + evaluation.labelClearanceScore * 0.7 + evaluation.sectorCrowdingScore * 0.55;
    const sectorIndex = getSectorIndex(Math.atan2(placement.centerY, placement.centerX));
    sectorDensityPenalty += computeSectorDensityPenalty(occupancy, sectorIndex);
    sectorDensityPenalty += computeInnerRingCrowdingPenalty(placement, occupancy, sectorIndex);
    labelPhotoRiskPenalty += evaluation.labelClearanceScore;
  }

  const sectorVariance = occupancy.reduce((sum, count) => sum + count * count, 0);
  const radiusSpreadPenalty = computeRadiusSpreadPenalty(placements);

  return (
    totalRadius * 0.68 +
    maxRadius * 0.3 +
    (right - left) * (bottom - top) * 0.001 +
    pressure * 0.12 +
    labelPhotoRiskPenalty * 0.1 +
    radiusSpreadPenalty * 0.12 +
    sectorDensityPenalty * 13 +
    sectorVariance * 14
  );
}

function computeTotalRadius(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
) {
  return groups.reduce((sum, group) => {
    const placement = placementById.get(group.placeKey);
    if (!placement) return sum;
    return sum + Math.hypot(placement.centerX, placement.centerY);
  }, 0);
}

function buildClusterActionCandidates(
  group: PendingPlaceGroup,
  placement: FootprintPlacement,
  allGroups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  stepScale = 1,
) {
  const radius = Math.hypot(placement.centerX, placement.centerY);
  const angle = Math.atan2(placement.centerY, placement.centerX);
  const occupancy = buildSectorOccupancy(allGroups, placementById);
  const currentSector = getSectorIndex(angle);
  const inwardSteps = [60, 120, 200, 300, 420, 560].map((step) => Math.max(0, radius - step * stepScale));
  const angleSteps = [0, -4, 4, -8, 8, -12, 12];
  const candidates: PlacementCandidate[] = [
    { centerX: placement.centerX, centerY: placement.centerY },
  ];

  for (const inwardRadius of inwardSteps) {
    for (const angleStep of angleSteps) {
      const targetAngle = angle + (angleStep * Math.PI) / 180;
      candidates.push({
        centerX: Math.cos(targetAngle) * inwardRadius,
        centerY: Math.sin(targetAngle) * inwardRadius,
      });
    }
  }

  if (occupancy[currentSector] >= 3) {
    candidates.push(...buildSparseSectorCandidates(group, placement, occupancy));
  }

  return dedupeCandidates(candidates);
}

function evaluateClusterWindowPlacement(
  cluster: PendingPlaceGroup[],
  trialPlacementById: Map<string, FootprintPlacement>,
  allGroups: PendingPlaceGroup[],
  mapRect: LogicalRect,
  safeGap: number,
  basePlacementById: Map<string, FootprintPlacement>,
) {
  const occupiedOutsideCluster = allGroups
    .filter((candidate) => !cluster.some((group) => group.placeKey === candidate.placeKey))
    .map((candidate) => {
      const placement = trialPlacementById.get(candidate.placeKey);
      if (!placement) return null;
      return translateGroupGeometry(candidate.collisionGeometry, placement.centerX, placement.centerY);
    })
    .filter((candidate): candidate is GroupGeometry => candidate !== null);

  for (const group of cluster) {
    const placement = trialPlacementById.get(group.placeKey);
    const basePlacement = basePlacementById.get(group.placeKey);
    if (!placement || !basePlacement) return Number.POSITIVE_INFINITY;
    const geometry = translateGroupGeometry(group.collisionGeometry, placement.centerX, placement.centerY);
    const occupiedGeometries = [
      ...occupiedOutsideCluster,
      ...cluster
        .filter((candidate) => candidate.placeKey !== group.placeKey)
        .map((candidate) => {
          const candidatePlacement = trialPlacementById.get(candidate.placeKey);
          if (!candidatePlacement) return null;
          return translateGroupGeometry(candidate.collisionGeometry, candidatePlacement.centerX, candidatePlacement.centerY);
        })
        .filter((candidate): candidate is GroupGeometry => candidate !== null),
    ];
    const evaluation = evaluatePlacementCandidate(
      group.placeKey,
      geometry,
      placement.centerX,
      placement.centerY,
      occupiedGeometries,
      mapRect,
      safeGap,
      basePlacement,
      placement,
      trialPlacementById,
      allGroups,
    );
    if (!evaluation.isValid) return Number.POSITIVE_INFINITY;
  }

  return scoreClusterCompaction(cluster, trialPlacementById, allGroups, mapRect, safeGap);
}

function generateWindowPlacementVariants(
  cluster: PendingPlaceGroup[],
  allGroups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
) {
  const variants: Array<Map<string, FootprintPlacement>> = [];

  for (const group of cluster) {
    const placement = placementById.get(group.placeKey);
    if (!placement) continue;
    for (const candidatePlacement of buildClusterActionCandidates(group, placement, allGroups, placementById).slice(1, 5)) {
      if (
        Math.abs(candidatePlacement.centerX - placement.centerX) <= 1 &&
        Math.abs(candidatePlacement.centerY - placement.centerY) <= 1
      ) continue;
      const variant = new Map<string, FootprintPlacement>();
      variant.set(group.placeKey, candidatePlacement);
      variants.push(variant);
    }
  }

  for (let index = 0; index < cluster.length - 1; index++) {
    const left = cluster[index];
    const right = cluster[index + 1];
    const leftPlacement = placementById.get(left.placeKey);
    const rightPlacement = placementById.get(right.placeKey);
    if (!leftPlacement || !rightPlacement) continue;
    const leftCandidates = buildClusterActionCandidates(left, leftPlacement, allGroups, placementById, 0.7).slice(1, 3);
    const rightCandidates = buildClusterActionCandidates(right, rightPlacement, allGroups, placementById, 1).slice(1, 3);
    for (const leftCandidate of leftCandidates) {
      for (const rightCandidate of rightCandidates) {
        const variant = new Map<string, FootprintPlacement>();
        variant.set(left.placeKey, leftCandidate);
        variant.set(right.placeKey, rightCandidate);
        variants.push(variant);
      }
    }
  }

  return variants;
}

function generateWindowJointCompactionVariants(
  cluster: PendingPlaceGroup[],
  allGroups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
) {
  const variants: Array<Map<string, FootprintPlacement>> = [];
  const candidateEntries = cluster
    .map((group) => {
      const placement = placementById.get(group.placeKey);
      if (!placement) return null;
      return {
        group,
        placement,
        candidates: buildClusterActionCandidates(group, placement, allGroups, placementById)
          .slice(1, 5),
      };
    })
    .filter((entry): entry is {
      group: PendingPlaceGroup;
      placement: FootprintPlacement;
      candidates: PlacementCandidate[];
    } => entry !== null);

  for (let index = 0; index < candidateEntries.length - 1; index++) {
    const left = candidateEntries[index];
    const right = candidateEntries[index + 1];
    for (const leftCandidate of left.candidates) {
      for (const rightCandidate of right.candidates) {
        const variant = new Map<string, FootprintPlacement>();
        variant.set(left.group.placeKey, leftCandidate);
        variant.set(right.group.placeKey, rightCandidate);
        variants.push(variant);
      }
    }
  }

  for (let index = 0; index < candidateEntries.length - 2; index++) {
    const left = candidateEntries[index];
    const middle = candidateEntries[index + 1];
    const right = candidateEntries[index + 2];
    for (const leftCandidate of left.candidates.slice(0, 2)) {
      for (const middleCandidate of middle.candidates.slice(0, 3)) {
        for (const rightCandidate of right.candidates.slice(0, 2)) {
          const variant = new Map<string, FootprintPlacement>();
          variant.set(left.group.placeKey, leftCandidate);
          variant.set(middle.group.placeKey, middleCandidate);
          variant.set(right.group.placeKey, rightCandidate);
          variants.push(variant);
        }
      }
    }
  }

  return variants;
}

function generateClusterMigrationVariants(
  cluster: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  allGroups: PendingPlaceGroup[],
) {
  const variants: Array<Map<string, FootprintPlacement>> = [];
  const placements = cluster
    .map((group) => placementById.get(group.placeKey))
    .filter((placement): placement is FootprintPlacement => placement != null);
  const averageRadius = placements.reduce((sum, placement) => (
    sum + Math.hypot(placement.centerX, placement.centerY)
  ), 0) / Math.max(1, placements.length);
  const clusterAngle = averageAngle(placements);

  for (const shrink of [420, 320, 240, 180, 120]) {
    const inwardVariant = new Map<string, FootprintPlacement>();
    for (const group of cluster) {
      const placement = placementById.get(group.placeKey);
      if (!placement) continue;
      const angle = Math.atan2(placement.centerY, placement.centerX);
      const radius = Math.max(0, Math.hypot(placement.centerX, placement.centerY) - shrink);
      inwardVariant.set(group.placeKey, {
        centerX: Math.cos(angle) * radius,
        centerY: Math.sin(angle) * radius,
      });
    }
    if (inwardVariant.size === cluster.length) {
      variants.push(inwardVariant);
    }
  }

  for (const shrink of [320, 240, 180, 120]) {
    const compactArcVariant = new Map<string, FootprintPlacement>();
    const compactBaseRadius = Math.max(0, averageRadius - shrink);
    cluster.forEach((group, index) => {
      const spread = ((index - (cluster.length - 1) / 2) * 5 * Math.PI) / 180;
      compactArcVariant.set(group.placeKey, {
        centerX: Math.cos(clusterAngle + spread) * compactBaseRadius,
        centerY: Math.sin(clusterAngle + spread) * compactBaseRadius,
      });
    });
    if (compactArcVariant.size === cluster.length) {
      variants.push(compactArcVariant);
    }
  }

  for (const shift of [-2, -1, 1, 2]) {
    const migratedVariant = new Map<string, FootprintPlacement>();
    const targetSectorAngle = clusterAngle + (shift * Math.PI * 2) / SECTOR_SLOT_COUNT;
    const targetRadius = Math.max(0, averageRadius - 180);
    cluster.forEach((group, index) => {
      const spread = ((index - (cluster.length - 1) / 2) * 5 * Math.PI) / 180;
      migratedVariant.set(group.placeKey, {
        centerX: Math.cos(targetSectorAngle + spread) * targetRadius,
        centerY: Math.sin(targetSectorAngle + spread) * targetRadius,
      });
    });
    if (migratedVariant.size === cluster.length) {
      variants.push(migratedVariant);
    }
  }

  return variants;
}

function tryNeighborNudge(
  group: PendingPlaceGroup,
  neighbor: PendingPlaceGroup,
  placementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
  mapRect: LogicalRect,
  safeGap: number,
) {
  const groupPlacement = placementById.get(group.placeKey);
  const neighborPlacement = placementById.get(neighbor.placeKey);
  if (!groupPlacement || !neighborPlacement) return null;

  const axisX = neighborPlacement.centerX - groupPlacement.centerX;
  const axisY = neighborPlacement.centerY - groupPlacement.centerY;
  const axisLength = Math.hypot(axisX, axisY) || 1;
  const unitX = axisX / axisLength;
  const unitY = axisY / axisLength;

  let best: null | {
    groupPlacement: FootprintPlacement;
    neighborPlacement: FootprintPlacement;
    score: number;
  } = null;

  for (const step of NEIGHBOR_NUDGE_STEPS) {
    const candidateGroupPlacement = {
      centerX: groupPlacement.centerX - unitX * step * 0.35,
      centerY: groupPlacement.centerY - unitY * step * 0.35,
    };
    const candidateNeighborPlacement = {
      centerX: neighborPlacement.centerX + unitX * step,
      centerY: neighborPlacement.centerY + unitY * step,
    };
    const trialPlacementById = new Map(placementById);
    trialPlacementById.set(group.placeKey, candidateGroupPlacement);
    trialPlacementById.set(neighbor.placeKey, candidateNeighborPlacement);
    const candidateGroupGeometry = translateGroupGeometry(
      group.collisionGeometry,
      candidateGroupPlacement.centerX,
      candidateGroupPlacement.centerY,
    );
    const occupied = groups
      .filter((candidate) => candidate.placeKey !== group.placeKey)
      .map((candidate) => {
        const placement = trialPlacementById.get(candidate.placeKey);
        if (!placement) return null;
        return {
          key: candidate.placeKey,
          geometry: translateGroupGeometry(candidate.collisionGeometry, placement.centerX, placement.centerY),
        };
      })
      .filter((candidate): candidate is { key: string; geometry: GroupGeometry } => candidate !== null);
    const neighborGeometry = translateGroupGeometry(
      neighbor.collisionGeometry,
      candidateNeighborPlacement.centerX,
      candidateNeighborPlacement.centerY,
    );
    const occupiedForGroup = occupied.map((item) => item.geometry);
    const occupiedForNeighbor = occupied.filter((item) => item.key !== neighbor.placeKey).map((item) => item.geometry);
    const groupEval = evaluatePlacementCandidate(
      group.placeKey,
      candidateGroupGeometry,
      candidateGroupPlacement.centerX,
      candidateGroupPlacement.centerY,
      occupiedForGroup,
      mapRect,
      safeGap,
      groupPlacement,
      groupPlacement,
      trialPlacementById,
      groups,
    );
    if (!groupEval.isValid) continue;
    const neighborEval = evaluatePlacementCandidate(
      neighbor.placeKey,
      neighborGeometry,
      candidateNeighborPlacement.centerX,
      candidateNeighborPlacement.centerY,
      occupiedForNeighbor,
      mapRect,
      safeGap,
      neighborPlacement,
      neighborPlacement,
      trialPlacementById,
      groups,
    );
    if (!neighborEval.isValid) continue;

    const score =
      Math.hypot(candidateGroupPlacement.centerX, candidateGroupPlacement.centerY) +
      Math.hypot(candidateNeighborPlacement.centerX, candidateNeighborPlacement.centerY) +
      groupEval.lateralOffset * 0.08 +
      neighborEval.lateralOffset * 0.08 +
      groupEval.collisionScore * 0.04 +
      neighborEval.collisionScore * 0.04;
    if (!best || score < best.score) {
      best = {
        groupPlacement: candidateGroupPlacement,
        neighborPlacement: candidateNeighborPlacement,
        score,
      };
    }
  }

  return best;
}

function refineSectorClusters(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  basePlacementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
  safeGap: number,
) {
  const nextPlacementById = new Map(placementById);

  for (let pass = 0; pass < CLUSTER_REARRANGE_PASSES; pass++) {
    let changed = false;
    const windows = buildAngularWindows(groups, nextPlacementById)
      .sort((left, right) => (
        scoreClusterCompaction(right, nextPlacementById, groups, mapRect, safeGap) -
        scoreClusterCompaction(left, nextPlacementById, groups, mapRect, safeGap)
      ));

    for (const windowGroups of windows) {
      const baseline = scoreClusterCompaction(windowGroups, nextPlacementById, groups, mapRect, safeGap);
      const baselineGlobalEnergy = scoreGlobalLayoutEnergy(groups, nextPlacementById, mapRect, safeGap);
      const baselineTotalRadius = computeTotalRadius(groups, nextPlacementById);
      let bestScore = baseline;
      let bestPlacementById: Map<string, FootprintPlacement> | null = null;
      let bestGlobalEnergy = baselineGlobalEnergy;
      let bestTotalRadius = baselineTotalRadius;

      for (const variant of generateWindowJointCompactionVariants(windowGroups, groups, nextPlacementById)) {
        const trialPlacementById = new Map(nextPlacementById);
        variant.forEach((placement, key) => trialPlacementById.set(key, placement));
        const trialScore = evaluateClusterWindowPlacement(
          windowGroups,
          trialPlacementById,
          groups,
          mapRect,
          safeGap,
          basePlacementById,
        );
        const trialGlobalEnergy = scoreGlobalLayoutEnergy(groups, trialPlacementById, mapRect, safeGap);
        const trialTotalRadius = computeTotalRadius(groups, trialPlacementById);
        if (
          trialScore < bestScore - 1e-6 &&
          trialGlobalEnergy < bestGlobalEnergy - 4 &&
          trialTotalRadius < bestTotalRadius - 12
        ) {
          bestScore = trialScore;
          bestGlobalEnergy = trialGlobalEnergy;
          bestTotalRadius = trialTotalRadius;
          bestPlacementById = trialPlacementById;
        }
      }

      for (const variant of generateWindowPlacementVariants(windowGroups, groups, nextPlacementById)) {
        const trialPlacementById = new Map(nextPlacementById);
        variant.forEach((placement, key) => trialPlacementById.set(key, placement));
        const trialScore = evaluateClusterWindowPlacement(
          windowGroups,
          trialPlacementById,
          groups,
          mapRect,
          safeGap,
          basePlacementById,
        );
        const trialGlobalEnergy = scoreGlobalLayoutEnergy(groups, trialPlacementById, mapRect, safeGap);
        const trialTotalRadius = computeTotalRadius(groups, trialPlacementById);
        if (
          trialScore < bestScore - 1e-6 &&
          trialGlobalEnergy < bestGlobalEnergy - 4 &&
          trialTotalRadius < bestTotalRadius - 4
        ) {
          bestScore = trialScore;
          bestGlobalEnergy = trialGlobalEnergy;
          bestTotalRadius = trialTotalRadius;
          bestPlacementById = trialPlacementById;
        }
      }

      for (const variant of generateClusterMigrationVariants(windowGroups, nextPlacementById, groups)) {
        const trialPlacementById = new Map(nextPlacementById);
        variant.forEach((placement, key) => trialPlacementById.set(key, placement));
        const trialScore = evaluateClusterWindowPlacement(
          windowGroups,
          trialPlacementById,
          groups,
          mapRect,
          safeGap,
          basePlacementById,
        );
        const trialGlobalEnergy = scoreGlobalLayoutEnergy(groups, trialPlacementById, mapRect, safeGap);
        const trialTotalRadius = computeTotalRadius(groups, trialPlacementById);
        if (
          trialScore < bestScore - 1e-6 &&
          trialGlobalEnergy < bestGlobalEnergy - 4 &&
          trialTotalRadius < bestTotalRadius - 8
        ) {
          bestScore = trialScore;
          bestGlobalEnergy = trialGlobalEnergy;
          bestTotalRadius = trialTotalRadius;
          bestPlacementById = trialPlacementById;
        }
      }

      if (!bestPlacementById) {
        for (const pivot of windowGroups) {
          const neighbor = findClosestNeighborForGroup(pivot.placeKey, windowGroups, nextPlacementById);
          if (!neighbor) continue;
          const nudged = tryNeighborNudge(pivot, neighbor, nextPlacementById, groups, mapRect, safeGap);
          if (!nudged) continue;
          const trialPlacementById = new Map(nextPlacementById);
          trialPlacementById.set(pivot.placeKey, nudged.groupPlacement);
          trialPlacementById.set(neighbor.placeKey, nudged.neighborPlacement);
          const trialScore = evaluateClusterWindowPlacement(
            windowGroups,
            trialPlacementById,
            groups,
            mapRect,
            safeGap,
            basePlacementById,
          );
          const trialGlobalEnergy = scoreGlobalLayoutEnergy(groups, trialPlacementById, mapRect, safeGap);
          const trialTotalRadius = computeTotalRadius(groups, trialPlacementById);
          if (
            trialScore < bestScore - 1e-6 &&
            trialGlobalEnergy < bestGlobalEnergy - 4 &&
            trialTotalRadius < bestTotalRadius - 2
          ) {
            bestScore = trialScore;
            bestGlobalEnergy = trialGlobalEnergy;
            bestTotalRadius = trialTotalRadius;
            bestPlacementById = trialPlacementById;
          }
        }
      }

      if (bestPlacementById) {
        bestPlacementById.forEach((placement, key) => nextPlacementById.set(key, placement));
        changed = true;
      }
    }

    if (!changed) break;
  }

  return nextPlacementById;
}

function refineGroupCenterFromCurrentPlacement(
  placeKey: string,
  baseGeometry: GroupGeometry,
  currentPlacement: FootprintPlacement,
  basePlacement: FootprintPlacement,
  logicalX: number,
  logicalY: number,
  occupiedGeometries: GroupGeometry[],
  mapRect: LogicalRect,
  safeGap: number,
  placementById: Map<string, FootprintPlacement>,
  groups: PendingPlaceGroup[],
) {
  const currentRadius = Math.hypot(currentPlacement.centerX, currentPlacement.centerY);
  const currentAngle = Math.atan2(currentPlacement.centerY, currentPlacement.centerX);
  const baseRadius = Math.hypot(basePlacement.centerX, basePlacement.centerY);
  const baseAngle = Math.atan2(basePlacement.centerY, basePlacement.centerX);
  let foundFiniteCandidate = false;
  let bestRadius = currentRadius;
  let best = scoreCandidateAroundCurrentCenter(
    placeKey,
    baseGeometry,
    currentPlacement.centerX,
    currentPlacement.centerY,
    logicalX,
    logicalY,
    occupiedGeometries,
    mapRect,
    safeGap,
    baseAngle,
    baseRadius,
    currentAngle,
    currentRadius,
    placementById,
    groups,
  );
  foundFiniteCandidate = Number.isFinite(best.score);
  if (foundFiniteCandidate) {
    bestRadius = Math.hypot(best.geometry.photoCenterX, best.geometry.photoCenterY);
  }
  const radialStepScale = Math.min(1.8, Math.max(0.8, Math.sqrt(getGroupArea(baseGeometry.photoRect)) / 220));

  for (const angleOffset of POST_LAYOUT_SEARCH_ANGLE_STEPS) {
    const angle = currentAngle + (angleOffset * Math.PI) / 180;
    for (const radiusStep of POST_LAYOUT_SEARCH_RADIUS_STEPS) {
      const radius = Math.max(0, currentRadius + radiusStep * radialStepScale);
      const centerX = Math.cos(angle) * radius;
      const centerY = Math.sin(angle) * radius;
      const candidate = scoreCandidateAroundCurrentCenter(
        placeKey,
        baseGeometry,
        centerX,
        centerY,
        logicalX,
        logicalY,
        occupiedGeometries,
        mapRect,
        safeGap,
        baseAngle,
        baseRadius,
        currentAngle,
        currentRadius,
        placementById,
        groups,
      );
      if (Number.isFinite(candidate.score)) foundFiniteCandidate = true;
      if (!Number.isFinite(candidate.score)) continue;
      const candidateRadius = Math.hypot(candidate.geometry.photoCenterX, candidate.geometry.photoCenterY);
      if (
        candidateRadius < bestRadius - 4 ||
        (
          Math.abs(candidateRadius - bestRadius) <= 4 &&
          candidate.score < best.score - 1e-6
        )
      ) {
        best = candidate;
        bestRadius = candidateRadius;
      }
    }
  }

  if (!foundFiniteCandidate) {
    return {
      centerX: currentPlacement.centerX,
      centerY: currentPlacement.centerY,
      geometry: translateGroupGeometry(baseGeometry, currentPlacement.centerX, currentPlacement.centerY),
      score: Number.POSITIVE_INFINITY,
    };
  }

  return {
    centerX: best.geometry.photoCenterX,
    centerY: best.geometry.photoCenterY,
    geometry: best.geometry,
    score: best.score,
  };
}

export function refineRadialPlacements(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
) {
  let refinedPlacementById = refineRadialPlacementsWithDeps(
    groups,
    placementById,
    mapRect,
    safeGap,
    labelGapBoost,
    {
      buildRadialRefineOrder,
      buildOccupiedGeometries: (allGroups, currentPlacementById, excludePlaceKey) => (
        allGroups
          .filter((candidate) => candidate.placeKey !== excludePlaceKey)
          .map((candidate) => {
            const placement = currentPlacementById.get(candidate.placeKey);
            if (!placement) return null;
            return translateGroupGeometry(candidate.collisionGeometry, placement.centerX, placement.centerY);
          })
          .filter((candidate): candidate is GroupGeometry => candidate !== null)
      ),
      findMinimalFeasibleRadius: (group, currentPlacement, basePlacement, occupiedGeometries, localMapRect, localSafeGap, _labelGapBoost, localPlacementById, localGroups) => (
        findMinimalFeasibleRadius(
          group,
          currentPlacement,
          basePlacement,
          occupiedGeometries,
          localMapRect,
          localSafeGap,
          localPlacementById,
          localGroups,
        )
      ),
      refineGroupCenterFromCurrentPlacement: (placeKey, baseGeometry, currentPlacement, basePlacement, logicalX, logicalY, occupiedGeometries, localMapRect, localSafeGap, _labelGapBoost, localPlacementById, localGroups) => (
        refineGroupCenterFromCurrentPlacement(
          placeKey,
          baseGeometry as GroupGeometry,
          currentPlacement,
          basePlacement,
          logicalX,
          logicalY,
          occupiedGeometries as GroupGeometry[],
          localMapRect,
          localSafeGap,
          localPlacementById,
          localGroups,
        )
      ),
      findClosestNeighborForGroup,
      tryNeighborNudge: (group, neighbor, localPlacementById, localGroups, localMapRect, localSafeGap) => (
        tryNeighborNudge(group, neighbor, localPlacementById, localGroups, localMapRect, localSafeGap)
      ),
      refineSectorClusters: (_localGroups, localPlacementById) => localPlacementById,
      refinePasses: POST_LAYOUT_REFINE_PASSES,
    },
  );

  const basePlacementById = new Map(placementById);
  for (let pass = 0; pass < GLOBAL_COMPACTION_PASSES; pass++) {
    const compacted = applyGlobalCompactionPass(
      groups,
      refinedPlacementById,
      basePlacementById,
      mapRect,
      safeGap,
    );
    refinedPlacementById = compacted.placementById;
    if (!compacted.changed) break;
  }

  refinedPlacementById = refineSectorClusters(
    groups,
    refinedPlacementById,
    new Map(placementById),
    mapRect,
    safeGap,
  );

  return refinedPlacementById;
}
