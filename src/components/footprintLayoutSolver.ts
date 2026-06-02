import {
  buildGroupGeometryFromPhotoRect,
  rectsOverlap,
  resolvePreferredLabelSide,
  translateGroupGeometry,
  type GroupGeometry,
} from './localMapGroupGeometry';
import { buildRadialLayout } from './localMapLayoutEngine';
import type { FootprintPlacement, LogicalRect, PendingPlaceGroup } from './footprintLayoutTypes';

const GROUP_GAP = 10;
const MAP_GAP = 18;
const ANGLE_STEPS = [0, -4, 4, -8, 8, -12, 12, -18, 18];
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

function fitsAroundMap(rect: LogicalRect, mapRect: LogicalRect, gap: number) {
  return (
    rect.right <= mapRect.left - gap ||
    rect.left >= mapRect.right + gap ||
    rect.bottom <= mapRect.top - gap ||
    rect.top >= mapRect.bottom + gap
  );
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

function collidesWithPlaced(
  geometry: GroupGeometry,
  placed: PlacedEntry[],
) {
  return placed.some((entry) => rectsOverlap(geometry.overallRect, entry.geometry.overallRect, GROUP_GAP));
}

function scoreCandidate(
  placement: FootprintPlacement,
  geometry: GroupGeometry,
  placed: PlacedEntry[],
  basePlacement: FootprintPlacement,
  group: PendingPlaceGroup,
) {
  const radius = Math.hypot(placement.centerX, placement.centerY);
  const baseRadius = Math.hypot(basePlacement.centerX, basePlacement.centerY);
  const angle = Math.atan2(placement.centerY, placement.centerX);
  const baseAngle = Math.atan2(basePlacement.centerY, basePlacement.centerX);
  const overlapPenalty = collidesWithPlaced(geometry, placed) ? 250000 : 0;
  const crossingPenalty = hasCrossingWithPlaced(group, placement, placed) ? 220000 : 0;
  const outwardPenalty = Math.max(0, radius - baseRadius) * 3.5;
  const anglePenalty = Math.abs(angleDelta(angle, baseAngle)) * 180;
  return radius * 1.15 + outwardPenalty + anglePenalty + overlapPenalty + crossingPenalty;
}

function buildGeometryForPlacement(
  group: PendingPlaceGroup,
  placement: FootprintPlacement,
): GroupGeometry {
  const translatedPhotoRect = {
    left: group.collisionGeometry.photoRect.left + placement.centerX,
    right: group.collisionGeometry.photoRect.right + placement.centerX,
    top: group.collisionGeometry.photoRect.top + placement.centerY,
    bottom: group.collisionGeometry.photoRect.bottom + placement.centerY,
  };
  const labelSide = resolvePreferredLabelSide(placement.centerX, placement.centerY);
  return buildGroupGeometryFromPhotoRect(
    translatedPhotoRect,
    group.placePhotos[0]?.placeTitle || '',
    group.placePhotos.length,
    1,
    labelSide,
  );
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
  const result = new Map<string, FootprintPlacement>();
  const geometryById = new Map<string, GroupGeometry>();
  const placed: PlacedEntry[] = [];
  const ordered = [...groups].sort((left, right) => compareGroupOrder(left, right, basePlacementById));

  for (const group of ordered) {
    const basePlacement = basePlacementById.get(group.placeKey);
    if (!basePlacement) continue;
    const baseAngle = Math.atan2(basePlacement.centerY, basePlacement.centerX);
    const baseRadius = Math.hypot(basePlacement.centerX, basePlacement.centerY);
    let bestPlacement = basePlacement;
    let bestGeometry = buildGeometryForPlacement(group, basePlacement);
    let bestScore = scoreCandidate(bestPlacement, bestGeometry, placed, basePlacement, group);

    for (const radiusStep of RADIUS_STEPS) {
      const radius = Math.max(0, baseRadius + radiusStep);
      for (const angleStep of ANGLE_STEPS) {
        const angle = baseAngle + (angleStep * Math.PI) / 180;
        const placement = {
          centerX: Math.cos(angle) * radius,
          centerY: Math.sin(angle) * radius,
        };
        const geometry = buildGeometryForPlacement(group, placement);
        if (!fitsAroundMap(geometry.overallRect, mapRect, MAP_GAP)) continue;
        const score = scoreCandidate(placement, geometry, placed, basePlacement, group);
        if (score < bestScore - 1e-6) {
          bestPlacement = placement;
          bestGeometry = geometry;
          bestScore = score;
        }
      }
    }

    result.set(group.placeKey, bestPlacement);
    geometryById.set(group.placeKey, bestGeometry);
    placed.push({
      group,
      placement: bestPlacement,
      geometry: bestGeometry,
    });
  }

  return {
    placements: result,
    geometries: geometryById,
  };
}
