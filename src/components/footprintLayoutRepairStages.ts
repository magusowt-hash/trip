import type { FootprintPlacement, LockedPlaceGroup, LogicalRect, PendingPlaceGroup } from './footprintLayoutTypes';
import { getBoundaryLabelXMetrics, hasBoundaryLabelXConflictAtMaxScale, type BoundaryAnchor, type GroupGeometry } from './localMapGroupGeometry';
import type { PlacementState } from './footprintLayoutLayeredPlacement';
import type { SolverMetricReporter } from './footprintLayoutSolver';

type LineGroup = Pick<PendingPlaceGroup, 'logicalX' | 'logicalY'> | LockedPlaceGroup;

type PlacementCandidate = {
  placement: FootprintPlacement;
  geometry: GroupGeometry;
  basePenalty: number;
};

type PlacementAnalysis = {
  geometryById: Map<string, GroupGeometry>;
  hasHardConflicts: boolean;
  corridorRisk: number;
  lineCrossings: number;
};

type PlacementAnalysisOptions = {
  includeCorridorRisk?: boolean;
  includeLineCrossings?: boolean;
};

type RepairDeps = {
  analyzePlacementState: (
    groups: PendingPlaceGroup[],
    placementById: Map<string, FootprintPlacement>,
    mapRect: LogicalRect,
    safeGap: number,
    labelGapBoost: number,
    lockedGroups: LockedPlaceGroup[],
    options?: PlacementAnalysisOptions,
  ) => PlacementAnalysis;
  relaxRadialSpacing: (
    orderedGroups: PendingPlaceGroup[],
    state: PlacementState,
    mapRect: LogicalRect,
    safeGap: number,
    labelGapBoost: number,
    lockedGroups: LockedPlaceGroup[],
  ) => void;
  improveCorridorRisk: (
    orderedGroups: PendingPlaceGroup[],
    candidatePoolById: Map<string, PlacementCandidate[]>,
    state: PlacementState,
    mapRect: LogicalRect,
    safeGap: number,
    labelGapBoost: number,
    lockedGroups: LockedPlaceGroup[],
  ) => void;
  improveGroupRectOnlyPairs: (
    orderedGroups: PendingPlaceGroup[],
    candidatePoolById: Map<string, PlacementCandidate[]>,
    state: PlacementState,
    mapRect: LogicalRect,
    safeGap: number,
    labelGapBoost: number,
    lockedGroups: LockedPlaceGroup[],
  ) => void;
  improvePairCorridorRisk: (
    orderedGroups: PendingPlaceGroup[],
    candidatePoolById: Map<string, PlacementCandidate[]>,
    state: PlacementState,
    mapRect: LogicalRect,
    safeGap: number,
    labelGapBoost: number,
    lockedGroups: LockedPlaceGroup[],
  ) => void;
};

type RepairMetricReporter = SolverMetricReporter;
const LARGE_LAYOUT_REPAIR_GROUP_LIMIT = 20;

type RepairCoreDeps = {
  buildLine: (
    group: LineGroup,
    geometry: GroupGeometry,
  ) => {
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
  getGroupGap: (safeGap: number) => number;
  getLabelGap: (safeGap: number) => number;
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
  rectsOverlap: (a: LogicalRect, b: LogicalRect, gap: number) => boolean;
  scoreFinalLayoutEnvelope: (
    groups: PendingPlaceGroup[],
    geometryById: Map<string, GroupGeometry>,
  ) => number;
  resolveGroupGeometryAsWhole: (
    entries: Array<{ id: string; geometry: GroupGeometry }>,
    options: {
      gap: number;
      mapRect: LogicalRect;
      mapGap: number;
      labelGapBoost?: number;
      boundaryAnchorById?: Map<string, BoundaryAnchor>;
    },
  ) => Map<string, GroupGeometry>;
  segmentsIntersect: (
    a1: { x: number; y: number },
    a2: { x: number; y: number },
    b1: { x: number; y: number },
    b2: { x: number; y: number },
  ) => boolean;
};

type RepairConfig = {
  rebalanceIterationCount: number;
  radialRelaxPassLimit: number;
  corridorRepairGroupLimit: number;
  corridorRepairCandidateLimit: number;
  corridorRepairNearTailLimit: number;
  corridorRepairSpreadSampleCount: number;
  pairRepairGroupLimit: number;
  pairRepairPassLimit: number;
  pairRepairDeepSearchLimit: number;
  groupRectOnlyPairLimit: number;
  groupRectOnlyCandidateLimit: number;
};

type RepairRuntimeDeps = RepairCoreDeps & {
  config: RepairConfig;
};

export function buildGeometryMapForPlacements(
  deps: RepairCoreDeps,
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost = 0,
  lockedGroups: LockedPlaceGroup[] = [],
) {
  const boundaryAnchorById = new Map<string, BoundaryAnchor>();
  for (const group of groups) {
    boundaryAnchorById.set(group.placeKey, { x: group.logicalX, y: group.logicalY });
  }
  for (const group of lockedGroups) {
    boundaryAnchorById.set(group.placeKey, { x: group.logicalX, y: group.logicalY });
  }
  const entries = groups.flatMap((group) => {
    const placement = placementById.get(group.placeKey);
    if (!placement) return [];
    const geometry = deps.chooseBestGeometryForPlacement(group, placement, mapRect);
    return [{ id: group.placeKey, geometry }];
  });
  const resolved = deps.resolveGroupGeometryAsWhole(
    [
      ...lockedGroups.map((group) => ({ id: group.placeKey, geometry: group.geometry })),
      ...entries,
    ],
    { gap: deps.getGroupGap(safeGap), mapRect, mapGap: 0, labelGapBoost, boundaryAnchorById },
  );
  const geometryById = new Map<string, GroupGeometry>();
  for (const group of groups) {
    const geometry = resolved.get(group.placeKey);
    if (!geometry) continue;
    geometryById.set(group.placeKey, geometry);
  }
  return geometryById;
}

function hasBoundaryConflict(
  leftAnchor: BoundaryAnchor,
  leftGeometry: GroupGeometry,
  rightAnchor: BoundaryAnchor,
  rightGeometry: GroupGeometry,
  mapRect: LogicalRect,
) {
  return hasBoundaryLabelXConflictAtMaxScale(leftAnchor, leftGeometry, rightAnchor, rightGeometry, mapRect);
}

export function hasHardConflicts(
  deps: RepairCoreDeps,
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
    if (!deps.geometryFitsMap(geometry, mapRect)) return true;

    const line = deps.buildLine(group, geometry);
    const groupAnchor = { x: group.logicalX, y: group.logicalY };
    for (let neighborIndex = index + 1; neighborIndex < groups.length; neighborIndex++) {
      const neighbor = groups[neighborIndex];
      const neighborGeometry = geometryById.get(neighbor.placeKey);
      if (!neighborGeometry) return true;

      const photoOverlap = deps.rectOverlapsOccupiedPhotos(geometry.photoRect, [neighborGeometry], deps.getGroupGap(safeGap));
      const labelOverlap = deps.hasLabelCollisions(geometry, [neighborGeometry], deps.getLabelGap(safeGap));
      const photoLabelOverlap = deps.hasPhotoAgainstLabelCollisions(geometry, [neighborGeometry], deps.getLabelGap(safeGap));
      if (photoOverlap || labelOverlap || photoLabelOverlap) {
        return true;
      }

      if (
        hasBoundaryConflict(
          groupAnchor,
          geometry,
          { x: neighbor.logicalX, y: neighbor.logicalY },
          neighborGeometry,
          mapRect,
        )
      ) {
        return true;
      }

      const neighborLine = deps.buildLine(neighbor, neighborGeometry);
      if (deps.segmentsIntersect(line.start, line.end, neighborLine.start, neighborLine.end)) {
        return true;
      }
    }

    for (const locked of lockedGroups) {
      const photoOverlap = deps.rectOverlapsOccupiedPhotos(geometry.photoRect, [locked.geometry], deps.getGroupGap(safeGap));
      const labelOverlap = deps.hasLabelCollisions(geometry, [locked.geometry], deps.getLabelGap(safeGap));
      const photoLabelOverlap = deps.hasPhotoAgainstLabelCollisions(geometry, [locked.geometry], deps.getLabelGap(safeGap));
      if (photoOverlap || labelOverlap || photoLabelOverlap) {
        return true;
      }

      if (
        hasBoundaryConflict(
          groupAnchor,
          geometry,
          { x: locked.logicalX, y: locked.logicalY },
          locked.geometry,
          mapRect,
        )
      ) {
        return true;
      }

      const lockedLine = deps.buildLine(locked, locked.geometry);
      if (deps.segmentsIntersect(line.start, line.end, lockedLine.start, lockedLine.end)) {
        return true;
      }
    }
  }

  return false;
}

export function countCorridorRiskConflicts(
  deps: RepairCoreDeps,
  groups: PendingPlaceGroup[],
  geometryById: Map<string, GroupGeometry>,
  safeGap: number,
  mapRect: LogicalRect,
  lockedGroups: LockedPlaceGroup[] = [],
) {
  let risk = 0;
  const groupGap = Math.max(48, safeGap * 0.5);
  const labelGap = deps.getLabelGap(safeGap);

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
        deps.rectsOverlap(geometry.groupRect, neighborGeometry.groupRect, groupGap) ||
        deps.rectsOverlap(geometry.labelRect, neighborGeometry.photoRect, labelGap) ||
        deps.rectsOverlap(neighborGeometry.labelRect, geometry.photoRect, labelGap) ||
        deps.rectsOverlap(geometry.labelRect, neighborGeometry.labelRect, labelGap) ||
        hasBoundaryConflict(
          { x: group.logicalX, y: group.logicalY },
          geometry,
          { x: neighbor.logicalX, y: neighbor.logicalY },
          neighborGeometry,
          mapRect,
        )
      ) {
        risk += 1;
      }
    }

    for (const locked of lockedGroups) {
      if (
        deps.rectsOverlap(geometry.groupRect, locked.geometry.groupRect, groupGap) ||
        deps.rectsOverlap(geometry.labelRect, locked.geometry.photoRect, labelGap) ||
        deps.rectsOverlap(locked.geometry.labelRect, geometry.photoRect, labelGap) ||
        deps.rectsOverlap(geometry.labelRect, locked.geometry.labelRect, labelGap) ||
        hasBoundaryConflict(
          { x: group.logicalX, y: group.logicalY },
          geometry,
          { x: locked.logicalX, y: locked.logicalY },
          locked.geometry,
          mapRect,
        )
      ) {
        risk += 1;
      }
    }
  }

  return risk;
}

