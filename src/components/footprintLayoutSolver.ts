import { buildRadialLayout } from './localMapLayoutEngine';
import type { FootprintPlacement, LogicalRect, PendingPlaceGroup } from './footprintLayoutTypes';

const HEURISTIC_PASSES = 6;
const LOCAL_SHRINK_PASSES = 3;
const OVERLAP_GAP = 18;
const MAP_SAFE_GAP = 18;
const SHRINK_STEPS = [160, 120, 80, 48, 24];

type PlacedGroup = {
  group: PendingPlaceGroup;
  placement: FootprintPlacement;
  rect: LogicalRect;
};

function translateRect(rect: LogicalRect, centerX: number, centerY: number): LogicalRect {
  return {
    left: rect.left + centerX,
    right: rect.right + centerX,
    top: rect.top + centerY,
    bottom: rect.bottom + centerY,
  };
}

function rectsOverlap(a: LogicalRect, b: LogicalRect, gap: number) {
  return !(
    a.right + gap <= b.left ||
    b.right + gap <= a.left ||
    a.bottom + gap <= b.top ||
    b.bottom + gap <= a.top
  );
}

function fitsAroundMap(rect: LogicalRect, mapRect: LogicalRect, gap: number) {
  return (
    rect.right <= mapRect.left - gap ||
    rect.left >= mapRect.right + gap ||
    rect.bottom <= mapRect.top - gap ||
    rect.top >= mapRect.bottom + gap
  );
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

function normalizeAngle(angle: number) {
  const full = Math.PI * 2;
  const normalized = angle % full;
  return normalized >= 0 ? normalized : normalized + full;
}

function angleDelta(left: number, right: number) {
  const full = Math.PI * 2;
  let delta = normalizeAngle(left) - normalizeAngle(right);
  if (delta > Math.PI) delta -= full;
  if (delta < -Math.PI) delta += full;
  return delta;
}

function buildPlacedGroups(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
) {
  return groups
    .map((group) => {
      const placement = placementById.get(group.placeKey);
      if (!placement) return null;
      return {
        group,
        placement,
        rect: translateRect(group.collisionRect, placement.centerX, placement.centerY),
      };
    })
    .filter((entry): entry is PlacedGroup => entry !== null);
}

function hasLineCrossing(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  targetKey: string,
) {
  const links = groups
    .map((group) => {
      const placement = placementById.get(group.placeKey);
      if (!placement) return null;
      return {
        key: group.placeKey,
        start: { x: group.logicalX, y: group.logicalY },
        end: { x: placement.centerX, y: placement.centerY },
      };
    })
    .filter((entry): entry is { key: string; start: { x: number; y: number }; end: { x: number; y: number } } => entry !== null);

  const target = links.find((entry) => entry.key === targetKey);
  if (!target) return false;
  return links.some((entry) => (
    entry.key !== target.key &&
    segmentsIntersect(target.start, target.end, entry.start, entry.end)
  ));
}

function isPlacementValid(
  targetGroup: PendingPlaceGroup,
  candidatePlacement: FootprintPlacement,
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
) {
  const candidateRect = translateRect(
    targetGroup.collisionRect,
    candidatePlacement.centerX,
    candidatePlacement.centerY,
  );
  if (!fitsAroundMap(candidateRect, mapRect, MAP_SAFE_GAP)) return false;

  for (const group of groups) {
    if (group.placeKey === targetGroup.placeKey) continue;
    const otherPlacement = placementById.get(group.placeKey);
    if (!otherPlacement) continue;
    const otherRect = translateRect(group.collisionRect, otherPlacement.centerX, otherPlacement.centerY);
    if (rectsOverlap(candidateRect, otherRect, OVERLAP_GAP)) {
      return false;
    }
  }

  const trial = new Map(placementById);
  trial.set(targetGroup.placeKey, candidatePlacement);
  return !hasLineCrossing(groups, trial, targetGroup.placeKey);
}

function applyRepulsionPass(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
) {
  const next = new Map(placementById);
  const placed = buildPlacedGroups(groups, next);

  for (let leftIndex = 0; leftIndex < placed.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < placed.length; rightIndex++) {
      const left = placed[leftIndex];
      const right = placed[rightIndex];
      const leftPlacement = next.get(left.group.placeKey);
      const rightPlacement = next.get(right.group.placeKey);
      if (!leftPlacement || !rightPlacement) continue;
      const leftRect = translateRect(left.group.collisionRect, leftPlacement.centerX, leftPlacement.centerY);
      const rightRect = translateRect(right.group.collisionRect, rightPlacement.centerX, rightPlacement.centerY);
      const lineCrossed = segmentsIntersect(
        { x: left.group.logicalX, y: left.group.logicalY },
        { x: leftPlacement.centerX, y: leftPlacement.centerY },
        { x: right.group.logicalX, y: right.group.logicalY },
        { x: rightPlacement.centerX, y: rightPlacement.centerY },
      );
      if (!rectsOverlap(leftRect, rightRect, OVERLAP_GAP) && !lineCrossed) continue;

      const leftAngle = Math.atan2(leftPlacement.centerY, leftPlacement.centerX);
      const rightAngle = Math.atan2(rightPlacement.centerY, rightPlacement.centerX);
      const leftRadius = Math.hypot(leftPlacement.centerX, leftPlacement.centerY);
      const rightRadius = Math.hypot(rightPlacement.centerX, rightPlacement.centerY);
      const leftOutward = angleDelta(leftAngle, rightAngle) <= 0 ? -1 : 1;
      const rightOutward = -leftOutward;
      const angleStep = lineCrossed ? 0.16 : 0.1;
      const radiusStep = lineCrossed ? 64 : 36;

      const leftCandidate = {
        centerX: Math.cos(leftAngle + angleStep * leftOutward) * (leftRadius + radiusStep),
        centerY: Math.sin(leftAngle + angleStep * leftOutward) * (leftRadius + radiusStep),
      };
      if (isPlacementValid(left.group, leftCandidate, groups, next, mapRect)) {
        next.set(left.group.placeKey, leftCandidate);
      }

      const rightCandidate = {
        centerX: Math.cos(rightAngle + angleStep * rightOutward) * (rightRadius + radiusStep),
        centerY: Math.sin(rightAngle + angleStep * rightOutward) * (rightRadius + radiusStep),
      };
      if (isPlacementValid(right.group, rightCandidate, groups, next, mapRect)) {
        next.set(right.group.placeKey, rightCandidate);
      }
    }
  }

  return next;
}

