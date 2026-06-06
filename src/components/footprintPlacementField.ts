import type { FootprintPlacement, LogicalRect, PendingPlaceGroup } from './footprintLayoutTypes';
import type { GroupGeometry } from './localMapGroupGeometry';

export type PolarBlockedBand = {
  angleStart: number;
  angleEnd: number;
  radiusInner: number;
  radiusOuter: number;
};

export type PolarFreeArc = {
  angleStart: number;
  angleEnd: number;
};

export type PlacementFieldCandidate = {
  placement: FootprintPlacement;
  radius: number;
  angle: number;
  freeArc: PolarFreeArc;
};

export type PlacementFieldSearchResult = {
  candidate: PlacementFieldCandidate | null;
  scannedRadius: number;
  freeArcs: PolarFreeArc[];
  candidates: PlacementFieldCandidate[];
};

export type EnclosureScore = {
  fragmentPenalty: number;
  narrowPenalty: number;
  concavityPenalty: number;
  total: number;
};

export type FreeArcAccessScore = {
  fitPenalty: number;
  offsetPenalty: number;
  squeezePenalty: number;
  total: number;
};

export type PlacementSector = {
  start: number;
  end: number;
  isTransition: boolean;
};

const FULL_TURN = Math.PI * 2;
const DEFAULT_RADIUS_STEP = 24;
const DEFAULT_RADIUS_SCAN_LIMIT = 18;
const DEFAULT_MIN_FREE_ARC = Math.PI / 36;
const TRANSITION_HALF_SPAN = Math.PI / 10;
const LOWER_REGION_CENTER = Math.PI / 2;