export function analyzePlacementState(
  deps: RepairCoreDeps,
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
  lockedGroups: LockedPlaceGroup[],
  options: PlacementAnalysisOptions = {},
) : PlacementAnalysis {
  const {
    includeCorridorRisk = true,
    includeLineCrossings = true,
  } = options;
  const geometryById = buildGeometryMapForPlacements(
    deps,
    groups,
    placementById,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  );
  return {
    geometryById,
    hasHardConflicts: hasHardConflicts(
      deps,
      groups,
      placementById,
      geometryById,
      mapRect,
      safeGap,
      lockedGroups,
    ),
    corridorRisk: includeCorridorRisk
      ? countCorridorRiskConflicts(
          deps,
          groups,
          geometryById,
          safeGap,
          mapRect,
          lockedGroups,
        )
      : 0,
    lineCrossings: includeLineCrossings
      ? deps.countPlacementLineCrossings(groups, placementById)
      : 0,
  };
}

export function buildCorridorRiskByGroup(
  deps: RepairCoreDeps,
  groups: PendingPlaceGroup[],
  geometryById: Map<string, GroupGeometry>,
  safeGap: number,
  mapRect: LogicalRect,
  lockedGroups: LockedPlaceGroup[] = [],
) {
  const riskByGroup = new Map<string, number>();
  const groupGap = Math.max(48, safeGap * 0.5);
  const labelGap = deps.getLabelGap(safeGap);

  const addRisk = (placeKey: string, amount: number) => {
    riskByGroup.set(placeKey, (riskByGroup.get(placeKey) ?? 0) + amount);
  };

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    const geometry = geometryById.get(group.placeKey);
    if (!geometry) {
      addRisk(group.placeKey, 1);
      continue;
    }

    for (let neighborIndex = index + 1; neighborIndex < groups.length; neighborIndex++) {
      const neighbor = groups[neighborIndex];
      const neighborGeometry = geometryById.get(neighbor.placeKey);
      if (!neighborGeometry) {
        addRisk(group.placeKey, 1);
        addRisk(neighbor.placeKey, 1);
        continue;
      }

      let pairRisk = 0;
      if (deps.rectsOverlap(geometry.groupRect, neighborGeometry.groupRect, groupGap)) pairRisk += 1;
      if (deps.rectsOverlap(geometry.labelRect, neighborGeometry.photoRect, labelGap)) pairRisk += 1;
      if (deps.rectsOverlap(neighborGeometry.labelRect, geometry.photoRect, labelGap)) pairRisk += 1;
      if (deps.rectsOverlap(geometry.labelRect, neighborGeometry.labelRect, labelGap)) pairRisk += 1;
      if (
        hasBoundaryConflict(
          { x: group.logicalX, y: group.logicalY },
          geometry,
          { x: neighbor.logicalX, y: neighbor.logicalY },
          neighborGeometry,
          mapRect,
        )
      ) {
        pairRisk += 2;
      }
      if (pairRisk > 0) {
        addRisk(group.placeKey, pairRisk);
        addRisk(neighbor.placeKey, pairRisk);
      }
    }

    for (const locked of lockedGroups) {
      let lockedRisk = 0;
      if (deps.rectsOverlap(geometry.groupRect, locked.geometry.groupRect, groupGap)) lockedRisk += 1;
      if (deps.rectsOverlap(geometry.labelRect, locked.geometry.photoRect, labelGap)) lockedRisk += 1;
      if (deps.rectsOverlap(locked.geometry.labelRect, geometry.photoRect, labelGap)) lockedRisk += 1;
      if (deps.rectsOverlap(geometry.labelRect, locked.geometry.labelRect, labelGap)) lockedRisk += 1;
      if (
        hasBoundaryConflict(
          { x: group.logicalX, y: group.logicalY },
          geometry,
          { x: locked.logicalX, y: locked.logicalY },
          locked.geometry,
          mapRect,
        )
      ) {
        lockedRisk += 2;
      }
      if (lockedRisk > 0) addRisk(group.placeKey, lockedRisk);
    }
  }

  return riskByGroup;
}

export function buildGroupRectRiskByGroup(
  deps: RepairCoreDeps,
  groups: PendingPlaceGroup[],
  geometryById: Map<string, GroupGeometry>,
  safeGap: number,
  lockedGroups: LockedPlaceGroup[] = [],
) {
  const riskByGroup = new Map<string, number>();
  const groupGap = Math.max(48, safeGap * 0.5);

  const addRisk = (placeKey: string, amount: number) => {
    riskByGroup.set(placeKey, (riskByGroup.get(placeKey) ?? 0) + amount);
  };

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    const geometry = geometryById.get(group.placeKey);
    if (!geometry) {
      addRisk(group.placeKey, 1);
      continue;
    }

    for (let neighborIndex = index + 1; neighborIndex < groups.length; neighborIndex++) {
      const neighbor = groups[neighborIndex];
      const neighborGeometry = geometryById.get(neighbor.placeKey);
      if (!neighborGeometry) {
        addRisk(group.placeKey, 1);
        addRisk(neighbor.placeKey, 1);
        continue;
      }
      if (deps.rectsOverlap(geometry.groupRect, neighborGeometry.groupRect, groupGap)) {
        addRisk(group.placeKey, 1);
        addRisk(neighbor.placeKey, 1);
      }
    }

    for (const locked of lockedGroups) {
      if (deps.rectsOverlap(geometry.groupRect, locked.geometry.groupRect, groupGap)) {
        addRisk(group.placeKey, 1);
      }
    }
  }

  return riskByGroup;
}

export function buildPairRepairTargets(
  deps: RepairRuntimeDeps,
  groups: PendingPlaceGroup[],
  geometryById: Map<string, GroupGeometry>,
  safeGap: number,
  lockedGroups: LockedPlaceGroup[] = [],
) {
  const targets: Array<{ leftKey: string; rightKey: string; score: number }> = [];
  const groupGap = Math.max(48, safeGap * 0.5);
  const labelGap = deps.getLabelGap(safeGap);

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    const geometry = geometryById.get(group.placeKey);
    if (!geometry) continue;

    for (let neighborIndex = index + 1; neighborIndex < groups.length; neighborIndex++) {
      const neighbor = groups[neighborIndex];
      const neighborGeometry = geometryById.get(neighbor.placeKey);
      if (!neighborGeometry) continue;

      let score = 0;
      if (deps.rectsOverlap(geometry.groupRect, neighborGeometry.groupRect, groupGap)) score += 4;
      if (deps.rectsOverlap(geometry.labelRect, neighborGeometry.photoRect, labelGap)) score += 2;
      if (deps.rectsOverlap(neighborGeometry.labelRect, geometry.photoRect, labelGap)) score += 2;
      if (deps.rectsOverlap(geometry.labelRect, neighborGeometry.labelRect, labelGap)) score += 1;
      if (score > 0) {
        targets.push({
          leftKey: group.placeKey,
          rightKey: neighbor.placeKey,
          score,
        });
      }
    }

    for (const locked of lockedGroups) {
      let score = 0;
      if (deps.rectsOverlap(geometry.groupRect, locked.geometry.groupRect, groupGap)) score += 4;
      if (deps.rectsOverlap(geometry.labelRect, locked.geometry.photoRect, labelGap)) score += 2;
      if (deps.rectsOverlap(locked.geometry.labelRect, geometry.photoRect, labelGap)) score += 2;
      if (deps.rectsOverlap(geometry.labelRect, locked.geometry.labelRect, labelGap)) score += 1;
      if (score > 0) {
        targets.push({
          leftKey: group.placeKey,
          rightKey: locked.placeKey,
          score,
        });
      }
    }
  }

  return targets
    .sort((left, right) => right.score - left.score || left.leftKey.localeCompare(right.leftKey, 'zh-CN') || left.rightKey.localeCompare(right.rightKey, 'zh-CN'))
    .slice(0, deps.config.pairRepairGroupLimit);
}

function buildConflictPairs(
  deps: RepairCoreDeps,
  groups: PendingPlaceGroup[],
  geometryById: Map<string, GroupGeometry>,
  safeGap: number,
  lockedGroups: LockedPlaceGroup[] = [],
) {
  const pairs: Array<{ leftKey: string; rightKey: string; score: number }> = [];
  const groupGap = Math.max(48, safeGap * 0.5);
  const labelGap = deps.getLabelGap(safeGap);

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    const geometry = geometryById.get(group.placeKey);
    if (!geometry) continue;

    for (let neighborIndex = index + 1; neighborIndex < groups.length; neighborIndex++) {
      const neighbor = groups[neighborIndex];
      const neighborGeometry = geometryById.get(neighbor.placeKey);
      if (!neighborGeometry) continue;

      const score = computePairConflictScore(deps, geometry, neighborGeometry, safeGap);
      if (score > 0) {
        pairs.push({
          leftKey: group.placeKey,
          rightKey: neighbor.placeKey,
          score,
        });
      }
    }

    for (const locked of lockedGroups) {
      const score = computePairConflictScore(deps, geometry, locked.geometry, safeGap);
      if (score > 0) {
        pairs.push({
          leftKey: group.placeKey,
          rightKey: locked.placeKey,
          score,
        });
      }
    }
  }

  return pairs.sort(
    (left, right) =>
      right.score - left.score ||
      left.leftKey.localeCompare(right.leftKey, 'zh-CN') ||
      left.rightKey.localeCompare(right.rightKey, 'zh-CN'),
  );
}

function computePairConflictScore(
  deps: RepairCoreDeps,
  leftGeometry: GroupGeometry,
  rightGeometry: GroupGeometry,
  safeGap: number,
) {
  const groupGap = Math.max(48, safeGap * 0.5);
  const labelGap = deps.getLabelGap(safeGap);
  let score = 0;
  if (deps.rectsOverlap(leftGeometry.groupRect, rightGeometry.groupRect, groupGap)) score += 4;
  if (deps.rectsOverlap(leftGeometry.labelRect, rightGeometry.photoRect, labelGap)) score += 2;
  if (deps.rectsOverlap(rightGeometry.labelRect, leftGeometry.photoRect, labelGap)) score += 2;
  if (deps.rectsOverlap(leftGeometry.labelRect, rightGeometry.labelRect, labelGap)) score += 1;
  return score;
}