function applyShrinkPass(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
) {
  const next = new Map(placementById);
  const ordered = [...groups].sort((left, right) => {
    const leftPlacement = next.get(left.placeKey);
    const rightPlacement = next.get(right.placeKey);
    const leftRadius = leftPlacement ? Math.hypot(leftPlacement.centerX, leftPlacement.centerY) : 0;
    const rightRadius = rightPlacement ? Math.hypot(rightPlacement.centerX, rightPlacement.centerY) : 0;
    return rightRadius - leftRadius;
  });

  for (const group of ordered) {
    const placement = next.get(group.placeKey);
    if (!placement) continue;
    const angle = Math.atan2(placement.centerY, placement.centerX);
    const radius = Math.hypot(placement.centerX, placement.centerY);

    for (const shrink of SHRINK_STEPS) {
      const inwardCandidate = {
        centerX: Math.cos(angle) * Math.max(0, radius - shrink),
        centerY: Math.sin(angle) * Math.max(0, radius - shrink),
      };
      if (isPlacementValid(group, inwardCandidate, groups, next, mapRect)) {
        next.set(group.placeKey, inwardCandidate);
        break;
      }

      for (const angleOffset of [-0.12, -0.08, -0.04, 0.04, 0.08, 0.12]) {
        const shiftedAngle = angle + angleOffset;
        const angledCandidate = {
          centerX: Math.cos(shiftedAngle) * Math.max(0, radius - shrink),
          centerY: Math.sin(shiftedAngle) * Math.max(0, radius - shrink),
        };
        if (isPlacementValid(group, angledCandidate, groups, next, mapRect)) {
          next.set(group.placeKey, angledCandidate);
          break;
        }
      }
      if (next.get(group.placeKey) !== placement) break;
    }
  }

  return next;
}

function buildHeuristicPlacements(
  groups: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
) {
  let next = new Map(placementById);
  for (let pass = 0; pass < HEURISTIC_PASSES; pass++) {
    next = applyRepulsionPass(groups, next, mapRect);
  }
  for (let pass = 0; pass < LOCAL_SHRINK_PASSES; pass++) {
    next = applyShrinkPass(groups, next, mapRect);
  }
  return next;
}

export function solvePendingGroupPlacements(
  groups: PendingPlaceGroup[],
  mapRect: LogicalRect,
  _safeGap: number,
  _labelGapBoost: number,
  _refinePlacements: (
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

  return buildHeuristicPlacements(
    groups,
    new Map(placements.map((placement) => [placement.id, placement])),
    mapRect,
  );
}
