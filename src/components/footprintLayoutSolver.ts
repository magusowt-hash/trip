import {
  buildGroupGeometryFromPhotoRect,
  rectsOverlap,
  resolvePreferredLabelSide,
  translateGroupGeometry,
  type GroupGeometry,
  type GroupLabelSide,
} from './localMapGroupGeometry';
import { buildRadialLayout } from './localMapLayoutEngine';
import type { FootprintPlacement, LogicalRect, PendingPlaceGroup } from './footprintLayoutTypes';
import {
  fitsGroupRectAroundMap,
  fitsLabelRectAroundMap,
  fitsPhotoRectAroundMap,
  hasLabelCollisions,
  hasPhotoAgainstLabelCollisions,
  rectOverlapsOccupiedPhotos,
} from './footprintLayoutConstraints';

const GROUP_GAP = 10;
const LABEL_GAP = 14;
const MAP_GAP = 28;
const ANGLE_STEPS = [0, -3, 3, -6, 6, -10, 10, -14, 14, -20, 20, -28, 28];
const RADIUS_STEPS = [-520, -420, -320, -240, -180, -120, -72, -36, 0, 36, 72, 120];
const REFINE_ANGLE_STEPS = [0, -2, 2, -4, 4, -7, 7];
const REFINE_RADIUS_STEPS = [0, -180, -120, -72, -36, 24];
const LABEL_SIDE_PRIORITY: GroupLabelSide[] = ['top', 'bottom'];
const REFINE_PASSES = 3;
const LINE_BUNDLE_DISTANCE = 28;
const LINKED_PAIR_DISTANCE = 36;
const LINKED_PAIR_ANGLE_STEPS = [-8, -5, -3, 3, 5, 8];
const LINKED_PAIR_RADIUS_STEPS = [-120, -80, -48, -24];

type PlacedEntry = {
  group: PendingPlaceGroup;
  placement: FootprintPlacement;
  geometry: GroupGeometry;
};

type CandidateScore = {
  total: number;
  valid: boolean;
  uniformity: number;
};

type LinkedPair = {
  left: PendingPlaceGroup;
  right: PendingPlaceGroup;
};

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

function buildGeometryForPlacement(
  group: PendingPlaceGroup,
  placement: FootprintPlacement,
  labelSide?: GroupLabelSide,
) {
  const translatedPhotoRect = {
    left: group.collisionGeometry.photoRect.left + placement.centerX,
    right: group.collisionGeometry.photoRect.right + placement.centerX,
    top: group.collisionGeometry.photoRect.top + placement.centerY,
    bottom: group.collisionGeometry.photoRect.bottom + placement.centerY,
  };

  return buildGroupGeometryFromPhotoRect(
    translatedPhotoRect,
    group.placePhotos[0]?.placeTitle || '',
    group.placePhotos.length,
    1,
    labelSide ?? resolvePreferredLabelSide(placement.centerX, placement.centerY),
    group.reservedLabelOffset,
  );
}

function fitsAroundMap(geometry: GroupGeometry, mapRect: LogicalRect) {
  return (
    fitsGroupRectAroundMap(geometry.groupRect, mapRect, MAP_GAP) &&
    fitsPhotoRectAroundMap(geometry.photoRect, mapRect, MAP_GAP) &&
    fitsLabelRectAroundMap(geometry.labelRect, mapRect, MAP_GAP)
  );
}