function computeGlobalConflictScore(
  deps: RepairCoreDeps,
  groups: PendingPlaceGroup[],
  geometryById: Map<string, GroupGeometry>,
  safeGap: number,
  lockedGroups: LockedPlaceGroup[] = [],
) {
  let totalScore = 0;
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    const geometry = geometryById.get(group.placeKey);
    if (!geometry) {
      totalScore += 8;
      continue;
    }

    for (let neighborIndex = index + 1; neighborIndex < groups.length; neighborIndex++) {
      const neighbor = groups[neighborIndex];
      const neighborGeometry = geometryById.get(neighbor.placeKey);
      if (!neighborGeometry) {
        totalScore += 8;
        continue;
      }
      totalScore += computePairConflictScore(deps, geometry, neighborGeometry, safeGap);
    }

    for (const locked of lockedGroups) {
      totalScore += computePairConflictScore(deps, geometry, locked.geometry, safeGap);
    }
  }

  return totalScore;
}

function countConflictedPairs(
  deps: RepairCoreDeps,
  groups: PendingPlaceGroup[],
  geometryById: Map<string, GroupGeometry>,
  safeGap: number,
  lockedGroups: LockedPlaceGroup[] = [],
) {
  return buildConflictPairs(deps, groups, geometryById, safeGap, lockedGroups).length;
}

function buildRadialRelaxCandidates(
  placement: FootprintPlacement,
  outwardDirection: number,
) {
  const baseAngle = Math.atan2(placement.centerY, placement.centerX);
  const baseRadius = Math.max(180, Math.hypot(placement.centerX, placement.centerY));
  const radiusFactors = [1.04, 1.08, 1.12, 1.18];
  const angleOffsets = [0, outwardDirection * 4, -outwardDirection * 4, outwardDirection * 8, -outwardDirection * 8];
  const candidates: FootprintPlacement[] = [];

  for (const radiusFactor of radiusFactors) {
    const radius = baseRadius * radiusFactor;
    for (const angleOffset of angleOffsets) {
      const angle = baseAngle + (angleOffset * Math.PI) / 180;
      candidates.push({
        centerX: Math.cos(angle) * radius,
        centerY: Math.sin(angle) * radius,
      });
    }
  }

  return candidates;
}

function buildPairRelaxCandidates(
  outerPlacement: FootprintPlacement,
  innerPlacement: FootprintPlacement,
  outwardDirection: number,
) {
  const outerRadius = Math.max(180, Math.hypot(outerPlacement.centerX, outerPlacement.centerY));
  const innerAngle = Math.atan2(innerPlacement.centerY, innerPlacement.centerX);
  const outerAngle = Math.atan2(outerPlacement.centerY, outerPlacement.centerX);
  const anchorAngle = (innerAngle + outerAngle) * 0.5;
  const radiusFactors = [1.04, 1.08, 1.12, 1.18, 1.26];
  const angleOffsets = [
    0,
    outwardDirection * 6,
    -outwardDirection * 6,
    outwardDirection * 12,
    -outwardDirection * 12,
    outwardDirection * 18,
    -outwardDirection * 18,
  ];
  const candidates: FootprintPlacement[] = [];

  for (const radiusFactor of radiusFactors) {
    const radius = outerRadius * radiusFactor;
    for (const angleOffset of angleOffsets) {
      const angle = anchorAngle + (angleOffset * Math.PI) / 180;
      candidates.push({
        centerX: Math.cos(angle) * radius,
        centerY: Math.sin(angle) * radius,
      });
    }
  }

  return candidates;
}

function buildNormalSeparationCandidates(
  outerPlacement: FootprintPlacement,
  outerGeometry: GroupGeometry,
  innerGeometry: GroupGeometry,
  safeGap: number,
) {
  const targetGap = Math.max(48, safeGap * 0.5);
  const leftOverlap = innerGeometry.groupRect.right + targetGap - outerGeometry.groupRect.left;
  const rightOverlap = outerGeometry.groupRect.right + targetGap - innerGeometry.groupRect.left;
  const topOverlap = innerGeometry.groupRect.bottom + targetGap - outerGeometry.groupRect.top;
  const bottomOverlap = outerGeometry.groupRect.bottom + targetGap - innerGeometry.groupRect.top;

  const options = [
    { axis: 'x', delta: leftOverlap, sign: 1 },
    { axis: 'x', delta: rightOverlap, sign: -1 },
    { axis: 'y', delta: topOverlap, sign: 1 },
    { axis: 'y', delta: bottomOverlap, sign: -1 },
  ].filter((option) => option.delta > 0)
    .sort((left, right) => left.delta - right.delta);

  const candidates: FootprintPlacement[] = [];
  for (const option of options.slice(0, 2)) {
    const escapeDistance = option.delta + targetGap * 0.35;
    const dx = option.axis === 'x' ? escapeDistance * option.sign : 0;
    const dy = option.axis === 'y' ? escapeDistance * option.sign : 0;
    candidates.push({
      centerX: outerPlacement.centerX + dx,
      centerY: outerPlacement.centerY + dy,
    });
    candidates.push({
      centerX: outerPlacement.centerX + dx * 1.12,
      centerY: outerPlacement.centerY + dy * 1.12,
    });
  }

  return candidates;
}

function buildBoundaryEscapeCandidates(
  outerPlacement: FootprintPlacement,
  outerAnchor: BoundaryAnchor,
  outerGeometry: GroupGeometry,
  innerAnchor: BoundaryAnchor,
  innerGeometry: GroupGeometry,
  mapRect: LogicalRect,
) {
  const metrics = getBoundaryLabelXMetrics(
    outerAnchor,
    outerGeometry,
    innerAnchor,
    innerGeometry,
    mapRect,
  );
  if (!metrics || metrics.extraSeparationNeeded <= 0) return [];

  const dx = outerPlacement.centerX - outerAnchor.x;
  const dy = outerPlacement.centerY - outerAnchor.y;
  const radialLength = Math.max(1, Math.hypot(dx, dy));
  const horizontalUnit = Math.abs(dx) / radialLength;
  const requiredRadiusDelta = (metrics.extraSeparationNeeded + BOUNDARY_X_ESCAPE_PADDING) / Math.max(horizontalUnit, 0.35);
  const baseRadius = Math.max(180, Math.hypot(outerPlacement.centerX, outerPlacement.centerY));
  const baseAngle = Math.atan2(outerPlacement.centerY, outerPlacement.centerX);

  return [1, 1.18, 1.36].flatMap((factor) => {
    const radius = baseRadius + requiredRadiusDelta * factor;
    return [0, -6, 6, -12, 12].map((angleOffset) => {
      const angle = baseAngle + (angleOffset * Math.PI) / 180;
      return {
        centerX: Math.cos(angle) * radius,
        centerY: Math.sin(angle) * radius,
      };
    });
  });
}

function buildLocalClusterKeys(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  leftKey: string,
  rightKey: string,
) {
  const anchorPlacement = placementById.get(leftKey);
  const partnerPlacement = placementById.get(rightKey);
  if (!anchorPlacement || !partnerPlacement) return [leftKey, rightKey];

  const anchorCenter = {
    x: (anchorPlacement.centerX + partnerPlacement.centerX) * 0.5,
    y: (anchorPlacement.centerY + partnerPlacement.centerY) * 0.5,
  };

  return [...groups]
    .map((group) => {
      const placement = placementById.get(group.placeKey);
      if (!placement) return null;
      return {
        key: group.placeKey,
        distance: Math.hypot(
          placement.centerX - anchorCenter.x,
          placement.centerY - anchorCenter.y,
        ),
      };
    })
    .filter((entry): entry is { key: string; distance: number } => Boolean(entry))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 5)
    .map((entry) => entry.key);
}

type PairDirectionAnalysis = {
  radialDirection: { x: number; y: number };
  tangentDirection: { x: number; y: number };
  tangentSign: number;
  requiredDistance: number;
};

const BOUNDARY_X_ESCAPE_PADDING = 12;

