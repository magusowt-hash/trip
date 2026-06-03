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

const GROUP_GAP = 14;
const LABEL_GAP = 22;
const MAP_GAP = 128;
const LINE_BUNDLE_DISTANCE = 34;
const LOCAL_DENSITY_DISTANCE = 420;
const GLOBAL_SECTOR_COUNT = 16;
const INITIAL_ASSIGNMENT_PASSES = 3;
const REBALANCE_ITERATION_COUNT = 8;
const MAX_CANDIDATES_PER_GROUP = 48;

const ANGLE_OFFSETS_DEGREES = [-24, -16, -10, -6, 0, 6, 10, 16, 24];
const RADIUS_FACTORS = [0.78, 0.86, 0.94, 1, 1.08, 1.18];
const OUTER_RING_RADIUS_FACTORS = [1.24, 1.36];
const DENSE_SECTOR_ANGLE_OFFSETS_DEGREES = [-32, -24, 24, 32];
const DENSE_SECTOR_RADIUS_FACTORS = [1.08, 1.18, 1.28];

type PlacementCandidate = {
  placement: FootprintPlacement;
  geometry: GroupGeometry;
  basePenalty: number;
};

type PlacementState = {
  placementById: Map<string, FootprintPlacement>;
  geometryById: Map<string, GroupGeometry>;
  candidateIndexById: Map<string, number>;
};