function hasCrossingWithPlaced(
  group: PendingPlaceGroup,
  geometry: GroupGeometry,
  placed: PlacedEntry[],
) {
  return placed.some((entry) => (
    segmentsIntersect(
      { x: group.logicalX, y: group.logicalY },
      { x: geometry.lineAnchorX, y: geometry.lineAnchorY },
      { x: entry.group.logicalX, y: entry.group.logicalY },
      { x: entry.geometry.lineAnchorX, y: entry.geometry.lineAnchorY },
    )
  ));
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

function buildLineSegment(group: PendingPlaceGroup, geometry: GroupGeometry) {
  return {
    start: { x: group.logicalX, y: group.logicalY },
    end: { x: geometry.lineAnchorX, y: geometry.lineAnchorY },
  };
}

function computeCollisionPenalty(geometry: GroupGeometry, placed: PlacedEntry[]) {
  const occupied = placed.map((entry) => entry.geometry);
  const photoOverlap = rectOverlapsOccupiedPhotos(geometry.photoRect, occupied, GROUP_GAP);
  const labelOverlap = hasLabelCollisions(geometry, occupied, LABEL_GAP);
  const photoLabelOverlap = hasPhotoAgainstLabelCollisions(geometry, occupied, LABEL_GAP);
  const groupOverlap = occupied.some((entry) => rectsOverlap(geometry.groupRect, entry.groupRect, GROUP_GAP));

  return {
    photoOverlap,
    labelOverlap,
    photoLabelOverlap,
    groupOverlap,
  };
}

function computeLineBundlePenalty(
  group: PendingPlaceGroup,
  geometry: GroupGeometry,
  placed: PlacedEntry[],
) {
  let penalty = 0;
  const start = { x: group.logicalX, y: group.logicalY };
  const end = { x: geometry.lineAnchorX, y: geometry.lineAnchorY };

  for (const entry of placed) {
    const otherStart = { x: entry.group.logicalX, y: entry.group.logicalY };
    const otherEnd = { x: entry.geometry.lineAnchorX, y: entry.geometry.lineAnchorY };
    const distance = segmentDistance(start, end, otherStart, otherEnd);
    if (distance < LINE_BUNDLE_DISTANCE) {
      penalty += (LINE_BUNDLE_DISTANCE - distance) * (LINE_BUNDLE_DISTANCE - distance) * 4.5;
    }
  }

  return penalty;
}

function computeUniformityPenalty(
  placement: FootprintPlacement,
  placed: PlacedEntry[],
) {
  if (placed.length === 0) return 0;

  const radius = Math.hypot(placement.centerX, placement.centerY);
  const angle = Math.atan2(placement.centerY, placement.centerX);
  let nearestPenalty = 0;
  let sectorPenalty = 0;

  for (const entry of placed) {
    const otherRadius = Math.hypot(entry.placement.centerX, entry.placement.centerY);
    const otherAngle = Math.atan2(entry.placement.centerY, entry.placement.centerX);
    const radiusGap = Math.abs(radius - otherRadius);
    const angleGap = Math.abs(angleDelta(angle, otherAngle));
    if (angleGap < Math.PI / 9) {
      sectorPenalty += (Math.PI / 9 - angleGap) * 220;
      if (radiusGap < 260) sectorPenalty += (260 - radiusGap) * 0.8;
    }
    const centerDistance = Math.hypot(
      placement.centerX - entry.placement.centerX,
      placement.centerY - entry.placement.centerY,
    );
    if (centerDistance < 320) {
      nearestPenalty += (320 - centerDistance) * 0.9;
    }
  }

  return nearestPenalty + sectorPenalty;
}

function scoreCandidate(
  placement: FootprintPlacement,
  geometry: GroupGeometry,
  placed: PlacedEntry[],
  basePlacement: FootprintPlacement,
  group: PendingPlaceGroup,
) : CandidateScore {
  const radius = Math.hypot(placement.centerX, placement.centerY);
  const baseRadius = Math.hypot(basePlacement.centerX, basePlacement.centerY);
  const angle = Math.atan2(placement.centerY, placement.centerX);
  const baseAngle = Math.atan2(basePlacement.centerY, basePlacement.centerX);
  const crossing = hasCrossingWithPlaced(group, geometry, placed);
  const collisions = computeCollisionPenalty(geometry, placed);
  const uniformity = computeUniformityPenalty(placement, placed);
  const lineBundlePenalty = computeLineBundlePenalty(group, geometry, placed);

  const valid =
    !crossing &&
    !collisions.groupOverlap &&
    !collisions.photoOverlap &&
    !collisions.labelOverlap &&
    !collisions.photoLabelOverlap;

  let total = valid ? 0 : 1000000;
  total += collisions.groupOverlap ? 420000 : 0;
  total += collisions.photoOverlap ? 220000 : 0;
  total += collisions.labelOverlap ? 320000 : 0;
  total += collisions.photoLabelOverlap ? 380000 : 0;
  total += crossing ? 260000 : 0;
  total += lineBundlePenalty;
  total += uniformity * 3.2;
  total += Math.max(0, radius - baseRadius) * 2.4;
  total += Math.abs(angleDelta(angle, baseAngle)) * 34;
  total += radius * 0.08;
  total += Math.max(0, baseRadius - radius) * -0.22;

  return { total, valid, uniformity };
}

function compareGroupOrder(
  left: PendingPlaceGroup,
  right: PendingPlaceGroup,
  placements: Map<string, FootprintPlacement>,
) {
  const leftPlacement = placements.get(left.placeKey);
  const rightPlacement = placements.get(right.placeKey);
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

function chooseBestGeometryForPlacement(
  group: PendingPlaceGroup,
  placement: FootprintPlacement,
  placed: PlacedEntry[],
  basePlacement: FootprintPlacement,
  mapRect: LogicalRect,
) {
  const preferredSide = resolvePreferredLabelSide(placement.centerX, placement.centerY);
  const labelSides: GroupLabelSide[] = [preferredSide, ...LABEL_SIDE_PRIORITY.filter((side) => side !== preferredSide)];

  let bestGeometry: GroupGeometry | null = null;
  let bestScore: CandidateScore | null = null;

  for (const labelSide of labelSides) {
    const geometry = buildGeometryForPlacement(group, placement, labelSide);
    if (!fitsAroundMap(geometry, mapRect)) continue;

    const score = scoreCandidate(placement, geometry, placed, basePlacement, group);
    if (!bestScore || score.total < bestScore.total - 1e-6) {
      bestGeometry = geometry;
      bestScore = score;
      if (score.valid && labelSide === preferredSide) break;
    }
  }

  if (bestGeometry && bestScore) {
    return { geometry: bestGeometry, score: bestScore };
  }

  const fallbackGeometry = buildGeometryForPlacement(group, placement, preferredSide);
  return {
    geometry: fallbackGeometry,
    score: scoreCandidate(placement, fallbackGeometry, placed, basePlacement, group),
  };
}

function solveSinglePlacement(
  group: PendingPlaceGroup,
  basePlacement: FootprintPlacement,
  placed: PlacedEntry[],
  mapRect: LogicalRect,
) {
  const baseAngle = Math.atan2(basePlacement.centerY, basePlacement.centerX);
  const baseRadius = Math.hypot(basePlacement.centerX, basePlacement.centerY);
  let bestPlacement = basePlacement;
  let bestResolved = chooseBestGeometryForPlacement(group, basePlacement, placed, basePlacement, mapRect);

  for (const radiusStep of RADIUS_STEPS) {
    const radius = Math.max(0, baseRadius + radiusStep);
    for (const angleStep of ANGLE_STEPS) {
      const angle = baseAngle + (angleStep * Math.PI) / 180;
      const placement = {
        centerX: Math.cos(angle) * radius,
        centerY: Math.sin(angle) * radius,
      };
      const resolved = chooseBestGeometryForPlacement(group, placement, placed, basePlacement, mapRect);
      if (resolved.score.total < bestResolved.score.total - 1e-6) {
        bestPlacement = placement;
        bestResolved = resolved;
      }
    }
  }

  return {
    placement: bestPlacement,
    geometry: bestResolved.geometry,
  };
}

function rebuildPlacedEntries(
  ordered: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
) {
  const placed: PlacedEntry[] = [];
  const geometryById = new Map<string, GroupGeometry>();

  for (const group of ordered) {
    const placement = placementById.get(group.placeKey);
    if (!placement) continue;
    const resolved = chooseBestGeometryForPlacement(group, placement, placed, placement, mapRect);
    placed.push({
      group,
      placement,
      geometry: resolved.geometry,
    });
    geometryById.set(group.placeKey, resolved.geometry);
  }

  return { placed, geometryById };
}

function findLinkedPairs(
  ordered: PendingPlaceGroup[],
  geometryById: Map<string, GroupGeometry>,
) {
  const pairs: LinkedPair[] = [];

  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex++) {
    const left = ordered[leftIndex];
    const leftGeometry = geometryById.get(left.placeKey);
    if (!leftGeometry) continue;
    const leftLine = buildLineSegment(left, leftGeometry);

    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex++) {
      const right = ordered[rightIndex];
      const rightGeometry = geometryById.get(right.placeKey);
      if (!rightGeometry) continue;
      const rightLine = buildLineSegment(right, rightGeometry);
      const distance = segmentDistance(leftLine.start, leftLine.end, rightLine.start, rightLine.end);
      if (distance > LINKED_PAIR_DISTANCE) continue;
      pairs.push({ left, right });
    }
  }

  return pairs;
}