function normalizeVector(dx: number, dy: number) {
  const length = Math.hypot(dx, dy);
  if (length <= 1e-6) {
    return { x: 1, y: 0 };
  }
  return { x: dx / length, y: dy / length };
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

function computePlacementDriftPenalty(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  focusKeys?: string[],
) {
  let penalty = 0;
  for (const group of groups) {
    if (focusKeys && !focusKeys.includes(group.placeKey)) continue;
    const placement = placementById.get(group.placeKey);
    if (!placement) continue;
    const sourceAngle = Math.atan2(group.logicalY, group.logicalX);
    const placedAngle = Math.atan2(placement.centerY, placement.centerX);
    const drift = Math.abs(angleDelta(placedAngle, sourceAngle));
    penalty += drift;
  }
  return penalty;
}

function computeLocalAngleBalancePenalty(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  anchorKey: string,
) {
  const anchorPlacement = placementById.get(anchorKey);
  const anchorGroup = groups.find((group) => group.placeKey === anchorKey);
  if (!anchorPlacement || !anchorGroup) return Number.POSITIVE_INFINITY;

  const anchorAngle = Math.atan2(anchorPlacement.centerY, anchorPlacement.centerX);
  const relevant = groups
    .map((group) => {
      const placement = placementById.get(group.placeKey);
      if (!placement) return null;
      const angle = Math.atan2(placement.centerY, placement.centerX);
      const gap = Math.abs(angleDelta(angle, anchorAngle));
      return { key: group.placeKey, angle, gap };
    })
    .filter((entry): entry is { key: string; angle: number; gap: number } => Boolean(entry))
    .filter((entry) => entry.gap <= Math.PI / 4)
    .sort((left, right) => left.angle - right.angle);

  if (relevant.length <= 2) return 0;

  let penalty = 0;
  for (let index = 1; index < relevant.length - 1; index++) {
    const previous = relevant[index - 1]!;
    const current = relevant[index]!;
    const next = relevant[index + 1]!;
    const leftGap = Math.abs(angleDelta(current.angle, previous.angle));
    const rightGap = Math.abs(angleDelta(next.angle, current.angle));
    penalty += Math.abs(leftGap - rightGap);
  }
  return penalty;
}

function analyzePairDirection(
  deps: RepairCoreDeps,
  outerPlacement: FootprintPlacement,
  innerPlacement: FootprintPlacement,
  outerGeometry: GroupGeometry,
  innerGeometry: GroupGeometry,
  safeGap: number,
) : PairDirectionAnalysis {
  const outerCenter = {
    x: (outerGeometry.groupRect.left + outerGeometry.groupRect.right) * 0.5,
    y: (outerGeometry.groupRect.top + outerGeometry.groupRect.bottom) * 0.5,
  };
  const innerCenter = {
    x: (innerGeometry.groupRect.left + innerGeometry.groupRect.right) * 0.5,
    y: (innerGeometry.groupRect.top + innerGeometry.groupRect.bottom) * 0.5,
  };
  const radialDirection = normalizeVector(
    outerPlacement.centerX - innerPlacement.centerX,
    outerPlacement.centerY - innerPlacement.centerY,
  );
  const tangentDirection = { x: -radialDirection.y, y: radialDirection.x };

  const groupGap = Math.max(48, safeGap * 0.5);
  const labelGap = deps.getLabelGap(safeGap);
  const overlapX = Math.max(
    0,
    Math.min(outerGeometry.groupRect.right, innerGeometry.groupRect.right) -
      Math.max(outerGeometry.groupRect.left, innerGeometry.groupRect.left) +
      groupGap,
  );
  const overlapY = Math.max(
    0,
    Math.min(outerGeometry.groupRect.bottom, innerGeometry.groupRect.bottom) -
      Math.max(outerGeometry.groupRect.top, innerGeometry.groupRect.top) +
      groupGap,
  );
  const labelToPhotoInner = deps.rectsOverlap(outerGeometry.labelRect, innerGeometry.photoRect, labelGap);
  const labelToPhotoOuter = deps.rectsOverlap(innerGeometry.labelRect, outerGeometry.photoRect, labelGap);
  const tangentSignSource = (outerCenter.x - innerCenter.x) * tangentDirection.x +
    (outerCenter.y - innerCenter.y) * tangentDirection.y;

  let requiredDistance = Math.max(overlapX, overlapY, groupGap);
  if (labelToPhotoInner || labelToPhotoOuter) {
    requiredDistance = Math.max(requiredDistance, labelGap * 1.1);
  }

  return {
    radialDirection,
    tangentDirection,
    tangentSign: tangentSignSource >= 0 ? 1 : -1,
    requiredDistance,
  };
}

function buildExpandableNeighborhood(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  anchorKeys: string[],
  analysis: PairDirectionAnalysis,
) {
  const anchorPlacements = anchorKeys
    .map((key) => placementById.get(key))
    .filter((placement): placement is FootprintPlacement => Boolean(placement));
  const anchorRadius = anchorPlacements.length > 0
    ? Math.min(...anchorPlacements.map((placement) => Math.hypot(placement.centerX, placement.centerY)))
    : 0;
  const anchorAngle = anchorPlacements.length > 0
    ? anchorPlacements.reduce((sum, placement) => sum + Math.atan2(placement.centerY, placement.centerX), 0) / anchorPlacements.length
    : 0;

  return [...groups]
    .map((group) => {
      const placement = placementById.get(group.placeKey);
      if (!placement) return null;
      const radius = Math.hypot(placement.centerX, placement.centerY);
      const angle = Math.atan2(placement.centerY, placement.centerX);
      let angleGap = Math.abs(angle - anchorAngle) % (Math.PI * 2);
      if (angleGap > Math.PI) angleGap = Math.PI * 2 - angleGap;
      const tangentialProjection = placement.centerX * analysis.tangentDirection.x + placement.centerY * analysis.tangentDirection.y;
      return {
        key: group.placeKey,
        radius,
        angleGap,
        tangentialProjection,
      };
    })
    .filter((entry): entry is { key: string; radius: number; angleGap: number; tangentialProjection: number } => Boolean(entry))
    .filter((entry) => entry.radius >= anchorRadius - 1e-6 && entry.angleGap <= Math.PI / 4)
    .sort((left, right) => left.radius - right.radius || left.angleGap - right.angleGap)
    .map((entry) => entry.key);
}

function buildClusterRelaxPlacements(
  clusterKeys: string[],
  placementById: Map<string, FootprintPlacement>,
  analysis: PairDirectionAnalysis,
) {
  const variants: Array<Map<string, FootprintPlacement>> = [];
  const stepMultipliers = [1, 1.5, 2.25, 3.5, 5, 7];
  const tangentFactors = [0];

  for (const stepMultiplier of stepMultipliers) {
    for (const tangentFactor of tangentFactors) {
      const variant = new Map<string, FootprintPlacement>();
      clusterKeys.forEach((key, index) => {
        const placement = placementById.get(key);
        if (!placement) return;
        const chainFactor = 1 + index * 0.55;
        const radialDelta = analysis.requiredDistance * stepMultiplier * chainFactor;
        variant.set(key, {
          centerX: placement.centerX + analysis.radialDirection.x * radialDelta,
          centerY: placement.centerY + analysis.radialDirection.y * radialDelta,
        });
      });
      variants.push(variant);
    }
  }

  return variants;
}

export function relaxRadialSpacing(
  deps: RepairRuntimeDeps,
  orderedGroups: PendingPlaceGroup[],
  state: PlacementState,
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
  lockedGroups: LockedPlaceGroup[],
) {
  let geometryById = buildGeometryMapForPlacements(
    deps,
    orderedGroups,
    state.placementById,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  );
  let corridorRisk = countCorridorRiskConflicts(
    deps,
    orderedGroups,
    geometryById,
    safeGap,
    mapRect,
    lockedGroups,
  );
  let hardConflicts = hasHardConflicts(
    deps,
    orderedGroups,
    state.placementById,
    geometryById,
    mapRect,
    safeGap,
    lockedGroups,
  );
  let placementLineCrossings = deps.countPlacementLineCrossings(orderedGroups, state.placementById);
  let globalConflictScore = computeGlobalConflictScore(
    deps,
    orderedGroups,
    geometryById,
    safeGap,
    lockedGroups,
  );
  let conflictedPairCount = countConflictedPairs(
    deps,
    orderedGroups,
    geometryById,
    safeGap,
    lockedGroups,
  );

  for (let pass = 0; pass < deps.config.radialRelaxPassLimit; pass++) {
    const conflictPairs = buildConflictPairs(deps, orderedGroups, geometryById, safeGap, lockedGroups);
    if (conflictPairs.length === 0) return;

    let changed = false;
    for (const pair of conflictPairs) {
      const leftPlacement = state.placementById.get(pair.leftKey);
      const rightPlacement = state.placementById.get(pair.rightKey);
      if (!leftPlacement || !rightPlacement) continue;

      const leftRadius = Math.hypot(leftPlacement.centerX, leftPlacement.centerY);
      const rightRadius = Math.hypot(rightPlacement.centerX, rightPlacement.centerY);
      const outerKey = leftRadius >= rightRadius ? pair.leftKey : pair.rightKey;
      const innerKey = outerKey === pair.leftKey ? pair.rightKey : pair.leftKey;
      const outerPlacement = state.placementById.get(outerKey);
      const innerPlacement = state.placementById.get(innerKey);
      if (!outerPlacement || !innerPlacement) continue;

      const outerAngle = Math.atan2(outerPlacement.centerY, outerPlacement.centerX);
      const innerAngle = Math.atan2(innerPlacement.centerY, innerPlacement.centerX);
      const angleDelta = outerAngle - innerAngle;
      const outwardDirection = angleDelta >= 0 ? 1 : -1;
      const candidatePlacements = buildRadialRelaxCandidates(outerPlacement, outwardDirection);

      let bestPlacement: FootprintPlacement | null = null;
      let bestGeometryById: Map<string, GroupGeometry> | null = null;
      let bestHardConflicts = hardConflicts;
      let bestCorridorRisk = corridorRisk;
      let bestLineCrossings = placementLineCrossings;
      let bestGlobalConflictScore = globalConflictScore;
      let bestDriftPenalty = computePlacementDriftPenalty(orderedGroups, state.placementById, [outerKey]);
      let bestBalancePenalty = computeLocalAngleBalancePenalty(orderedGroups, state.placementById, outerKey);

      for (const candidatePlacement of candidatePlacements) {
        const placementById = new Map(state.placementById);
        placementById.set(outerKey, candidatePlacement);

        const candidateLineCrossings = deps.countPlacementLineCrossings(orderedGroups, placementById);
        if (orderedGroups.length >= 20 && candidateLineCrossings > placementLineCrossings) continue;

        const candidateGeometryById = buildGeometryMapForPlacements(
          deps,
          orderedGroups,
          placementById,
          mapRect,
          safeGap,
          labelGapBoost,
          lockedGroups,
        );
        const candidateHardConflicts = hasHardConflicts(
          deps,
          orderedGroups,
          placementById,
          candidateGeometryById,
          mapRect,
          safeGap,
          lockedGroups,
        );
        const candidateCorridorRisk = countCorridorRiskConflicts(
          deps,
          orderedGroups,
          candidateGeometryById,
          safeGap,
          mapRect,
          lockedGroups,
        );
        const candidateGlobalConflictScore = computeGlobalConflictScore(
          deps,
          orderedGroups,
          candidateGeometryById,
          safeGap,
          lockedGroups,
        );
        const candidateDriftPenalty = computePlacementDriftPenalty(orderedGroups, placementById, [outerKey]);
        const candidateBalancePenalty = computeLocalAngleBalancePenalty(orderedGroups, placementById, outerKey);

        const isBetter =
          (!candidateHardConflicts && bestHardConflicts) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings < bestLineCrossings) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidateCorridorRisk < bestCorridorRisk) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidateCorridorRisk === bestCorridorRisk &&
            candidateGlobalConflictScore < bestGlobalConflictScore) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidateCorridorRisk === bestCorridorRisk &&
            candidateGlobalConflictScore === bestGlobalConflictScore &&
            candidateDriftPenalty < bestDriftPenalty) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidateCorridorRisk === bestCorridorRisk &&
            candidateGlobalConflictScore === bestGlobalConflictScore &&
            candidateDriftPenalty === bestDriftPenalty &&
            candidateBalancePenalty < bestBalancePenalty);

        if (!isBetter) continue;

        bestPlacement = candidatePlacement;
        bestGeometryById = candidateGeometryById;
        bestHardConflicts = candidateHardConflicts;
        bestCorridorRisk = candidateCorridorRisk;
        bestLineCrossings = candidateLineCrossings;
        bestGlobalConflictScore = candidateGlobalConflictScore;
        bestDriftPenalty = candidateDriftPenalty;
        bestBalancePenalty = candidateBalancePenalty;
      }

      if (!bestPlacement || !bestGeometryById) continue;
      state.placementById.set(outerKey, bestPlacement);
      geometryById = bestGeometryById;
      hardConflicts = bestHardConflicts;
      corridorRisk = bestCorridorRisk;
      placementLineCrossings = bestLineCrossings;
      globalConflictScore = bestGlobalConflictScore;
      changed = true;
      break;
    }

    if (!changed) return;
    if (!hardConflicts && corridorRisk === 0) return;
  }
}

