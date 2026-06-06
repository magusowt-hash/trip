import type { FootprintPlacement, LockedPlaceGroup, LogicalRect, PendingPlaceGroup } from './footprintLayoutTypes';
import type { GroupGeometry } from './localMapGroupGeometry';
import type { PlacementState } from './footprintLayoutLayeredPlacement';

type PlacementCandidate = {
  placement: FootprintPlacement;
  geometry: GroupGeometry;
  basePenalty: number;
};

type CandidateEvaluation = {
  valid: boolean;
  score: number;
};

export type LegacySolverInputs = {
  orderedGroups: PendingPlaceGroup[];
  candidatePoolById: Map<string, PlacementCandidate[]>;
};

type LegacyDeps = {
  buildCandidatePool: (
    group: PendingPlaceGroup,
    basePlacement: FootprintPlacement,
    mapRect: LogicalRect,
    sectorDensity?: number,
  ) => PlacementCandidate[];
  compareLegacyGroupOrder: (
    left: PendingPlaceGroup,
    right: PendingPlaceGroup,
    basePlacementById: Map<string, FootprintPlacement>,
    sectorDensityById?: Map<string, number>,
    candidateCountById?: Map<string, number>,
  ) => number;
  computeSectorIndex: (angle: number) => number;
  countPlacementLineCrossings: (
    groups: PendingPlaceGroup[],
    placementById: Map<string, FootprintPlacement>,
  ) => number;
  evaluateCandidate: (
    group: PendingPlaceGroup,
    candidate: PlacementCandidate,
    groups: PendingPlaceGroup[],
    state: PlacementState,
    lockedGroups: LockedPlaceGroup[],
    safeGap: number,
  ) => CandidateEvaluation;
};

const GLOBAL_SECTOR_COUNT = 16;
const INITIAL_ASSIGNMENT_PASSES = 3;
const INITIAL_ASSIGNMENT_BEAM_WIDTH = 3;
const INITIAL_ASSIGNMENT_HEAD_CANDIDATE_LIMIT = 6;
const INITIAL_ASSIGNMENT_SPREAD_SAMPLE_COUNT = 4;
const REBALANCE_ITERATION_COUNT = 8;

function buildInitialAssignmentCandidateSubset(
  candidates: PlacementCandidate[],
  offset: number,
) {
  if (candidates.length <= INITIAL_ASSIGNMENT_HEAD_CANDIDATE_LIMIT) {
    return candidates.map((candidate, index) => ({
      candidate,
      originalIndex: index,
    }));
  }

  const subset: Array<{ candidate: PlacementCandidate; originalIndex: number }> = [];
  const usedIndexes = new Set<number>();
  const addByIndex = (index: number) => {
    if (index < 0 || index >= candidates.length || usedIndexes.has(index)) return;
    usedIndexes.add(index);
    subset.push({
      candidate: candidates[index]!,
      originalIndex: index,
    });
  };

  for (let step = 0; step < Math.min(INITIAL_ASSIGNMENT_HEAD_CANDIDATE_LIMIT, candidates.length); step++) {
    addByIndex((offset + step) % candidates.length);
  }

  const tailStart = INITIAL_ASSIGNMENT_HEAD_CANDIDATE_LIMIT;
  const tailCount = Math.max(0, candidates.length - tailStart);
  const sampleCount = Math.min(INITIAL_ASSIGNMENT_SPREAD_SAMPLE_COUNT, tailCount);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    const ratio = sampleCount === 1 ? 1 : sampleIndex / (sampleCount - 1);
    const index = tailStart + Math.round(ratio * (tailCount - 1));
    addByIndex(index);
  }

  return subset;
}

export function buildLegacySolverInputs(
  deps: LegacyDeps,
  groups: PendingPlaceGroup[],
  basePlacementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
): LegacySolverInputs {
  const baseSectorCounts = Array.from({ length: GLOBAL_SECTOR_COUNT }, () => 0);
  basePlacementById.forEach((placement) => {
    baseSectorCounts[deps.computeSectorIndex(Math.atan2(placement.centerY, placement.centerX))] += 1;
  });

  const candidatePoolById = new Map<string, PlacementCandidate[]>();
  const sectorDensityById = new Map<string, number>();
  const candidateCountById = new Map<string, number>();
  for (const group of groups) {
    const basePlacement = basePlacementById.get(group.placeKey) ?? { centerX: 0, centerY: 0 };
    const sectorDensity = baseSectorCounts[deps.computeSectorIndex(Math.atan2(basePlacement.centerY, basePlacement.centerX))] ?? 0;
    sectorDensityById.set(group.placeKey, sectorDensity);
    const candidates = deps.buildCandidatePool(group, basePlacement, mapRect, sectorDensity);
    candidatePoolById.set(group.placeKey, candidates);
    candidateCountById.set(group.placeKey, candidates.length);
  }

  return {
    orderedGroups: [...groups].sort((left, right) => deps.compareLegacyGroupOrder(
      left,
      right,
      basePlacementById,
      sectorDensityById,
      candidateCountById,
    )),
    candidatePoolById,
  };
}