type CandidateEvaluation = {
  valid: boolean;
  score: number;
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

function compareGroupOrder(
  left: PendingPlaceGroup,
  right: PendingPlaceGroup,
  basePlacementById: Map<string, FootprintPlacement>,
) {
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

function scoreBaseCandidate(
  angle: number,
  radius: number,
  baseAngle: number,
  baseRadius: number,
  geometry: GroupGeometry,
  mapRect: LogicalRect,
) {
  const driftPenalty = Math.abs(angleDelta(angle, baseAngle)) * 46;
  const radiusPenalty = Math.abs(radius - baseRadius) * 0.85;
  const outwardPenalty = Math.max(0, radius - baseRadius) * 1.15;
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
  const seeds: PlacementCandidate[] = [];

  const addCandidate = (angle: number, radius: number) => {
    const placement = {
      centerX: Math.cos(angle) * radius,
      centerY: Math.sin(angle) * radius,
    };
    const geometry = chooseBestGeometryForPlacement(group, placement, mapRect);
    if (!geometryFitsMap(geometry, mapRect)) return;
    seeds.push({
      placement,
      geometry,
      basePenalty: scoreBaseCandidate(normalizeAngle(angle), radius, baseAngle, safeBaseRadius, geometry, mapRect),
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

  return (right - left) * 0.05 + (bottom - top) * 0.04;
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

    const photoOverlap = rectOverlapsOccupiedPhotos(candidate.geometry.photoRect, [neighborGeometry], photoGap);
    const labelOverlap = hasLabelCollisions(candidate.geometry, [neighborGeometry], labelGap);
    const photoLabelOverlap = hasPhotoAgainstLabelCollisions(candidate.geometry, [neighborGeometry], labelGap);
    if (photoOverlap || labelOverlap || photoLabelOverlap) {
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
    const photoOverlap = rectOverlapsOccupiedPhotos(candidate.geometry.photoRect, [locked.geometry], photoGap);
    const labelOverlap = hasLabelCollisions(candidate.geometry, [locked.geometry], labelGap);
    const photoLabelOverlap = hasPhotoAgainstLabelCollisions(candidate.geometry, [locked.geometry], labelGap);
    if (photoOverlap || labelOverlap || photoLabelOverlap) {
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

function assignInitialPlacements(
  orderedGroups: PendingPlaceGroup[],
  candidatePoolById: Map<string, PlacementCandidate[]>,
  lockedGroups: LockedPlaceGroup[],
  safeGap: number,
) {
  let bestState: PlacementState | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let pass = 0; pass < INITIAL_ASSIGNMENT_PASSES; pass++) {
    const state: PlacementState = {
      placementById: new Map<string, FootprintPlacement>(),
      geometryById: new Map<string, GroupGeometry>(),
      candidateIndexById: new Map<string, number>(),
    };

    let valid = true;
    let totalScore = 0;

    for (const group of orderedGroups) {
      const candidates = candidatePoolById.get(group.placeKey) ?? [];
      if (candidates.length === 0) {
        valid = false;
        break;
      }

      let bestIndex = -1;
      let bestCandidateScore = Number.POSITIVE_INFINITY;

      const offset = pass % Math.max(1, Math.min(8, candidates.length));
      for (let step = 0; step < candidates.length; step++) {
        const index = (step + offset) % candidates.length;
        const candidate = candidates[index];
        const evaluation = evaluateCandidate(group, candidate, orderedGroups, state, lockedGroups, safeGap);
        if (!evaluation.valid) continue;
        if (evaluation.score < bestCandidateScore) {
          bestCandidateScore = evaluation.score;
          bestIndex = index;
        }
      }

      if (bestIndex < 0) {
        valid = false;
        break;
      }

      const chosen = candidates[bestIndex];
      state.placementById.set(group.placeKey, chosen.placement);
      state.geometryById.set(group.placeKey, chosen.geometry);
      state.candidateIndexById.set(group.placeKey, bestIndex);
      totalScore += bestCandidateScore;
    }

    if (valid && totalScore < bestScore) {
      bestState = state;
      bestScore = totalScore;
    }
  }

  return bestState;
}

function reassignGroup(
  group: PendingPlaceGroup,
  groups: PendingPlaceGroup[],
  candidatePoolById: Map<string, PlacementCandidate[]>,
  state: PlacementState,
  lockedGroups: LockedPlaceGroup[],
  safeGap: number,
) {
  const currentIndex = state.candidateIndexById.get(group.placeKey) ?? 0;
  const candidates = candidatePoolById.get(group.placeKey) ?? [];
  if (candidates.length === 0) return false;

  const currentCandidate = candidates[currentIndex];
  const currentScore = currentCandidate
    ? evaluateCandidate(group, currentCandidate, groups, state, lockedGroups, safeGap)
    : { valid: false, score: Number.POSITIVE_INFINITY };

  let bestIndex = currentIndex;
  let bestScore = currentScore.score;

  state.placementById.delete(group.placeKey);
  state.geometryById.delete(group.placeKey);

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const evaluation = evaluateCandidate(group, candidate, groups, state, lockedGroups, safeGap);
    if (!evaluation.valid) continue;
    if (evaluation.score < bestScore - 1e-6) {
      bestScore = evaluation.score;
      bestIndex = index;
    }
  }

  const chosen = candidates[bestIndex] ?? currentCandidate;
  if (chosen) {
    state.placementById.set(group.placeKey, chosen.placement);
    state.geometryById.set(group.placeKey, chosen.geometry);
    state.candidateIndexById.set(group.placeKey, bestIndex);
  }

  return bestIndex !== currentIndex;
}

function optimizeAssignments(
  orderedGroups: PendingPlaceGroup[],
  candidatePoolById: Map<string, PlacementCandidate[]>,
  state: PlacementState,
  lockedGroups: LockedPlaceGroup[],
  safeGap: number,
) {
  for (let iteration = 0; iteration < REBALANCE_ITERATION_COUNT; iteration++) {
    let changed = false;
    for (const group of orderedGroups) {
      if (reassignGroup(group, orderedGroups, candidatePoolById, state, lockedGroups, safeGap)) {
        changed = true;
      }
    }
    if (!changed) break;
  }
}

function improveCorridorRisk(
  orderedGroups: PendingPlaceGroup[],
  candidatePoolById: Map<string, PlacementCandidate[]>,
  state: PlacementState,
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
  lockedGroups: LockedPlaceGroup[],
) {
  let geometryById = buildGeometryMapForPlacements(
    orderedGroups,
    state.placementById,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  );
  let hardConflicts = hasHardConflicts(
    orderedGroups,
    state.placementById,
    geometryById,
    mapRect,
    safeGap,
    lockedGroups,
  );
  let corridorRisk = countCorridorRiskConflicts(
    orderedGroups,
    geometryById,
    safeGap,
    lockedGroups,
  );
  let envelopeScore = scoreFinalLayoutEnvelope(orderedGroups, geometryById);

  for (let iteration = 0; iteration < REBALANCE_ITERATION_COUNT; iteration++) {
    let changed = false;

    for (const group of orderedGroups) {
      const currentPlacement = state.placementById.get(group.placeKey);
      if (!currentPlacement) continue;

      const candidates = candidatePoolById.get(group.placeKey) ?? [];
      let bestPlacement = currentPlacement;
      let bestIndex = state.candidateIndexById.get(group.placeKey) ?? 0;
      let bestGeometry = geometryById;
      let bestHardConflicts = hardConflicts;
      let bestCorridorRisk = corridorRisk;
      let bestEnvelopeScore = envelopeScore;

      for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index];
        if (!candidate) continue;

        const placementById = new Map(state.placementById);
        placementById.set(group.placeKey, candidate.placement);
        const candidateGeometryById = buildGeometryMapForPlacements(
          orderedGroups,
          placementById,
          mapRect,
          safeGap,
          labelGapBoost,
          lockedGroups,
        );
        const candidateHardConflicts = hasHardConflicts(
          orderedGroups,
          placementById,
          candidateGeometryById,
          mapRect,
          safeGap,
          lockedGroups,
        );
        const candidateCorridorRisk = countCorridorRiskConflicts(
          orderedGroups,
          candidateGeometryById,
          safeGap,
          lockedGroups,
        );
        const candidateEnvelopeScore = scoreFinalLayoutEnvelope(
          orderedGroups,
          candidateGeometryById,
        );

        const isBetter =
          (!candidateHardConflicts && bestHardConflicts) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateCorridorRisk < bestCorridorRisk) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateCorridorRisk === bestCorridorRisk &&
            candidateEnvelopeScore < bestEnvelopeScore - 1e-6);

        if (!isBetter) continue;

        bestPlacement = candidate.placement;
        bestIndex = index;
        bestGeometry = candidateGeometryById;
        bestHardConflicts = candidateHardConflicts;
        bestCorridorRisk = candidateCorridorRisk;
        bestEnvelopeScore = candidateEnvelopeScore;
      }

      if (
        bestPlacement.centerX !== currentPlacement.centerX ||
        bestPlacement.centerY !== currentPlacement.centerY
      ) {
        state.placementById.set(group.placeKey, bestPlacement);
        state.candidateIndexById.set(group.placeKey, bestIndex);
        geometryById = bestGeometry;
        hardConflicts = bestHardConflicts;
        corridorRisk = bestCorridorRisk;
        envelopeScore = bestEnvelopeScore;
        changed = true;
      }
    }

    if (!changed) break;
  }
}

function buildGeometryMapForPlacements(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost = 0,
  lockedGroups: LockedPlaceGroup[] = [],
) {
  const entries = groups.flatMap((group) => {
    const placement = placementById.get(group.placeKey);
    if (!placement) return [];
    const geometry = chooseBestGeometryForPlacement(group, placement, mapRect);
    return [{ id: group.placeKey, geometry }];
  });
  const resolved = resolveGroupGeometryAsWhole(
    [
      ...lockedGroups.map((group) => ({ id: group.placeKey, geometry: group.geometry })),
      ...entries,
    ],
    { gap: Math.max(GROUP_GAP, safeGap), mapRect, mapGap: MAP_GAP, labelGapBoost },
  );
  const geometryById = new Map<string, GroupGeometry>();
  for (const group of groups) {
    const geometry = resolved.get(group.placeKey);
    if (!geometry) continue;
    geometryById.set(group.placeKey, geometry);
  }
  return geometryById;
}

function hasHardConflicts(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  geometryById: Map<string, GroupGeometry>,
  mapRect: LogicalRect,
  safeGap: number,
  lockedGroups: LockedPlaceGroup[] = [],
) {
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    const geometry = geometryById.get(group.placeKey);
    if (!geometry) return true;
    if (!geometryFitsMap(geometry, mapRect)) return true;

    const line = buildLine(group, geometry);
    for (let neighborIndex = index + 1; neighborIndex < groups.length; neighborIndex++) {
      const neighbor = groups[neighborIndex];
      const neighborGeometry = geometryById.get(neighbor.placeKey);
      if (!neighborGeometry) return true;

      const photoOverlap = rectOverlapsOccupiedPhotos(geometry.photoRect, [neighborGeometry], Math.max(GROUP_GAP, safeGap));
      const labelOverlap = hasLabelCollisions(geometry, [neighborGeometry], Math.max(LABEL_GAP, safeGap));
      const photoLabelOverlap = hasPhotoAgainstLabelCollisions(geometry, [neighborGeometry], Math.max(LABEL_GAP, safeGap));
      if (photoOverlap || labelOverlap || photoLabelOverlap) {
        return true;
      }

      const neighborLine = buildLine(neighbor, neighborGeometry);
      if (segmentsIntersect(line.start, line.end, neighborLine.start, neighborLine.end)) {
        return true;
      }
    }

    for (const locked of lockedGroups) {
      const photoOverlap = rectOverlapsOccupiedPhotos(geometry.photoRect, [locked.geometry], Math.max(GROUP_GAP, safeGap));
      const labelOverlap = hasLabelCollisions(geometry, [locked.geometry], Math.max(LABEL_GAP, safeGap));
      const photoLabelOverlap = hasPhotoAgainstLabelCollisions(geometry, [locked.geometry], Math.max(LABEL_GAP, safeGap));
      if (photoOverlap || labelOverlap || photoLabelOverlap) {
        return true;
      }

      const lockedLine = buildLine(locked, locked.geometry);
      if (segmentsIntersect(line.start, line.end, lockedLine.start, lockedLine.end)) {
        return true;
      }
    }
  }

  return false;
}

function countCorridorRiskConflicts(
  groups: PendingPlaceGroup[],
  geometryById: Map<string, GroupGeometry>,
  safeGap: number,
  lockedGroups: LockedPlaceGroup[] = [],
) {
  let risk = 0;
  const groupGap = Math.max(48, safeGap * 0.5);
  const labelGap = Math.max(LABEL_GAP, safeGap + 16);

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    const geometry = geometryById.get(group.placeKey);
    if (!geometry) {
      risk += 1;
      continue;
    }

    for (let neighborIndex = index + 1; neighborIndex < groups.length; neighborIndex++) {
      const neighbor = groups[neighborIndex];
      const neighborGeometry = geometryById.get(neighbor.placeKey);
      if (!neighborGeometry) {
        risk += 1;
        continue;
      }
      if (
        rectsOverlap(geometry.groupRect, neighborGeometry.groupRect, groupGap) ||
        rectsOverlap(geometry.labelRect, neighborGeometry.photoRect, labelGap) ||
        rectsOverlap(neighborGeometry.labelRect, geometry.photoRect, labelGap) ||
        rectsOverlap(geometry.labelRect, neighborGeometry.labelRect, labelGap)
      ) {
        risk += 1;
      }
    }

    for (const locked of lockedGroups) {
      if (
        rectsOverlap(geometry.groupRect, locked.geometry.groupRect, groupGap) ||
        rectsOverlap(geometry.labelRect, locked.geometry.photoRect, labelGap) ||
        rectsOverlap(locked.geometry.labelRect, geometry.photoRect, labelGap) ||
        rectsOverlap(geometry.labelRect, locked.geometry.labelRect, labelGap)
      ) {
        risk += 1;
      }
    }
  }

  return risk;
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

export function solvePendingGroupPlacements(
  groups: PendingPlaceGroup[],
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
  lockedGroups: LockedPlaceGroup[] = [],
) {
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

  const basePlacementById = new Map<string, FootprintPlacement>();
  basePlacements.forEach((placement) => {
    basePlacementById.set(placement.id, {
      centerX: placement.centerX,
      centerY: placement.centerY,
    });
  });
  const baseSectorCounts = Array.from({ length: GLOBAL_SECTOR_COUNT }, () => 0);
  basePlacementById.forEach((placement) => {
    baseSectorCounts[computeSectorIndex(Math.atan2(placement.centerY, placement.centerX))] += 1;
  });

  const orderedGroups = [...groups].sort((left, right) => compareGroupOrder(left, right, basePlacementById));
  const candidatePoolById = new Map<string, PlacementCandidate[]>();
  for (const group of orderedGroups) {
    const basePlacement = basePlacementById.get(group.placeKey) ?? { centerX: 0, centerY: 0 };
    const sectorDensity = baseSectorCounts[computeSectorIndex(Math.atan2(basePlacement.centerY, basePlacement.centerX))] ?? 0;
    candidatePoolById.set(group.placeKey, buildCandidatePool(group, basePlacement, mapRect, sectorDensity));
  }

  const assignedState = assignInitialPlacements(orderedGroups, candidatePoolById, lockedGroups, safeGap);
  const workingState = assignedState ?? buildFallbackState(orderedGroups, basePlacementById, mapRect);
  optimizeAssignments(orderedGroups, candidatePoolById, workingState, lockedGroups, safeGap);
  improveCorridorRisk(
    orderedGroups,
    candidatePoolById,
    workingState,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  );

  const refinedPlacementById = refineRadialPlacements(
    orderedGroups,
    new Map(workingState.placementById),
    mapRect,
    Math.max(safeGap, MAP_GAP),
    labelGapBoost,
  );
  const refinedGeometryById = buildGeometryMapForPlacements(
    orderedGroups,
    refinedPlacementById,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  );
  const optimizedGeometryById = buildGeometryMapForPlacements(
    orderedGroups,
    workingState.placementById,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  );

  const refinedHasHardConflicts = hasHardConflicts(
    orderedGroups,
    refinedPlacementById,
    refinedGeometryById,
    mapRect,
    safeGap,
    lockedGroups,
  );
  const optimizedHasHardConflicts = hasHardConflicts(
    orderedGroups,
    workingState.placementById,
    optimizedGeometryById,
    mapRect,
    safeGap,
    lockedGroups,
  );
  const refinedCorridorRisk = countCorridorRiskConflicts(
    orderedGroups,
    refinedGeometryById,
    safeGap,
    lockedGroups,
  );
  const optimizedCorridorRisk = countCorridorRiskConflicts(
    orderedGroups,
    optimizedGeometryById,
    safeGap,
    lockedGroups,
  );
  const refinedEnvelopeScore = scoreFinalLayoutEnvelope(orderedGroups, refinedGeometryById);
  const optimizedEnvelopeScore = scoreFinalLayoutEnvelope(orderedGroups, optimizedGeometryById);
  const shouldUseRefined =
    (!refinedHasHardConflicts && optimizedHasHardConflicts) ||
    (refinedCorridorRisk < optimizedCorridorRisk) ||
    (
      refinedCorridorRisk === optimizedCorridorRisk &&
      !refinedHasHardConflicts &&
      !optimizedHasHardConflicts &&
      refinedEnvelopeScore <= optimizedEnvelopeScore * 1.04
    ) ||
    (
      refinedCorridorRisk === optimizedCorridorRisk &&
      refinedHasHardConflicts &&
      optimizedHasHardConflicts &&
      refinedEnvelopeScore < optimizedEnvelopeScore
    );
  const finalPlacements = shouldUseRefined
    ? refinedPlacementById
    : workingState.placementById;
  const finalGeometries = finalPlacements === refinedPlacementById
    ? refinedGeometryById
    : optimizedGeometryById;

  return {
    placements: finalPlacements,
    geometries: finalGeometries,
  };
}
