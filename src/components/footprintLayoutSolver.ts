import {
  buildGroupGeometryLabelCandidates,
  rectsOverlap,
  selectBestGroupGeometryLabelCandidate,
  shiftGroupGeometryDown,
  translateGroupGeometry,
  type GroupGeometry,
} from './localMapGroupGeometry';
import { buildRadialLayout } from './localMapLayoutEngine';
import type { FootprintPlacement, LogicalRect, PendingPlaceGroup } from './footprintLayoutTypes';

const PHOTO_GAP = 10;
const LABEL_GAP = 18;
const LABEL_LABEL_GAP = 16;
const LINE_LABEL_GAP = 12;
const MAP_PHOTO_GAP = 18;
const MAP_LABEL_GAP = 22;
const LABEL_DOWN_MAX = 84;
const LABEL_DOWN_STEP = 6;
const ANGLE_STEPS = [0, -4, 4, -8, 8, -12, 12, -16, 16, -24, 24];
const RADIUS_STEPS = [-220, -160, -120, -80, -48, -24, 0, 36, 72, 120];

type PlacedEntry = {
  group: PendingPlaceGroup;
  placement: FootprintPlacement;
  geometry: GroupGeometry;
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

function fitsPhotoRectAroundMap(rect: LogicalRect, mapRect: LogicalRect, gap: number) {
  return (
    rect.right <= mapRect.left - gap ||
    rect.left >= mapRect.right + gap ||
    rect.bottom <= mapRect.top - gap ||
    rect.top >= mapRect.bottom + gap
  );
}

function fitsLabelRectAroundMap(rect: LogicalRect, mapRect: LogicalRect, gap: number) {
  return (
    rect.right <= mapRect.left - gap ||
    rect.left >= mapRect.right + gap ||
    rect.bottom <= mapRect.top - gap ||
    rect.top >= mapRect.bottom + gap
  );
}

function rectDistance(left: LogicalRect, right: LogicalRect) {
  const dx = Math.max(0, left.left - right.right, right.left - left.right);
  const dy = Math.max(0, left.top - right.bottom, right.top - left.bottom);
  return Math.hypot(dx, dy);
}

function computeGeometryPressure(candidate: GroupGeometry, occupied: GroupGeometry[]) {
  let score = 0;
  for (const item of occupied) {
    const photoDistance = rectDistance(candidate.photoRect, item.photoRect);
    const labelPhotoDistance = rectDistance(candidate.labelRect, item.photoRect);
    const photoLabelDistance = rectDistance(candidate.photoRect, item.labelRect);
    const labelDistance = rectDistance(candidate.labelRect, item.labelRect);
    if (photoDistance < 60) score += (60 - photoDistance) ** 2 * 1.05;
    if (labelPhotoDistance < 84) score += (84 - labelPhotoDistance) ** 2 * 1.2;
    if (photoLabelDistance < 84) score += (84 - photoLabelDistance) ** 2 * 1.2;
    if (labelDistance < 72) score += (72 - labelDistance) ** 2;
  }
  return score;
}

function buildResolvedCandidateGeometry(
  geometry: GroupGeometry,
  occupied: GroupGeometry[],
  mapRect: LogicalRect,
) {
  const seed = selectBestGroupGeometryLabelCandidate(geometry, occupied, mapRect, 12);
  const variants = [seed, ...buildGroupGeometryLabelCandidates(seed)];
  let best = seed;
  let bestPressure = Number.POSITIVE_INFINITY;

  for (const baseCandidate of variants) {
    for (let offset = 0; offset <= LABEL_DOWN_MAX; offset += LABEL_DOWN_STEP) {
      const candidate = offset === 0 ? baseCandidate : shiftGroupGeometryDown(baseCandidate, offset);
      const collides = occupied.some((item) => (
        rectsOverlap(candidate.photoRect, item.photoRect, PHOTO_GAP) ||
        rectsOverlap(candidate.labelRect, item.photoRect, LABEL_GAP) ||
        rectsOverlap(candidate.photoRect, item.labelRect, LABEL_GAP) ||
        rectsOverlap(candidate.labelRect, item.labelRect, LABEL_LABEL_GAP) ||
        rectsOverlap(candidate.lineRect, item.labelRect, LINE_LABEL_GAP)
      ));
      if (collides) continue;
      if (!fitsPhotoRectAroundMap(candidate.photoRect, mapRect, MAP_PHOTO_GAP)) continue;
      if (!fitsLabelRectAroundMap(candidate.labelRect, mapRect, MAP_LABEL_GAP)) continue;
      return candidate;
    }
    const pressure = computeGeometryPressure(baseCandidate, occupied);
    if (pressure < bestPressure) {
      best = baseCandidate;
      bestPressure = pressure;
    }
  }

  return best;
}

function hasCrossingWithPlaced(
  group: PendingPlaceGroup,
  placement: FootprintPlacement,
  placed: PlacedEntry[],
) {
  return placed.some((entry) => (
    segmentsIntersect(
      { x: group.logicalX, y: group.logicalY },
      { x: placement.centerX, y: placement.centerY },
      { x: entry.group.logicalX, y: entry.group.logicalY },
      { x: entry.placement.centerX, y: entry.placement.centerY },
    )
  ));
}

function scorePlacementCandidate(
  group: PendingPlaceGroup,
  placement: FootprintPlacement,
  geometry: GroupGeometry,
  occupied: GroupGeometry[],
  placed: PlacedEntry[],
  basePlacement: FootprintPlacement,
) {
  const radius = Math.hypot(placement.centerX, placement.centerY);
  const baseRadius = Math.hypot(basePlacement.centerX, basePlacement.centerY);
  const angle = Math.atan2(placement.centerY, placement.centerX);
  const baseAngle = Math.atan2(basePlacement.centerY, basePlacement.centerX);
  const pressure = computeGeometryPressure(geometry, occupied);
  const outwardPenalty = Math.max(0, radius - baseRadius) * 4;
  const anglePenalty = Math.abs(angleDelta(angle, baseAngle)) * 220;
  const crossingPenalty = hasCrossingWithPlaced(group, placement, placed) ? 180000 : 0;

  return (
    radius * 1.2 +
    outwardPenalty +
    anglePenalty +
    pressure * 0.7 +
    crossingPenalty
  );
}

function compareGroupOrder(
  left: PendingPlaceGroup,
  right: PendingPlaceGroup,
  initialPlacements: Map<string, FootprintPlacement>,
) {
  const leftPlacement = initialPlacements.get(left.placeKey);
  const rightPlacement = initialPlacements.get(right.placeKey);
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
  const result = new Map<string, FootprintPlacement>();
  const placed: PlacedEntry[] = [];
  const orderedGroups = [...groups].sort((left, right) => compareGroupOrder(left, right, basePlacementById));

  for (const group of orderedGroups) {
    const basePlacement = basePlacementById.get(group.placeKey);
    if (!basePlacement) continue;
    const baseAngle = Math.atan2(basePlacement.centerY, basePlacement.centerX);
    const baseRadius = Math.hypot(basePlacement.centerX, basePlacement.centerY);
    const occupied = placed.map((entry) => entry.geometry);

    let bestPlacement = basePlacement;
    let bestGeometry = buildResolvedCandidateGeometry(
      translateGroupGeometry(group.collisionGeometry, basePlacement.centerX, basePlacement.centerY),
      occupied,
      mapRect,
    );
    let bestScore = scorePlacementCandidate(group, bestPlacement, bestGeometry, occupied, placed, basePlacement);

    for (const radiusStep of RADIUS_STEPS) {
      const radius = Math.max(0, baseRadius + radiusStep);
      for (const angleStep of ANGLE_STEPS) {
        const angle = baseAngle + (angleStep * Math.PI) / 180;
        const placement = {
          centerX: Math.cos(angle) * radius,
          centerY: Math.sin(angle) * radius,
        };
        const geometry = buildResolvedCandidateGeometry(
          translateGroupGeometry(group.collisionGeometry, placement.centerX, placement.centerY),
          occupied,
          mapRect,
        );
        const score = scorePlacementCandidate(group, placement, geometry, occupied, placed, basePlacement);
        if (score < bestScore - 1e-6) {
          bestPlacement = {
            centerX: geometry.photoCenterX,
            centerY: geometry.photoCenterY,
          };
          bestGeometry = geometry;
          bestScore = score;
        }
      }
    }

    result.set(group.placeKey, bestPlacement);
    placed.push({
      group,
      placement: bestPlacement,
      geometry: bestGeometry,
    });
  }

  return result;
}