function resolveLinkedPairs(
  ordered: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
) {
  let nextPlacementById = new Map(placementById);
  let rebuilt = rebuildPlacedEntries(ordered, nextPlacementById, mapRect);

  for (const pair of findLinkedPairs(ordered, rebuilt.geometryById)) {
    const leftPlacement = nextPlacementById.get(pair.left.placeKey);
    const rightPlacement = nextPlacementById.get(pair.right.placeKey);
    if (!leftPlacement || !rightPlacement) continue;

    let bestPlacementById = nextPlacementById;
    let bestRebuilt = rebuilt;
    let bestDistance = (() => {
      const leftGeometry = rebuilt.geometryById.get(pair.left.placeKey);
      const rightGeometry = rebuilt.geometryById.get(pair.right.placeKey);
      if (!leftGeometry || !rightGeometry) return 0;
      const leftLine = buildLineSegment(pair.left, leftGeometry);
      const rightLine = buildLineSegment(pair.right, rightGeometry);
      return segmentDistance(leftLine.start, leftLine.end, rightLine.start, rightLine.end);
    })();

    const leftAngle = Math.atan2(leftPlacement.centerY, leftPlacement.centerX);
    const rightAngle = Math.atan2(rightPlacement.centerY, rightPlacement.centerX);
    const leftRadius = Math.hypot(leftPlacement.centerX, leftPlacement.centerY);
    const rightRadius = Math.hypot(rightPlacement.centerX, rightPlacement.centerY);

    for (const radiusStep of LINKED_PAIR_RADIUS_STEPS) {
      for (const angleStep of LINKED_PAIR_ANGLE_STEPS) {
        const trialPlacementById = new Map(nextPlacementById);
        trialPlacementById.set(pair.left.placeKey, {
          centerX: Math.cos(leftAngle + (angleStep * Math.PI) / 180) * Math.max(0, leftRadius + radiusStep),
          centerY: Math.sin(leftAngle + (angleStep * Math.PI) / 180) * Math.max(0, leftRadius + radiusStep),
        });
        trialPlacementById.set(pair.right.placeKey, {
          centerX: Math.cos(rightAngle - (angleStep * Math.PI) / 180) * Math.max(0, rightRadius + radiusStep),
          centerY: Math.sin(rightAngle - (angleStep * Math.PI) / 180) * Math.max(0, rightRadius + radiusStep),
        });

        const trialRebuilt = rebuildPlacedEntries(ordered, trialPlacementById, mapRect);
        const nextLeftGeometry = trialRebuilt.geometryById.get(pair.left.placeKey);
        const nextRightGeometry = trialRebuilt.geometryById.get(pair.right.placeKey);
        if (!nextLeftGeometry || !nextRightGeometry) continue;
        const leftLine = buildLineSegment(pair.left, nextLeftGeometry);
        const rightLine = buildLineSegment(pair.right, nextRightGeometry);
        const nextDistance = segmentDistance(leftLine.start, leftLine.end, rightLine.start, rightLine.end);
        if (nextDistance <= bestDistance + 1e-6) continue;

        const leftEntry = trialRebuilt.placed.find((entry) => entry.group.placeKey === pair.left.placeKey);
        const rightEntry = trialRebuilt.placed.find((entry) => entry.group.placeKey === pair.right.placeKey);
        if (!leftEntry || !rightEntry) continue;
        const leftScore = scoreCandidate(leftEntry.placement, leftEntry.geometry, trialRebuilt.placed.filter((entry) => entry.group.placeKey !== pair.left.placeKey), leftPlacement, pair.left);
        const rightScore = scoreCandidate(rightEntry.placement, rightEntry.geometry, trialRebuilt.placed.filter((entry) => entry.group.placeKey !== pair.right.placeKey), rightPlacement, pair.right);
        if (!leftScore.valid || !rightScore.valid) continue;

        bestPlacementById = trialPlacementById;
        bestRebuilt = trialRebuilt;
        bestDistance = nextDistance;
      }
    }

    nextPlacementById = bestPlacementById;
    rebuilt = bestRebuilt;
  }

  return {
    placementById: nextPlacementById,
    rebuilt,
  };
}