function computeTrackedResidualScore(
  deps: RepairCoreDeps,
  pairTargets: Array<{ leftKey: string; rightKey: string; score: number }>,
  geometryById: Map<string, GroupGeometry>,
  safeGap: number,
) {
  let totalScore = 0;
  for (const pair of pairTargets) {
    const leftGeometry = geometryById.get(pair.leftKey);
    const rightGeometry = geometryById.get(pair.rightKey);
    if (!leftGeometry || !rightGeometry) {
      totalScore += pair.score;
      continue;
    }
    totalScore += computePairConflictScore(deps, leftGeometry, rightGeometry, safeGap);
  }
  return totalScore;
}

function computeIncidentConflictScore(
  deps: RepairCoreDeps,
  groups: PendingPlaceGroup[],
  geometryById: Map<string, GroupGeometry>,
  safeGap: number,
  incidentKeys: Set<string>,
) {
  let totalScore = 0;
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]!;
    if (!incidentKeys.has(group.placeKey)) continue;
    const geometry = geometryById.get(group.placeKey);
    if (!geometry) {
      totalScore += 8;
      continue;
    }

    for (let neighborIndex = 0; neighborIndex < groups.length; neighborIndex++) {
      if (neighborIndex === index) continue;
      const neighbor = groups[neighborIndex]!;
      const neighborGeometry = geometryById.get(neighbor.placeKey);
      if (!neighborGeometry) {
        totalScore += 8;
        continue;
      }
      totalScore += computePairConflictScore(
        deps,
        geometry,
        neighborGeometry,
        safeGap,
      );
    }
  }

  return totalScore;
}

function buildDeepPairRepairCandidateSubset(
  candidates: PlacementCandidate[],
  limit: number,
) {
  if (candidates.length <= limit) {
    return candidates;
  }

  const subset: PlacementCandidate[] = [];
  const usedIndexes = new Set<number>();
  const addByIndex = (index: number) => {
    if (index < 0 || index >= candidates.length || usedIndexes.has(index)) return;
    usedIndexes.add(index);
    subset.push(candidates[index]!);
  };

  const headLimit = Math.min(8, candidates.length, limit);
  for (let index = 0; index < headLimit; index++) {
    addByIndex(index);
  }

  const remaining = limit - subset.length;
  if (remaining <= 0) return subset;

  const tailCount = candidates.length - headLimit;
  const sampleCount = Math.min(remaining, tailCount);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    const ratio = sampleCount === 1 ? 1 : sampleIndex / (sampleCount - 1);
    const index = headLimit + Math.round(ratio * Math.max(0, tailCount - 1));
    addByIndex(index);
  }

  return subset;
}

export function buildGroupRectOnlyPairTargets(
  deps: RepairRuntimeDeps,
  groups: PendingPlaceGroup[],
  geometryById: Map<string, GroupGeometry>,
  safeGap: number,
) {
  const targets: Array<{ leftKey: string; rightKey: string }> = [];
  const groupGap = Math.max(48, safeGap * 0.5);
  const labelGap = deps.getLabelGap(safeGap);

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    const geometry = geometryById.get(group.placeKey);
    if (!geometry) continue;

    for (let neighborIndex = index + 1; neighborIndex < groups.length; neighborIndex++) {
      const neighbor = groups[neighborIndex];
      const neighborGeometry = geometryById.get(neighbor.placeKey);
      if (!neighborGeometry) continue;

      const groupRect = deps.rectsOverlap(geometry.groupRect, neighborGeometry.groupRect, groupGap);
      const leftLabelToRightPhoto = deps.rectsOverlap(geometry.labelRect, neighborGeometry.photoRect, labelGap);
      const rightLabelToLeftPhoto = deps.rectsOverlap(neighborGeometry.labelRect, geometry.photoRect, labelGap);
      const labelLabel = deps.rectsOverlap(geometry.labelRect, neighborGeometry.labelRect, labelGap);

      if (groupRect && !leftLabelToRightPhoto && !rightLabelToLeftPhoto && !labelLabel) {
        targets.push({
          leftKey: group.placeKey,
          rightKey: neighbor.placeKey,
        });
      }
    }
  }

  return targets.slice(0, deps.config.groupRectOnlyPairLimit);
}

export function selectCorridorRepairTargets(
  deps: RepairRuntimeDeps,
  groups: PendingPlaceGroup[],
  geometryById: Map<string, GroupGeometry>,
  mapRect: LogicalRect,
  safeGap: number,
  lockedGroups: LockedPlaceGroup[] = [],
) {
  const riskByGroup = buildCorridorRiskByGroup(deps, groups, geometryById, safeGap, mapRect, lockedGroups);
  return [...groups]
    .map((group) => ({
      placeKey: group.placeKey,
      risk: riskByGroup.get(group.placeKey) ?? 0,
    }))
    .filter((entry) => entry.risk > 0)
    .sort((left, right) => right.risk - left.risk || left.placeKey.localeCompare(right.placeKey, 'zh-CN'))
    .slice(0, deps.config.corridorRepairGroupLimit)
    .map((entry) => entry.placeKey);
}

export function buildCorridorRepairCandidateSubset(
  deps: Pick<RepairRuntimeDeps, 'config'>,
  candidates: PlacementCandidate[],
) {
  if (candidates.length <= deps.config.corridorRepairCandidateLimit) {
    return candidates;
  }

  const subset: PlacementCandidate[] = [];
  const usedIndexes = new Set<number>();
  const addByIndex = (index: number) => {
    if (index < 0 || index >= candidates.length || usedIndexes.has(index)) return;
    usedIndexes.add(index);
    subset.push(candidates[index]!);
  };

  for (let index = 0; index < Math.min(deps.config.corridorRepairCandidateLimit, candidates.length); index++) {
    addByIndex(index);
  }

  for (
    let index = deps.config.corridorRepairCandidateLimit;
    index < Math.min(candidates.length, deps.config.corridorRepairCandidateLimit + deps.config.corridorRepairNearTailLimit);
    index++
  ) {
    addByIndex(index);
  }

  const tailStart = Math.min(
    candidates.length,
    deps.config.corridorRepairCandidateLimit + deps.config.corridorRepairNearTailLimit,
  );
  const tailCount = candidates.length - tailStart;
  const sampleCount = Math.min(deps.config.corridorRepairSpreadSampleCount, tailCount);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    const ratio = sampleCount === 1 ? 1 : sampleIndex / (sampleCount - 1);
    const index = tailStart + Math.round(ratio * (tailCount - 1));
    addByIndex(index);
  }

  return subset;
}

export function improveCorridorRisk(
  deps: RepairRuntimeDeps,
  orderedGroups: PendingPlaceGroup[],
  candidatePoolById: Map<string, PlacementCandidate[]>,
  state: PlacementState,
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
  lockedGroups: LockedPlaceGroup[],
) {
  let geometryById = buildGeometryMapForPlacements(
    deps,
    orderedGroups,
    state.placementById,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  );
  let hardConflicts = hasHardConflicts(
    deps,
    orderedGroups,
    state.placementById,
    geometryById,
    mapRect,
    safeGap,
    lockedGroups,
  );
  let corridorRisk = countCorridorRiskConflicts(
    deps,
    orderedGroups,
    geometryById,
    safeGap,
    mapRect,
    lockedGroups,
  );
  if (corridorRisk === 0) return;
  let envelopeScore = deps.scoreFinalLayoutEnvelope(orderedGroups, geometryById);
  let placementLineCrossings = deps.countPlacementLineCrossings(orderedGroups, state.placementById);
  let riskByGroup = buildCorridorRiskByGroup(deps, orderedGroups, geometryById, safeGap, mapRect, lockedGroups);
  let groupRectRiskByGroup = buildGroupRectRiskByGroup(deps, orderedGroups, geometryById, safeGap, lockedGroups);

  for (let iteration = 0; iteration < deps.config.rebalanceIterationCount; iteration++) {
    let changed = false;
    const targetKeys = new Set(
      selectCorridorRepairTargets(deps, orderedGroups, geometryById, mapRect, safeGap, lockedGroups),
    );
    if (targetKeys.size === 0) break;

    for (const group of orderedGroups) {
      if (!targetKeys.has(group.placeKey)) continue;
      const currentPlacement = state.placementById.get(group.placeKey);
      if (!currentPlacement) continue;

      const candidates = buildCorridorRepairCandidateSubset(
        deps,
        candidatePoolById.get(group.placeKey) ?? [],
      );
      let bestPlacement = currentPlacement;
      let bestIndex = state.candidateIndexById.get(group.placeKey) ?? 0;
      let bestGeometry = geometryById;
      let bestHardConflicts = hardConflicts;
      let bestCorridorRisk = corridorRisk;
      let bestEnvelopeScore = envelopeScore;
      let bestTargetGroupRisk = riskByGroup.get(group.placeKey) ?? 0;
      let bestTargetGroupRectRisk = groupRectRiskByGroup.get(group.placeKey) ?? 0;

      for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index];
        if (!candidate) continue;

        const placementById = new Map(state.placementById);
        placementById.set(group.placeKey, candidate.placement);
        const candidateGeometryById = buildGeometryMapForPlacements(
          deps,
          orderedGroups,
          placementById,
          mapRect,
          safeGap,
          labelGapBoost,
          lockedGroups,
        );
        const candidateHardConflicts = hasHardConflicts(
          deps,
          orderedGroups,
          placementById,
          candidateGeometryById,
          mapRect,
          safeGap,
          lockedGroups,
        );
        const candidateCorridorRisk = countCorridorRiskConflicts(
          deps,
          orderedGroups,
          candidateGeometryById,
          safeGap,
          mapRect,
          lockedGroups,
        );
        const candidateRiskByGroup = buildCorridorRiskByGroup(
          deps,
          orderedGroups,
          candidateGeometryById,
          safeGap,
          mapRect,
          lockedGroups,
        );
        const candidateTargetGroupRisk = candidateRiskByGroup.get(group.placeKey) ?? 0;
        const candidateGroupRectRiskByGroup = buildGroupRectRiskByGroup(
          deps,
          orderedGroups,
          candidateGeometryById,
          safeGap,
          lockedGroups,
        );
        const candidateTargetGroupRectRisk = candidateGroupRectRiskByGroup.get(group.placeKey) ?? 0;
        const candidatePlacementLineCrossings = deps.countPlacementLineCrossings(
          orderedGroups,
          placementById,
        );
        const candidateEnvelopeScore = deps.scoreFinalLayoutEnvelope(
          orderedGroups,
          candidateGeometryById,
        );
        const increasesLineCrossings = (
          orderedGroups.length >= 20 &&
          candidatePlacementLineCrossings > placementLineCrossings
        );

        if (increasesLineCrossings) continue;

        const isBetter =
          (!candidateHardConflicts && bestHardConflicts) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidatePlacementLineCrossings < placementLineCrossings) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidatePlacementLineCrossings === placementLineCrossings &&
            candidateTargetGroupRectRisk < bestTargetGroupRectRisk) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidatePlacementLineCrossings === placementLineCrossings &&
            candidateTargetGroupRectRisk === bestTargetGroupRectRisk &&
            candidateTargetGroupRisk < bestTargetGroupRisk) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidatePlacementLineCrossings === placementLineCrossings &&
            candidateTargetGroupRectRisk === bestTargetGroupRectRisk &&
            candidateTargetGroupRisk === bestTargetGroupRisk &&
            candidateCorridorRisk < bestCorridorRisk) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidatePlacementLineCrossings === placementLineCrossings &&
            candidateTargetGroupRectRisk === bestTargetGroupRectRisk &&
            candidateTargetGroupRisk === bestTargetGroupRisk &&
            candidateCorridorRisk === bestCorridorRisk &&
            candidateEnvelopeScore < bestEnvelopeScore - 1e-6);

        if (!isBetter) continue;

        bestPlacement = candidate.placement;
        bestIndex = index;
        bestGeometry = candidateGeometryById;
        bestHardConflicts = candidateHardConflicts;
        bestCorridorRisk = candidateCorridorRisk;
        bestTargetGroupRectRisk = candidateTargetGroupRectRisk;
        bestTargetGroupRisk = candidateTargetGroupRisk;
        placementLineCrossings = candidatePlacementLineCrossings;
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
        riskByGroup = buildCorridorRiskByGroup(deps, orderedGroups, geometryById, safeGap, mapRect, lockedGroups);
        groupRectRiskByGroup = buildGroupRectRiskByGroup(deps, orderedGroups, geometryById, safeGap, lockedGroups);
        envelopeScore = bestEnvelopeScore;
        changed = true;
      }
    }

    if (!changed) break;
  }
}

