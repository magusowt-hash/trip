import type { FootprintPlacement } from './footprintLayoutTypes';

export type OuterShellEnvelope = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  spanX: number;
  spanY: number;
};

export function buildOuterShellPlaceKeys(
  placementById: Map<string, FootprintPlacement>,
  edgeSlack = 120,
) {
  const placements = Array.from(placementById.entries());
  if (placements.length === 0) return new Set<string>();

  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const [, placement] of placements) {
    left = Math.min(left, placement.centerX);
    right = Math.max(right, placement.centerX);
    top = Math.min(top, placement.centerY);
    bottom = Math.max(bottom, placement.centerY);
  }

  const shell = new Set<string>();
  for (const [placeKey, placement] of placements) {
    if (
      placement.centerX <= left + edgeSlack ||
      placement.centerX >= right - edgeSlack ||
      placement.centerY <= top + edgeSlack ||
      placement.centerY >= bottom - edgeSlack
    ) {
      shell.add(placeKey);
    }
  }

  return shell;
}

export function computeOuterShellEnvelope(
  placementById: Map<string, FootprintPlacement>,
  shellPlaceKeys: Set<string>,
): OuterShellEnvelope {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  shellPlaceKeys.forEach((placeKey) => {
    const placement = placementById.get(placeKey);
    if (!placement) return;
    left = Math.min(left, placement.centerX);
    right = Math.max(right, placement.centerX);
    top = Math.min(top, placement.centerY);
    bottom = Math.max(bottom, placement.centerY);
  });

  if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
    return {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      spanX: 0,
      spanY: 0,
    };
  }

  return {
    left,
    right,
    top,
    bottom,
    spanX: right - left,
    spanY: bottom - top,
  };
}

export function isOuterShellEnvelopeImproved(
  current: OuterShellEnvelope,
  next: OuterShellEnvelope,
) {
  const leftImproved = next.left >= current.left - 1e-6;
  const rightImproved = next.right <= current.right + 1e-6;
  const topImproved = next.top >= current.top - 1e-6;
  const bottomImproved = next.bottom <= current.bottom + 1e-6;
  const spanImproved = next.spanX <= current.spanX + 1e-6 && next.spanY <= current.spanY + 1e-6;
  const strictlyImproved =
    next.spanX < current.spanX - 1e-6 ||
    next.spanY < current.spanY - 1e-6;

  return leftImproved && rightImproved && topImproved && bottomImproved && spanImproved && strictlyImproved;
}