function refinePlacements(
  ordered: PendingPlaceGroup[],
  placementById: Map<string, FootprintPlacement>,
  mapRect: LogicalRect,
) {
  const nextPlacementById = new Map(placementById);

  for (let pass = 0; pass < REFINE_PASSES; pass++) {
    let changed = false;
    const placed: PlacedEntry[] = [];

    for (const group of ordered) {
      const currentPlacement = nextPlacementById.get(group.placeKey);
      if (!currentPlacement) continue;

      const currentResolved = chooseBestGeometryForPlacement(
        group,
        currentPlacement,
        placed,
        currentPlacement,
        mapRect,
      );

      let bestPlacement = currentPlacement;
      let bestResolved = currentResolved;
      const currentAngle = Math.atan2(currentPlacement.centerY, currentPlacement.centerX);
      const currentRadius = Math.hypot(currentPlacement.centerX, currentPlacement.centerY);

      for (const radiusStep of REFINE_RADIUS_STEPS) {
        const radius = Math.max(0, currentRadius + radiusStep);
        for (const angleStep of REFINE_ANGLE_STEPS) {
          const angle = currentAngle + (angleStep * Math.PI) / 180;
          const candidatePlacement = {
            centerX: Math.cos(angle) * radius,
            centerY: Math.sin(angle) * radius,
          };
          const resolved = chooseBestGeometryForPlacement(
            group,
            candidatePlacement,
            placed,
            currentPlacement,
            mapRect,
          );
          if (resolved.score.total < bestResolved.score.total - 1e-6) {
            bestPlacement = candidatePlacement;
            bestResolved = resolved;
          }
        }
      }

      if (
        Math.abs(bestPlacement.centerX - currentPlacement.centerX) > 1 ||
        Math.abs(bestPlacement.centerY - currentPlacement.centerY) > 1
      ) {
        nextPlacementById.set(group.placeKey, bestPlacement);
        changed = true;
      }

      placed.push({
        group,
        placement: bestPlacement,
        geometry: bestResolved.geometry,
      });
    }

    if (!changed) break;
  }

  return nextPlacementById;
}