export function improveGroupRectOnlyPairs(
  deps: RepairRuntimeDeps,
  orderedGroups: PendingPlaceGroup[],
  candidatePoolById: Map<string, PlacementCandidate[]>,
  state: PlacementState,
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
  lockedGroups: LockedPlaceGroup[],
) {
  let geometryById = buildGeometryMapForPlacements(
    deps,
    orderedGroups,
    state.placementById,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  );
  let corridorRisk = countCorridorRiskConflicts(
    deps,
    orderedGroups,
    geometryById,
    safeGap,
    mapRect,
    lockedGroups,
  );
  let hardConflicts = hasHardConflicts(
    deps,
    orderedGroups,
    state.placementById,
    geometryById,
    mapRect,
    safeGap,
    lockedGroups,
  );
  let placementLineCrossings = deps.countPlacementLineCrossings(orderedGroups, state.placementById);
  let globalConflictScore = computeGlobalConflictScore(
    deps,
    orderedGroups,
    geometryById,
    safeGap,
    lockedGroups,
  );
  const maxPasses = Math.max(1, deps.config.groupRectOnlyPairLimit);
  for (let pass = 0; pass < maxPasses; pass++) {
    const pairTargets = buildGroupRectOnlyPairTargets(deps, orderedGroups, geometryById, safeGap);
    if (pairTargets.length === 0) return;

    let committed = false;
    for (const pair of pairTargets) {
      const leftCandidates = (candidatePoolById.get(pair.leftKey) ?? []).slice(0, deps.config.groupRectOnlyCandidateLimit);
      const rightCandidates = (candidatePoolById.get(pair.rightKey) ?? []).slice(0, deps.config.groupRectOnlyCandidateLimit);
      let bestPlacementById: Map<string, FootprintPlacement> | null = null;
      let bestGeometryById: Map<string, GroupGeometry> | null = null;
      let bestCorridorRisk = corridorRisk;
      let bestHardConflicts = hardConflicts;
      let bestLineCrossings = placementLineCrossings;
      let bestGlobalConflictScore = globalConflictScore;
      let foundResolved = false;

      for (const leftCandidate of leftCandidates) {
        for (const rightCandidate of rightCandidates) {
          const placementById = new Map(state.placementById);
          placementById.set(pair.leftKey, leftCandidate.placement);
          placementById.set(pair.rightKey, rightCandidate.placement);
          const candidateLineCrossings = deps.countPlacementLineCrossings(
            orderedGroups,
            placementById,
          );
          if (orderedGroups.length >= 20 && candidateLineCrossings > placementLineCrossings) continue;

          const candidateGeometryById = buildGeometryMapForPlacements(
            deps,
            orderedGroups,
            placementById,
            mapRect,
            safeGap,
            labelGapBoost,
            lockedGroups,
          );
          const candidateCorridorRisk = countCorridorRiskConflicts(
            deps,
            orderedGroups,
            candidateGeometryById,
            safeGap,
            mapRect,
            lockedGroups,
          );
          const candidateHardConflicts = hasHardConflicts(
            deps,
            orderedGroups,
            placementById,
            candidateGeometryById,
            mapRect,
            safeGap,
            lockedGroups,
          );
          const candidateGlobalConflictScore = computeGlobalConflictScore(
            deps,
            orderedGroups,
            candidateGeometryById,
            safeGap,
            lockedGroups,
          );
          const groupGap = Math.max(48, safeGap * 0.5);
          const leftGeometry = candidateGeometryById.get(pair.leftKey);
          const rightGeometry = candidateGeometryById.get(pair.rightKey);
          if (!leftGeometry || !rightGeometry) continue;
          const resolvesGroupRect = !deps.rectsOverlap(leftGeometry.groupRect, rightGeometry.groupRect, groupGap);
          if (!resolvesGroupRect) continue;

          const isBetter =
            !foundResolved ||
            (!candidateHardConflicts && bestHardConflicts) ||
            candidateLineCrossings < bestLineCrossings ||
            (
              candidateHardConflicts === bestHardConflicts &&
              candidateLineCrossings === bestLineCrossings &&
              candidateCorridorRisk === bestCorridorRisk &&
              candidateGlobalConflictScore < bestGlobalConflictScore
            ) ||
            (
              candidateHardConflicts === bestHardConflicts &&
              candidateLineCrossings === bestLineCrossings &&
              candidateCorridorRisk < bestCorridorRisk
            );

          if (!isBetter) continue;

          bestPlacementById = placementById;
          bestGeometryById = candidateGeometryById;
          bestCorridorRisk = candidateCorridorRisk;
          bestHardConflicts = candidateHardConflicts;
          bestLineCrossings = candidateLineCrossings;
          bestGlobalConflictScore = candidateGlobalConflictScore;
          foundResolved = true;
        }
      }

      if (!bestPlacementById || !bestGeometryById) continue;
      state.placementById = bestPlacementById;
      geometryById = bestGeometryById;
      corridorRisk = bestCorridorRisk;
      hardConflicts = bestHardConflicts;
      placementLineCrossings = bestLineCrossings;
      globalConflictScore = bestGlobalConflictScore;
      committed = true;
      break;
    }

    if (!committed) {
      return;
    }
  }
}