function normalizeAngle(angle: number) {
  const normalized = angle % FULL_TURN;
  return normalized >= 0 ? normalized : normalized + FULL_TURN;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function angleDistance(left: number, right: number) {
  let delta = normalizeAngle(left) - normalizeAngle(right);
  if (delta > Math.PI) delta -= FULL_TURN;
  if (delta < -Math.PI) delta += FULL_TURN;
  return delta;
}

export function resolvePlacementSector(idealAngle: number): PlacementSector {
  const angle = normalizeAngle(idealAngle);
  const lowerDelta = angleDistance(angle, LOWER_REGION_CENTER);
  const rightLowerBoundary = Math.PI / 4;
  const leftLowerBoundary = (Math.PI * 3) / 4;

  if (Math.abs(lowerDelta) <= TRANSITION_HALF_SPAN) {
    return {
      start: normalizeAngle(LOWER_REGION_CENTER - TRANSITION_HALF_SPAN),
      end: normalizeAngle(LOWER_REGION_CENTER + TRANSITION_HALF_SPAN),
      isTransition: false,
    };
  }

  if (Math.abs(angleDistance(angle, rightLowerBoundary)) <= TRANSITION_HALF_SPAN) {
    return {
      start: normalizeAngle(rightLowerBoundary - TRANSITION_HALF_SPAN),
      end: normalizeAngle(rightLowerBoundary + TRANSITION_HALF_SPAN),
      isTransition: true,
    };
  }

  if (Math.abs(angleDistance(angle, leftLowerBoundary)) <= TRANSITION_HALF_SPAN) {
    return {
      start: normalizeAngle(leftLowerBoundary - TRANSITION_HALF_SPAN),
      end: normalizeAngle(leftLowerBoundary + TRANSITION_HALF_SPAN),
      isTransition: true,
    };
  }

  if (angle > rightLowerBoundary && angle < leftLowerBoundary) {
    return {
      start: normalizeAngle(rightLowerBoundary + TRANSITION_HALF_SPAN),
      end: normalizeAngle(leftLowerBoundary - TRANSITION_HALF_SPAN),
      isTransition: false,
    };
  }

  if (angle >= leftLowerBoundary) {
    return {
      start: normalizeAngle(leftLowerBoundary + TRANSITION_HALF_SPAN),
      end: normalizeAngle(Math.PI * 1.25),
      isTransition: false,
    };
  }

  return {
    start: normalizeAngle(-Math.PI * 0.25),
    end: normalizeAngle(rightLowerBoundary - TRANSITION_HALF_SPAN),
    isTransition: false,
  };
}

function rectCenter(rect: LogicalRect) {
  return {
    x: (rect.left + rect.right) * 0.5,
    y: (rect.top + rect.bottom) * 0.5,
  };
}

function rectRadius(rect: LogicalRect) {
  const center = rectCenter(rect);
  const halfWidth = Math.max(1, (rect.right - rect.left) * 0.5);
  const halfHeight = Math.max(1, (rect.bottom - rect.top) * 0.5);
  return Math.hypot(center.x, center.y) + Math.hypot(halfWidth, halfHeight);
}

function groupSpanAngle(geometry: GroupGeometry, radius: number) {
  const width = Math.max(1, geometry.groupRect.right - geometry.groupRect.left);
  const height = Math.max(1, geometry.groupRect.bottom - geometry.groupRect.top);
  const span = Math.max(width, height);
  return Math.max(DEFAULT_MIN_FREE_ARC, Math.min(Math.PI * 0.75, span / Math.max(radius, 1)));
}

export function buildBlockedBandFromGeometry(
  geometry: GroupGeometry,
  paddingRadius: number,
  paddingAngle = 0,
): PolarBlockedBand {
  const center = rectCenter(geometry.groupRect);
  const angle = normalizeAngle(Math.atan2(center.y, center.x));
  const radius = Math.hypot(center.x, center.y);
  const spanAngle = groupSpanAngle(geometry, radius) * 0.5 + paddingAngle;
  const radialSpan = rectRadius(geometry.groupRect);

  return {
    angleStart: normalizeAngle(angle - spanAngle),
    angleEnd: normalizeAngle(angle + spanAngle),
    radiusInner: Math.max(0, radius - radialSpan - paddingRadius),
    radiusOuter: radius + radialSpan + paddingRadius,
  };
}

function splitWrappedArc(arc: PolarFreeArc): PolarFreeArc[] {
  if (arc.angleStart <= arc.angleEnd) return [arc];
  return [
    { angleStart: 0, angleEnd: arc.angleEnd },
    { angleStart: arc.angleStart, angleEnd: FULL_TURN },
  ];
}

function subtractArc(source: PolarFreeArc, blocked: PolarFreeArc) {
  if (blocked.angleEnd <= source.angleStart || blocked.angleStart >= source.angleEnd) {
    return [source];
  }

  const arcs: PolarFreeArc[] = [];
  if (blocked.angleStart > source.angleStart) {
    arcs.push({ angleStart: source.angleStart, angleEnd: blocked.angleStart });
  }
  if (blocked.angleEnd < source.angleEnd) {
    arcs.push({ angleStart: blocked.angleEnd, angleEnd: source.angleEnd });
  }
  return arcs.filter((arc) => arc.angleEnd - arc.angleStart >= DEFAULT_MIN_FREE_ARC);
}

export function computeFreeArcsAtRadius(
  blockedBands: PolarBlockedBand[],
  radius: number,
  sectorStart = 0,
  sectorEnd = FULL_TURN,
) {
  let freeArcs: PolarFreeArc[] = [{ angleStart: normalizeAngle(sectorStart), angleEnd: normalizeAngle(sectorEnd) }];
  if (normalizeAngle(sectorStart) === normalizeAngle(sectorEnd)) {
    freeArcs = [{ angleStart: 0, angleEnd: FULL_TURN }];
  } else {
    freeArcs = splitWrappedArc(freeArcs[0]!);
  }

  for (const band of blockedBands) {
    if (radius < band.radiusInner || radius > band.radiusOuter) continue;
    const blockedArcs = splitWrappedArc({
      angleStart: band.angleStart,
      angleEnd: band.angleEnd,
    });
    for (const blockedArc of blockedArcs) {
      freeArcs = freeArcs.flatMap((arc) => subtractArc(arc, blockedArc));
      if (freeArcs.length === 0) return [];
    }
  }

  return freeArcs.filter((arc) => arc.angleEnd - arc.angleStart >= DEFAULT_MIN_FREE_ARC);
}

export function selectCenteredAngleInFreeArc(
  freeArc: PolarFreeArc,
  idealAngle: number,
  requiredSpanAngle: number,
) {
  const halfSpan = requiredSpanAngle * 0.5;
  const minAngle = freeArc.angleStart + halfSpan;
  const maxAngle = freeArc.angleEnd - halfSpan;
  if (maxAngle < minAngle) return null;

  const idealNormalized = normalizeAngle(idealAngle);
  const centeredIdeal = clamp(idealNormalized, minAngle, maxAngle);
  const arcCenter = (freeArc.angleStart + freeArc.angleEnd) * 0.5;

  // Prefer the free-arc center first, then softly pull toward the ideal angle.
  return clamp((arcCenter * 0.65) + (centeredIdeal * 0.35), minAngle, maxAngle);
}

function scoreAngleWithinFreeArc(
  freeArc: PolarFreeArc,
  angle: number,
  idealAngle: number,
) {
  const leftMargin = angle - freeArc.angleStart;
  const rightMargin = freeArc.angleEnd - angle;
  const balancePenalty = Math.abs(leftMargin - rightMargin);
  const idealPenalty = Math.abs(angleDistance(angle, idealAngle));
  const smallestMargin = Math.min(leftMargin, rightMargin);
  return balancePenalty * 0.62 + idealPenalty * 0.18 - smallestMargin * 0.2;
}

export function scoreFreeArcAccess(
  freeArcs: PolarFreeArc[],
  idealAngle: number,
  requiredSpanAngle: number,
): FreeArcAccessScore {
  const halfSpan = requiredSpanAngle * 0.5;
  const viableArcs = freeArcs.filter((arc) => (arc.angleEnd - arc.angleStart) >= requiredSpanAngle);
  if (viableArcs.length === 0) {
    return {
      fitPenalty: 1_000_000,
      offsetPenalty: 1_000_000,
      squeezePenalty: 1_000_000,
      total: 3_000_000,
    };
  }

  const normalizedIdeal = normalizeAngle(idealAngle);
  let bestScore: FreeArcAccessScore | null = null;

  for (const arc of viableArcs) {
    const minAngle = arc.angleStart + halfSpan;
    const maxAngle = arc.angleEnd - halfSpan;
    if (maxAngle < minAngle) continue;

    const clampedIdeal = clamp(normalizedIdeal, minAngle, maxAngle);
    const offsetPenalty = Math.abs(clampedIdeal - normalizedIdeal) * 220;
    const squeezePenalty = Math.max(0, requiredSpanAngle * 1.8 - (arc.angleEnd - arc.angleStart)) * 140;
    const fitPenalty = Math.max(0, requiredSpanAngle - (arc.angleEnd - arc.angleStart)) * 800;
    const score = {
      fitPenalty,
      offsetPenalty,
      squeezePenalty,
      total: fitPenalty + offsetPenalty + squeezePenalty,
    };

    if (!bestScore || score.total < bestScore.total) {
      bestScore = score;
    }
  }

  return bestScore ?? {
    fitPenalty: 1_000_000,
    offsetPenalty: 1_000_000,
    squeezePenalty: 1_000_000,
    total: 3_000_000,
  };
}

export function scoreFreeArcStructure(freeArcs: PolarFreeArc[]) : EnclosureScore {
  if (freeArcs.length === 0) {
    return {
      fragmentPenalty: 1_000_000,
      narrowPenalty: 1_000_000,
      concavityPenalty: 1_000_000,
      total: 3_000_000,
    };
  }

  const widths = freeArcs.map((arc) => arc.angleEnd - arc.angleStart);
  const minWidth = Math.min(...widths);
  const maxWidth = Math.max(...widths);
  const fragmentPenalty = Math.max(0, freeArcs.length - 1) * 40;
  const narrowPenalty = Math.max(0, DEFAULT_MIN_FREE_ARC * 2.4 - minWidth) * 240;
  const concavityPenalty = Math.max(0, maxWidth - minWidth) * 36;

  return {
    fragmentPenalty,
    narrowPenalty,
    concavityPenalty,
    total: fragmentPenalty + narrowPenalty + concavityPenalty,
  };
}

export function selectBalancedAngleInFreeArc(
  freeArc: PolarFreeArc,
  idealAngle: number,
  requiredSpanAngle: number,
) {
  const halfSpan = requiredSpanAngle * 0.5;
  const minAngle = freeArc.angleStart + halfSpan;
  const maxAngle = freeArc.angleEnd - halfSpan;
  if (maxAngle < minAngle) return null;

  const center = (freeArc.angleStart + freeArc.angleEnd) * 0.5;
  const leftCandidate = minAngle;
  const rightCandidate = maxAngle;
  const centeredIdeal = clamp(normalizeAngle(idealAngle), minAngle, maxAngle);
  const candidates = Array.from(new Set([
    leftCandidate,
    center,
    rightCandidate,
    centeredIdeal,
    clamp((center * 0.6) + (centeredIdeal * 0.4), minAngle, maxAngle),
  ]));

  let bestAngle: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidateAngle of candidates) {
    const score = scoreAngleWithinFreeArc(freeArc, candidateAngle, idealAngle);
    if (score < bestScore) {
      bestScore = score;
      bestAngle = candidateAngle;
    }
  }

  return bestAngle;
}