export function solvePendingGroupPlacements(
  groups: PendingPlaceGroup[],
  mapRect: LogicalRect,
  _safeGap: number,
  _labelGapBoost: number,
) {
  const basePlacements = buildRadialLayout(
    groups.map((group) => ({
      id: group.placeKey,
      x: group.logicalX,
      y: group.logicalY,
      rect: group.collisionRect,
    })),
    mapRect,
  );

  const basePlacementById = new Map(basePlacements.map((placement) => [placement.id, placement]));
  const initialPlacementById = new Map<string, FootprintPlacement>();
  const ordered = [...groups].sort((left, right) => compareGroupOrder(left, right, basePlacementById));
  const placed: PlacedEntry[] = [];

  for (const group of ordered) {
    const basePlacement = basePlacementById.get(group.placeKey);
    if (!basePlacement) continue;
    const solved = solveSinglePlacement(group, basePlacement, placed, mapRect);
    initialPlacementById.set(group.placeKey, solved.placement);
    placed.push({
      group,
      placement: solved.placement,
      geometry: solved.geometry,
    });
  }

  const refinedPlacementById = refinePlacements(ordered, initialPlacementById, mapRect);
  const linkedResolved = resolveLinkedPairs(ordered, refinedPlacementById, mapRect);

  return {
    placements: linkedResolved.placementById,
    geometries: linkedResolved.rebuilt.geometryById,
  };
}