export function assignInitialPlacements(
  deps: LegacyDeps,
  orderedGroups: PendingPlaceGroup[],
  candidatePoolById: Map<string, PlacementCandidate[]>,
  lockedGroups: LockedPlaceGroup[],
  safeGap: number,
) {
  let bestState: PlacementState | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let pass = 0; pass < INITIAL_ASSIGNMENT_PASSES; pass++) {
    let frontier: Array<{ state: PlacementState; score: number }> = [{
      state: {
        placementById: new Map<string, FootprintPlacement>(),
        geometryById: new Map<string, GroupGeometry>(),
        candidateIndexById: new Map<string, number>(),
      },
      score: 0,
    }];

    for (let groupIndex = 0; groupIndex < orderedGroups.length; groupIndex++) {
      const group = orderedGroups[groupIndex]!;
      const candidates = candidatePoolById.get(group.placeKey) ?? [];
      if (candidates.length === 0) {
        frontier = [];
        break;
      }

      const offset = pass % Math.max(1, Math.min(8, candidates.length));
      const subset = buildInitialAssignmentCandidateSubset(candidates, offset);
      let expanded: Array<{ state: PlacementState; score: number }> = [];

      const expandFrontier = (
        frontierToExpand: Array<{ state: PlacementState; score: number }>,
        candidatesToUse: Array<{ candidate: PlacementCandidate; originalIndex: number }>,
      ) => {
        const next: Array<{ state: PlacementState; score: number }> = [];
        for (const beam of frontierToExpand) {
          for (const entry of candidatesToUse) {
            const evaluation = deps.evaluateCandidate(
              group,
              entry.candidate,
              orderedGroups,
              beam.state,
              lockedGroups,
              safeGap,
            );
            if (!evaluation.valid) continue;

            next.push({
              state: {
                placementById: new Map(beam.state.placementById).set(
                  group.placeKey,
                  entry.candidate.placement,
                ),
                geometryById: new Map(beam.state.geometryById).set(
                  group.placeKey,
                  entry.candidate.geometry,
                ),
                candidateIndexById: new Map(beam.state.candidateIndexById).set(
                  group.placeKey,
                  entry.originalIndex,
                ),
              },
              score: beam.score + evaluation.score,
            });
          }
        }
        return next;
      };

      expanded = expandFrontier(frontier, subset);
      if (expanded.length === 0) {
        expanded = expandFrontier(
          frontier,
          candidates.map((candidate, index) => ({
            candidate,
            originalIndex: index,
          })),
        );
      }
      if (expanded.length === 0) {
        frontier = [];
        break;
      }

      expanded.sort((left, right) => left.score - right.score);
      frontier = expanded.slice(0, INITIAL_ASSIGNMENT_BEAM_WIDTH);
    }

    const winner = frontier[0];
    if (winner && winner.score < bestScore) {
      bestState = winner.state;
      bestScore = winner.score;
    }
  }

  return bestState;
}

function reassignGroup(
  deps: LegacyDeps,
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
  const currentPlacementCrossings = deps.countPlacementLineCrossings(groups, state.placementById);

  const currentCandidate = candidates[currentIndex];
  const currentScore = currentCandidate
    ? deps.evaluateCandidate(group, currentCandidate, groups, state, lockedGroups, safeGap)
    : { valid: false, score: Number.POSITIVE_INFINITY };

  let bestIndex = currentIndex;
  let bestScore = currentScore.score;

  state.placementById.delete(group.placeKey);
  state.geometryById.delete(group.placeKey);

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const evaluation = deps.evaluateCandidate(group, candidate, groups, state, lockedGroups, safeGap);
    if (!evaluation.valid) continue;
    const placementById = new Map(state.placementById);
    placementById.set(group.placeKey, candidate.placement);
    const candidatePlacementCrossings = deps.countPlacementLineCrossings(groups, placementById);
    if (groups.length >= 20 && candidatePlacementCrossings > currentPlacementCrossings) {
      continue;
    }
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

export function optimizeAssignments(
  deps: LegacyDeps,
  orderedGroups: PendingPlaceGroup[],
  candidatePoolById: Map<string, PlacementCandidate[]>,
  state: PlacementState,
  lockedGroups: LockedPlaceGroup[],
  safeGap: number,
) {
  for (let iteration = 0; iteration < REBALANCE_ITERATION_COUNT; iteration++) {
    const placementSnapshot = new Map(state.placementById);
    const geometrySnapshot = new Map(state.geometryById);
    const candidateIndexSnapshot = new Map(state.candidateIndexById);
    let changed = false;
    const beforeIterationCrossings = deps.countPlacementLineCrossings(orderedGroups, state.placementById);
    for (const group of orderedGroups) {
      if (reassignGroup(deps, group, orderedGroups, candidatePoolById, state, lockedGroups, safeGap)) {
        changed = true;
      }
    }
    if (orderedGroups.length >= 20) {
      const afterIterationCrossings = deps.countPlacementLineCrossings(orderedGroups, state.placementById);
      if (afterIterationCrossings > beforeIterationCrossings) {
        state.placementById = placementSnapshot;
        state.geometryById = geometrySnapshot;
        state.candidateIndexById = candidateIndexSnapshot;
        break;
      }
    }
    if (!changed) break;
  }
}

export function buildLegacyFallbackState(
  deps: LegacyDeps,
  orderedGroups: PendingPlaceGroup[],
  candidatePoolById: Map<string, PlacementCandidate[]>,
  basePlacementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
  lockedGroups: LockedPlaceGroup[],
  safeGap: number,
  seedState: PlacementState | null,
  buildFallbackState: (
    orderedGroups: PendingPlaceGroup[],
    basePlacementById: Map<string, FootprintPlacement>,
    mapRect: LogicalRect,
  ) => PlacementState,
) {
  if (seedState) {
    optimizeAssignments(
      deps,
      orderedGroups,
      candidatePoolById,
      seedState,
      lockedGroups,
      safeGap,
    );
    return seedState;
  }

  const assignedState = assignInitialPlacements(
    deps,
    orderedGroups,
    candidatePoolById,
    lockedGroups,
    safeGap,
  );
  const workingState = assignedState ?? buildFallbackState(
    orderedGroups,
    basePlacementById,
    mapRect,
  );
  optimizeAssignments(
    deps,
    orderedGroups,
    candidatePoolById,
    workingState,
    lockedGroups,
    safeGap,
  );
  return workingState;
}