export function findPlacementInField(
  group: PendingPlaceGroup,
  geometry: GroupGeometry,
  blockedBands: PolarBlockedBand[],
  options?: {
    idealAngle?: number;
    idealRadius?: number;
    minRadius?: number;
    radiusStep?: number;
    radiusScanLimit?: number;
    sectorStart?: number;
    sectorEnd?: number;
  },
): PlacementFieldSearchResult {
  const idealAngle = options?.idealAngle ?? Math.atan2(group.logicalY, group.logicalX);
  const idealRadius = options?.idealRadius ?? Math.hypot(group.logicalX, group.logicalY);
  const minRadius = Math.max(options?.minRadius ?? 0, idealRadius);
  const radiusStep = options?.radiusStep ?? DEFAULT_RADIUS_STEP;
  const radiusScanLimit = options?.radiusScanLimit ?? DEFAULT_RADIUS_SCAN_LIMIT;
  const requiredSpanAngle = groupSpanAngle(geometry, Math.max(minRadius, 1));
  const sector = (
    options?.sectorStart != null && options?.sectorEnd != null
      ? { start: options.sectorStart, end: options.sectorEnd, isTransition: false }
      : resolvePlacementSector(idealAngle)
  );

  let lastFreeArcs: PolarFreeArc[] = [];
  const rankedCandidates: PlacementFieldCandidate[] = [];
  for (let stepIndex = 0; stepIndex <= radiusScanLimit; stepIndex++) {
    const radius = minRadius + stepIndex * radiusStep;
    const freeArcs = computeFreeArcsAtRadius(
      blockedBands,
      radius,
      sector.start,
      sector.end,
    );
    lastFreeArcs = freeArcs;
    const candidatesAtRadius: PlacementFieldCandidate[] = [];
    for (const freeArc of freeArcs) {
      const angle = selectBalancedAngleInFreeArc(freeArc, idealAngle, requiredSpanAngle);
      if (angle == null) continue;
      candidatesAtRadius.push({
        placement: {
          centerX: Math.cos(angle) * radius,
          centerY: Math.sin(angle) * radius,
        },
        radius,
        angle,
        freeArc,
      });
    }

    if (candidatesAtRadius.length > 0) {
      const sortedAtRadius = [...candidatesAtRadius].sort((left, right) => (
        scoreAngleWithinFreeArc(left.freeArc, left.angle, idealAngle) -
        scoreAngleWithinFreeArc(right.freeArc, right.angle, idealAngle)
      ));
      rankedCandidates.push(...sortedAtRadius.slice(0, Math.min(3, sortedAtRadius.length)));
      if (rankedCandidates.length >= 6) {
        break;
      }
    }
  }

  if (rankedCandidates.length > 0) {
    const candidate = [...rankedCandidates].sort((left, right) => {
      const leftRadiusPenalty = Math.abs(left.radius - idealRadius) * 0.08;
      const rightRadiusPenalty = Math.abs(right.radius - idealRadius) * 0.08;
      return (
        scoreAngleWithinFreeArc(left.freeArc, left.angle, idealAngle) + leftRadiusPenalty -
        (scoreAngleWithinFreeArc(right.freeArc, right.angle, idealAngle) + rightRadiusPenalty)
      );
    })[0]!;
    return {
      candidate,
      scannedRadius: candidate.radius,
      freeArcs: lastFreeArcs,
      candidates: rankedCandidates,
    };
  }

  return {
    candidate: null,
    scannedRadius: minRadius + radiusScanLimit * radiusStep,
    freeArcs: lastFreeArcs,
    candidates: [],
  };
}