export function improvePairCorridorRisk(
  deps: RepairRuntimeDeps,
  orderedGroups: PendingPlaceGroup[],
  candidatePoolById: Map<string, PlacementCandidate[]>,
  state: PlacementState,
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
  lockedGroups: LockedPlaceGroup[],
) {
  void candidatePoolById;
  let geometryById = buildGeometryMapForPlacements(
    deps,
    orderedGroups,
    state.placementById,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  );
  let hardConflicts = hasHardConflicts(
    deps,
    orderedGroups,
    state.placementById,
    geometryById,
    mapRect,
    safeGap,
    lockedGroups,
  );
  let corridorRisk = countCorridorRiskConflicts(
    deps,
    orderedGroups,
    geometryById,
    safeGap,
    mapRect,
    lockedGroups,
  );
  let placementLineCrossings = deps.countPlacementLineCrossings(orderedGroups, state.placementById);
  let globalConflictScore = computeGlobalConflictScore(
    deps,
    orderedGroups,
    geometryById,
    safeGap,
    lockedGroups,
  );
  let conflictedPairCount = countConflictedPairs(
    deps,
    orderedGroups,
    geometryById,
    safeGap,
    lockedGroups,
  );

  for (let pass = 0; pass < deps.config.pairRepairPassLimit; pass++) {
    const pairTargets = buildConflictPairs(deps, orderedGroups, geometryById, safeGap, lockedGroups)
      .slice(0, deps.config.pairRepairGroupLimit);
    if (pairTargets.length === 0) return;

    let changed = false;
    for (const pair of pairTargets) {
      const leftPlacement = state.placementById.get(pair.leftKey);
      const rightPlacement = state.placementById.get(pair.rightKey);
      if (!leftPlacement || !rightPlacement) continue;

      const leftRadius = Math.hypot(leftPlacement.centerX, leftPlacement.centerY);
      const rightRadius = Math.hypot(rightPlacement.centerX, rightPlacement.centerY);
      const outerKey = leftRadius >= rightRadius ? pair.leftKey : pair.rightKey;
      const innerKey = outerKey === pair.leftKey ? pair.rightKey : pair.leftKey;
      const outerPlacement = state.placementById.get(outerKey);
      const innerPlacement = state.placementById.get(innerKey);
      if (!outerPlacement || !innerPlacement) continue;
      const outerGroup = orderedGroups.find((group) => group.placeKey === outerKey);
      const innerGroup = orderedGroups.find((group) => group.placeKey === innerKey);
      if (!outerGroup || !innerGroup) continue;
      const outerGeometry = geometryById.get(outerKey);
      const innerGeometry = geometryById.get(innerKey);
      if (!outerGeometry || !innerGeometry) continue;
      const directionAnalysis = analyzePairDirection(
        deps,
        outerPlacement,
        innerPlacement,
        outerGeometry,
        innerGeometry,
        safeGap,
      );
      const clusterKeys = buildExpandableNeighborhood(
        orderedGroups,
        state.placementById,
        [outerKey, innerKey],
        directionAnalysis,
      );

      const outerAngle = Math.atan2(outerPlacement.centerY, outerPlacement.centerX);
      const innerAngle = Math.atan2(innerPlacement.centerY, innerPlacement.centerX);
      const outwardDirection = outerAngle - innerAngle >= 0 ? 1 : -1;
      const candidatePlacements = [
        ...buildNormalSeparationCandidates(
          outerPlacement,
          outerGeometry,
          innerGeometry,
          safeGap,
        ),
        ...buildBoundaryEscapeCandidates(
          outerPlacement,
          { x: outerGroup.logicalX, y: outerGroup.logicalY },
          outerGeometry,
          { x: innerGroup.logicalX, y: innerGroup.logicalY },
          innerGeometry,
          mapRect,
        ),
        ...buildRadialRelaxCandidates(outerPlacement, outwardDirection),
        ...buildPairRelaxCandidates(outerPlacement, innerPlacement, outwardDirection),
      ];
      const clusterVariants = buildClusterRelaxPlacements(
        clusterKeys,
        state.placementById,
        directionAnalysis,
      );

      let bestPlacement: FootprintPlacement | null = null;
      let bestClusterPlacementById: Map<string, FootprintPlacement> | null = null;
      let bestGeometryById: Map<string, GroupGeometry> | null = null;
      let bestHardConflicts = hardConflicts;
      let bestCorridorRisk = corridorRisk;
      let bestLineCrossings = placementLineCrossings;
      let bestGlobalConflictScore = globalConflictScore;
      let bestPairScore = pair.score;
      let bestConflictedPairCount = conflictedPairCount;

      for (const candidatePlacement of candidatePlacements) {
        const placementById = new Map(state.placementById);
        placementById.set(outerKey, candidatePlacement);

        const candidateLineCrossings = deps.countPlacementLineCrossings(orderedGroups, placementById);
        if (orderedGroups.length >= 20 && candidateLineCrossings > placementLineCrossings) continue;

        const candidateGeometryById = buildGeometryMapForPlacements(
          deps,
          orderedGroups,
          placementById,
          mapRect,
          safeGap,
          labelGapBoost,
          lockedGroups,
        );
        const candidateHardConflicts = hasHardConflicts(
          deps,
          orderedGroups,
          placementById,
          candidateGeometryById,
          mapRect,
          safeGap,
          lockedGroups,
        );
        const candidateCorridorRisk = countCorridorRiskConflicts(
          deps,
          orderedGroups,
          candidateGeometryById,
          safeGap,
          mapRect,
          lockedGroups,
        );
        const candidateGlobalConflictScore = computeGlobalConflictScore(
          deps,
          orderedGroups,
          candidateGeometryById,
          safeGap,
          lockedGroups,
        );
        const candidateConflictedPairCount = countConflictedPairs(
          deps,
          orderedGroups,
          candidateGeometryById,
          safeGap,
          lockedGroups,
        );
        const leftGeometry = candidateGeometryById.get(pair.leftKey);
        const rightGeometry = candidateGeometryById.get(pair.rightKey);
        if (!leftGeometry || !rightGeometry) continue;
        const candidatePairScore = computePairConflictScore(
          deps,
          leftGeometry,
          rightGeometry,
          safeGap,
        );

        const isBetter =
          (!candidateHardConflicts && bestHardConflicts) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings < bestLineCrossings) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidatePairScore === 0 &&
            candidateConflictedPairCount < bestConflictedPairCount) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidateCorridorRisk < bestCorridorRisk) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidateCorridorRisk === bestCorridorRisk &&
            candidateGlobalConflictScore < bestGlobalConflictScore) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidateCorridorRisk === bestCorridorRisk &&
            candidateGlobalConflictScore === bestGlobalConflictScore &&
            candidatePairScore < bestPairScore);

        if (!isBetter) continue;

        bestPlacement = candidatePlacement;
        bestGeometryById = candidateGeometryById;
        bestHardConflicts = candidateHardConflicts;
        bestCorridorRisk = candidateCorridorRisk;
        bestLineCrossings = candidateLineCrossings;
        bestGlobalConflictScore = candidateGlobalConflictScore;
        bestPairScore = candidatePairScore;
        bestConflictedPairCount = candidateConflictedPairCount;
      }

      for (const clusterPlacement of clusterVariants) {
        const placementById = new Map(state.placementById);
        clusterPlacement.forEach((placement, key) => {
          placementById.set(key, placement);
        });

        const candidateLineCrossings = deps.countPlacementLineCrossings(orderedGroups, placementById);
        if (orderedGroups.length >= 20 && candidateLineCrossings > placementLineCrossings) continue;

        const candidateGeometryById = buildGeometryMapForPlacements(
          deps,
          orderedGroups,
          placementById,
          mapRect,
          safeGap,
          labelGapBoost,
          lockedGroups,
        );
        const candidateHardConflicts = hasHardConflicts(
          deps,
          orderedGroups,
          placementById,
          candidateGeometryById,
          mapRect,
          safeGap,
          lockedGroups,
        );
        const candidateCorridorRisk = countCorridorRiskConflicts(
          deps,
          orderedGroups,
          candidateGeometryById,
          safeGap,
          mapRect,
          lockedGroups,
        );
        const candidateGlobalConflictScore = computeGlobalConflictScore(
          deps,
          orderedGroups,
          candidateGeometryById,
          safeGap,
          lockedGroups,
        );
        const candidateConflictedPairCount = countConflictedPairs(
          deps,
          orderedGroups,
          candidateGeometryById,
          safeGap,
          lockedGroups,
        );
        const leftGeometry = candidateGeometryById.get(pair.leftKey);
        const rightGeometry = candidateGeometryById.get(pair.rightKey);
        if (!leftGeometry || !rightGeometry) continue;
        const candidatePairScore = computePairConflictScore(
          deps,
          leftGeometry,
          rightGeometry,
          safeGap,
        );

        const isBetter =
          (!candidateHardConflicts && bestHardConflicts) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings < bestLineCrossings) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidatePairScore === 0 &&
            candidateConflictedPairCount < bestConflictedPairCount) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidateCorridorRisk < bestCorridorRisk) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidateCorridorRisk === bestCorridorRisk &&
            candidateGlobalConflictScore < bestGlobalConflictScore) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidateCorridorRisk === bestCorridorRisk &&
            candidateGlobalConflictScore === bestGlobalConflictScore &&
            candidatePairScore < bestPairScore);

        if (!isBetter) continue;

        bestPlacement = null;
        bestClusterPlacementById = placementById;
        bestGeometryById = candidateGeometryById;
        bestHardConflicts = candidateHardConflicts;
        bestCorridorRisk = candidateCorridorRisk;
        bestLineCrossings = candidateLineCrossings;
        bestGlobalConflictScore = candidateGlobalConflictScore;
        bestPairScore = candidatePairScore;
        bestConflictedPairCount = candidateConflictedPairCount;
      }

      if (!bestGeometryById || (!bestPlacement && !bestClusterPlacementById)) continue;
      if (
        bestPairScore < pair.score ||
        (bestPairScore === 0 && bestConflictedPairCount <= conflictedPairCount) ||
        bestCorridorRisk < corridorRisk ||
        bestGlobalConflictScore < globalConflictScore ||
        bestLineCrossings < placementLineCrossings
      ) {
        if (bestClusterPlacementById) {
          state.placementById = bestClusterPlacementById;
        } else if (bestPlacement) {
          state.placementById.set(outerKey, bestPlacement);
        }
        geometryById = bestGeometryById;
        hardConflicts = bestHardConflicts;
        corridorRisk = bestCorridorRisk;
        placementLineCrossings = bestLineCrossings;
        globalConflictScore = bestGlobalConflictScore;
        conflictedPairCount = bestConflictedPairCount;
        changed = true;
        break;
      }
    }

    if (!changed) return;
    if (!hardConflicts && corridorRisk === 0) return;
  }
}

export function resolveResidualPairConflicts(
  deps: RepairRuntimeDeps,
  orderedGroups: PendingPlaceGroup[],
  candidatePoolById: Map<string, PlacementCandidate[]>,
  state: PlacementState,
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
  lockedGroups: LockedPlaceGroup[],
) {
  let geometryById = buildGeometryMapForPlacements(
    deps,
    orderedGroups,
    state.placementById,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  );
  let hardConflicts = hasHardConflicts(
    deps,
    orderedGroups,
    state.placementById,
    geometryById,
    mapRect,
    safeGap,
    lockedGroups,
  );
  let corridorRisk = countCorridorRiskConflicts(
    deps,
    orderedGroups,
    geometryById,
    safeGap,
    mapRect,
    lockedGroups,
  );
  let placementLineCrossings = deps.countPlacementLineCrossings(orderedGroups, state.placementById);
  let envelopeScore = deps.scoreFinalLayoutEnvelope(orderedGroups, geometryById);
  let globalConflictScore = computeGlobalConflictScore(
    deps,
    orderedGroups,
    geometryById,
    safeGap,
    lockedGroups,
  );
  if (!hardConflicts && corridorRisk === 0) return;
  const maxPasses = Math.max(1, deps.config.pairRepairPassLimit * deps.config.pairRepairGroupLimit);
  for (let pass = 0; pass < maxPasses; pass++) {
    const pairTargets = buildPairRepairTargets(deps, orderedGroups, geometryById, safeGap, lockedGroups);
    if (pairTargets.length === 0) return;

    const trackedResidualScore = computeTrackedResidualScore(
      deps,
      pairTargets,
      geometryById,
      safeGap,
    );

    let committed = false;
    for (const pair of pairTargets) {
      const incidentKeys = new Set([pair.leftKey, pair.rightKey]);
      const currentIncidentConflictScore = computeIncidentConflictScore(
        deps,
        orderedGroups,
        geometryById,
        safeGap,
        incidentKeys,
      );
      const leftCandidates = buildDeepPairRepairCandidateSubset(
        candidatePoolById.get(pair.leftKey) ?? [],
        deps.config.pairRepairDeepSearchLimit,
      );
      const rightCandidates = buildDeepPairRepairCandidateSubset(
        candidatePoolById.get(pair.rightKey) ?? [],
        deps.config.pairRepairDeepSearchLimit,
      );
      let bestPlacementById: Map<string, FootprintPlacement> | null = null;
      let bestGeometryById: Map<string, GroupGeometry> | null = null;
      let bestHardConflicts = hardConflicts;
      let bestCorridorRisk = corridorRisk;
      let bestLineCrossings = placementLineCrossings;
      let bestPairScore = pair.score;
      let bestEnvelopeScore = envelopeScore;
      let bestTrackedResidualScore = trackedResidualScore;
      let bestIncidentConflictScore = currentIncidentConflictScore;
      let bestGlobalConflictScore = globalConflictScore;

      for (const leftCandidate of leftCandidates) {
        for (const rightCandidate of rightCandidates) {
          const placementById = new Map(state.placementById);
          placementById.set(pair.leftKey, leftCandidate.placement);
          placementById.set(pair.rightKey, rightCandidate.placement);

          const candidateLineCrossings = deps.countPlacementLineCrossings(
            orderedGroups,
            placementById,
          );
          if (orderedGroups.length >= 20 && candidateLineCrossings > placementLineCrossings) continue;

          const candidateGeometryById = buildGeometryMapForPlacements(
            deps,
            orderedGroups,
            placementById,
            mapRect,
            safeGap,
            labelGapBoost,
            lockedGroups,
          );
          const candidateHardConflicts = hasHardConflicts(
            deps,
            orderedGroups,
            placementById,
            candidateGeometryById,
            mapRect,
            safeGap,
            lockedGroups,
          );
          const candidateCorridorRisk = countCorridorRiskConflicts(
            deps,
            orderedGroups,
            candidateGeometryById,
            safeGap,
            mapRect,
            lockedGroups,
          );
          const candidateEnvelopeScore = deps.scoreFinalLayoutEnvelope(
            orderedGroups,
            candidateGeometryById,
          );
          const candidateGlobalConflictScore = computeGlobalConflictScore(
            deps,
            orderedGroups,
            candidateGeometryById,
            safeGap,
            lockedGroups,
          );
          const candidateTrackedResidualScore = computeTrackedResidualScore(
            deps,
            pairTargets,
            candidateGeometryById,
            safeGap,
          );
          const candidateIncidentConflictScore = computeIncidentConflictScore(
            deps,
            orderedGroups,
            candidateGeometryById,
            safeGap,
            incidentKeys,
          );

          const groupGap = Math.max(48, safeGap * 0.5);
          const labelGap = deps.getLabelGap(safeGap);
          const leftGeometry = candidateGeometryById.get(pair.leftKey);
          const rightGeometry = candidateGeometryById.get(pair.rightKey);
          if (!leftGeometry || !rightGeometry) continue;

          let candidatePairScore = 0;
          if (deps.rectsOverlap(leftGeometry.groupRect, rightGeometry.groupRect, groupGap)) candidatePairScore += 4;
          if (deps.rectsOverlap(leftGeometry.labelRect, rightGeometry.photoRect, labelGap)) candidatePairScore += 2;
          if (deps.rectsOverlap(rightGeometry.labelRect, leftGeometry.photoRect, labelGap)) candidatePairScore += 2;
          if (deps.rectsOverlap(leftGeometry.labelRect, rightGeometry.labelRect, labelGap)) candidatePairScore += 1;

          const isBetter =
            (!candidateHardConflicts && bestHardConflicts) ||
            (candidateHardConflicts === bestHardConflicts &&
              candidateLineCrossings < bestLineCrossings) ||
            (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidateCorridorRisk < bestCorridorRisk) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidateCorridorRisk === bestCorridorRisk &&
            candidateGlobalConflictScore < bestGlobalConflictScore) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidateCorridorRisk === bestCorridorRisk &&
            candidateGlobalConflictScore === bestGlobalConflictScore &&
            candidateTrackedResidualScore < bestTrackedResidualScore) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidateCorridorRisk === bestCorridorRisk &&
            candidateGlobalConflictScore === bestGlobalConflictScore &&
            candidateTrackedResidualScore === bestTrackedResidualScore &&
            candidateIncidentConflictScore < bestIncidentConflictScore) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidateCorridorRisk === bestCorridorRisk &&
            candidateGlobalConflictScore === bestGlobalConflictScore &&
            candidateTrackedResidualScore === bestTrackedResidualScore &&
            candidateIncidentConflictScore === bestIncidentConflictScore &&
            candidatePairScore < bestPairScore) ||
          (candidateHardConflicts === bestHardConflicts &&
            candidateLineCrossings === bestLineCrossings &&
            candidateCorridorRisk === bestCorridorRisk &&
            candidateGlobalConflictScore === bestGlobalConflictScore &&
            candidateTrackedResidualScore === bestTrackedResidualScore &&
            candidateIncidentConflictScore === bestIncidentConflictScore &&
            candidatePairScore === bestPairScore &&
              candidateEnvelopeScore < bestEnvelopeScore - 1e-6);

          if (!isBetter) continue;

          bestPlacementById = placementById;
          bestGeometryById = candidateGeometryById;
          bestHardConflicts = candidateHardConflicts;
          bestCorridorRisk = candidateCorridorRisk;
          bestLineCrossings = candidateLineCrossings;
          bestPairScore = candidatePairScore;
          bestEnvelopeScore = candidateEnvelopeScore;
          bestTrackedResidualScore = candidateTrackedResidualScore;
          bestIncidentConflictScore = candidateIncidentConflictScore;
          bestGlobalConflictScore = candidateGlobalConflictScore;

          if (!candidateHardConflicts && candidateCorridorRisk === 0 && candidatePairScore === 0) {
            break;
          }
        }
      }

      if (!bestPlacementById || !bestGeometryById) continue;
      if (
        (!bestHardConflicts && hardConflicts) ||
        bestCorridorRisk < corridorRisk ||
        bestLineCrossings < placementLineCrossings ||
        (bestCorridorRisk === corridorRisk &&
          bestGlobalConflictScore < globalConflictScore) ||
        (bestCorridorRisk === corridorRisk &&
          bestGlobalConflictScore === globalConflictScore &&
          bestTrackedResidualScore < trackedResidualScore) ||
        (bestCorridorRisk === corridorRisk &&
          bestGlobalConflictScore === globalConflictScore &&
          bestTrackedResidualScore === trackedResidualScore &&
          bestIncidentConflictScore < currentIncidentConflictScore) ||
        (bestCorridorRisk === corridorRisk &&
          bestGlobalConflictScore === globalConflictScore &&
          bestTrackedResidualScore === trackedResidualScore &&
          bestIncidentConflictScore === currentIncidentConflictScore &&
          bestPairScore < pair.score) ||
        (bestCorridorRisk === corridorRisk &&
          bestGlobalConflictScore === globalConflictScore &&
          bestTrackedResidualScore === trackedResidualScore &&
          bestIncidentConflictScore === currentIncidentConflictScore &&
          bestPairScore === pair.score &&
          bestEnvelopeScore < envelopeScore - 1e-6)
      ) {
        state.placementById = bestPlacementById;
        geometryById = bestGeometryById;
        hardConflicts = bestHardConflicts;
        corridorRisk = bestCorridorRisk;
        placementLineCrossings = bestLineCrossings;
        envelopeScore = bestEnvelopeScore;
        globalConflictScore = bestGlobalConflictScore;
        committed = true;
        if (!hardConflicts && corridorRisk === 0) {
          return;
        }
        break;
      }
    }

    if (!committed) {
      return;
    }
  }
}

export function repairPlacementIfNeeded(
  deps: RepairDeps,
  orderedGroups: PendingPlaceGroup[],
  candidatePoolById: Map<string, PlacementCandidate[]>,
  state: PlacementState,
  mapRect: LogicalRect,
  safeGap: number,
  labelGapBoost: number,
  lockedGroups: LockedPlaceGroup[],
  reportMetric?: RepairMetricReporter,
) {
  const repairStartedAt = performance.now();
  const markMetric = (name: string) => {
    reportMetric?.(name, Number((performance.now() - repairStartedAt).toFixed(1)));
  };
  const shouldSkipDeepRepair = orderedGroups.length >= LARGE_LAYOUT_REPAIR_GROUP_LIMIT;
  let optimizedAnalysis = deps.analyzePlacementState(
    orderedGroups,
    state.placementById,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
    {
      includeCorridorRisk: false,
      includeLineCrossings: true,
    },
  );
  markMetric('repair.initialAnalysisMs');
  const canSkipHeavyRepair =
    !optimizedAnalysis.hasHardConflicts &&
    optimizedAnalysis.lineCrossings === 0;

  if (canSkipHeavyRepair) {
    return optimizedAnalysis;
  }

  deps.relaxRadialSpacing(
    orderedGroups,
    state,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  );
  markMetric('repair.relaxRadialSpacingPass1Ms');
  optimizedAnalysis = deps.analyzePlacementState(
    orderedGroups,
    state.placementById,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
    {
      includeCorridorRisk: false,
      includeLineCrossings: true,
    },
  );
  markMetric('repair.postRelaxAnalysis1Ms');
  if (!optimizedAnalysis.hasHardConflicts && optimizedAnalysis.corridorRisk === 0) {
    return optimizedAnalysis;
  }
  if (!optimizedAnalysis.hasHardConflicts) {
    return optimizedAnalysis;
  }
  if (shouldSkipDeepRepair) {
    deps.improveGroupRectOnlyPairs(
      orderedGroups,
      candidatePoolById,
      state,
      mapRect,
      safeGap,
      labelGapBoost,
      lockedGroups,
    );
    markMetric('repair.improveGroupRectOnlyPairsMs');
    optimizedAnalysis = deps.analyzePlacementState(
      orderedGroups,
      state.placementById,
      mapRect,
      safeGap,
      labelGapBoost,
      lockedGroups,
      {
        includeCorridorRisk: false,
        includeLineCrossings: true,
      },
    );
    markMetric('repair.postGroupRectOnlyAnalysisMs');
    markMetric('repair.skipDeepRepairMs');
    return optimizedAnalysis;
  }

  deps.improveCorridorRisk(
    orderedGroups,
    candidatePoolById,
    state,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  );
  markMetric('repair.improveCorridorRiskMs');
  optimizedAnalysis = deps.analyzePlacementState(
    orderedGroups,
    state.placementById,
    mapRect,
    safeGap,
    labelGapBoost,
    lockedGroups,
  );
  markMetric('repair.postCorridorAnalysisMs');
  if (!optimizedAnalysis.hasHardConflicts) {
    return optimizedAnalysis;
  }
  if (optimizedAnalysis.hasHardConflicts || optimizedAnalysis.corridorRisk > 0) {
    deps.relaxRadialSpacing(
      orderedGroups,
      state,
      mapRect,
      safeGap,
      labelGapBoost,
      lockedGroups,
    );
    markMetric('repair.relaxRadialSpacingPass2Ms');
    optimizedAnalysis = deps.analyzePlacementState(
      orderedGroups,
      state.placementById,
      mapRect,
      safeGap,
      labelGapBoost,
      lockedGroups,
    );
    markMetric('repair.postRelaxAnalysis2Ms');
  }
  if (!optimizedAnalysis.hasHardConflicts) {
    return optimizedAnalysis;
  }

  if (optimizedAnalysis.hasHardConflicts || optimizedAnalysis.corridorRisk > 0) {
    deps.improvePairCorridorRisk(
      orderedGroups,
      candidatePoolById,
      state,
      mapRect,
      safeGap,
      labelGapBoost,
      lockedGroups,
    );
    markMetric('repair.improvePairCorridorRiskMs');
    optimizedAnalysis = deps.analyzePlacementState(
      orderedGroups,
      state.placementById,
      mapRect,
      safeGap,
      labelGapBoost,
      lockedGroups,
    );
    markMetric('repair.postPairAnalysisMs');
  }

  return optimizedAnalysis;
}
