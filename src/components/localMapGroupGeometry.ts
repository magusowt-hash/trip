import type { PhotoItem } from './OuterFrameCanvas';

export type GroupLabelSide = 'top' | 'bottom' | 'left' | 'right';

export type LogicalRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type GroupGeometry = {
  photoRect: LogicalRect;
  labelRect: LogicalRect;
  lineRect: LogicalRect;
  groupRect: LogicalRect;
  overallRect: LogicalRect;
  photoCenterX: number;
  photoCenterY: number;
  labelSide: GroupLabelSide;
  labelAnchorX: number;
  labelAnchorY: number;
  lineAnchorX: number;
  lineAnchorY: number;
};

type SizeReader = (photo: Pick<PhotoItem, 'pixelWidth' | 'pixelHeight'>) => { width: number; height: number };
type GroupGeometryEntry<T extends string = string> = {
  id: T;
  geometry: GroupGeometry;
};

type LabelPlacementVariant = {
  side: GroupLabelSide;
  lane: number;
  dx: number;
  dy: number;
};

export const GROUP_LABEL_FONT_SCREEN_SIZE = 10;
export const GROUP_LABEL_MIN_FONT_SCREEN_SIZE = 9;
export const GROUP_LABEL_HEIGHT_SCREEN = 13;
export const GROUP_ENDPOINT_RADIUS_SCREEN = 4;

const PHOTO_RECT_PADDING = 40;
const PHOTO_BOTTOM_EXTRA = 20;
const PHOTO_TO_LINE_SCREEN_GAP_MIN = 1;
const PHOTO_TO_LINE_SCREEN_GAP_MAX = 4;
const LINE_TO_LABEL_SCREEN_GAP_MIN = 0;
const LINE_TO_LABEL_SCREEN_GAP_MAX = 2;
const LABEL_MAX_SCREEN_WIDTH = 98;
const GAP_AREA_MIN = 180 * 140;
const GAP_AREA_MAX = 420 * 260;
const SMALL_GROUP_COUNT_MAX = 4;
const SMALL_GROUP_TIGHTEN_MAX = 0.7;
const HARD_OVERLAP_WEIGHT = 1000;
const SOFT_GAP_WEIGHT = 20;
const LABEL_LANE_SCREEN_STEP = 14;
const LABEL_LATERAL_SCREEN_STEP = 18;

function toLogicalScreenSize(screenSize: number, scale: number) {
  return screenSize / Math.max(scale, 0.1);
}

function unionRect(a: LogicalRect, b: LogicalRect): LogicalRect {
  return {
    left: Math.min(a.left, b.left),
    right: Math.max(a.right, b.right),
    top: Math.min(a.top, b.top),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

export function rectsOverlap(a: LogicalRect, b: LogicalRect, gap: number) {
  return !(
    a.right + gap <= b.left ||
    b.right + gap <= a.left ||
    a.bottom + gap <= b.top ||
    b.bottom + gap <= a.top
  );
}

function rectOverlapArea(a: LogicalRect, b: LogicalRect) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function rectGapDistance(a: LogicalRect, b: LogicalRect) {
  const dx = Math.max(0, Math.max(b.left - a.right, a.left - b.right));
  const dy = Math.max(0, Math.max(b.top - a.bottom, a.top - b.bottom));
  return Math.hypot(dx, dy);
}

function rectCenter(rect: LogicalRect) {
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  };
}

export function translateLogicalRect(rect: LogicalRect, offsetX: number, offsetY: number): LogicalRect {
  return {
    left: rect.left + offsetX,
    right: rect.right + offsetX,
    top: rect.top + offsetY,
    bottom: rect.bottom + offsetY,
  };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function lerp(min: number, max: number, t: number) {
  return min + (max - min) * t;
}

function buildAdaptiveGapScreenSize(
  min: number,
  max: number,
  areaFactor: number,
  photoCount: number,
) {
  const smallGroupProgress = clamp01((SMALL_GROUP_COUNT_MAX - photoCount) / Math.max(1, SMALL_GROUP_COUNT_MAX - 1));
  const tightenedFactor = clamp01(areaFactor - smallGroupProgress * SMALL_GROUP_TIGHTEN_MAX);
  return lerp(min, max, tightenedFactor);
}

function estimateLabelHalfWidth(title: string, scale: number) {
  const safeScale = Math.max(scale, 0.1);
  const compactTitle = title.trim();
  const cjkCount = Array.from(compactTitle).filter((char) => /[\u3400-\u9fff\uf900-\ufaff]/.test(char)).length;
  const latinCount = Math.max(0, compactTitle.length - cjkCount);
  const estimatedScreenWidth =
    38 +
    cjkCount * GROUP_LABEL_FONT_SCREEN_SIZE * 1.1 +
    latinCount * GROUP_LABEL_FONT_SCREEN_SIZE * 0.74;
  return Math.max(
    toLogicalScreenSize(50, safeScale),
    Math.min(toLogicalScreenSize(LABEL_MAX_SCREEN_WIDTH + 40, safeScale), toLogicalScreenSize(estimatedScreenWidth, safeScale) / 2),
  );
}

function buildLabelPlacementVariants(): LabelPlacementVariant[] {
  return [
    { side: 'bottom', lane: 0, dx: 0, dy: 0 },
    { side: 'bottom', lane: 1, dx: 0, dy: 1 },
    { side: 'bottom', lane: 0, dx: -1, dy: 0 },
    { side: 'bottom', lane: 0, dx: 1, dy: 0 },
    { side: 'right', lane: 0, dx: 0, dy: 0 },
    { side: 'left', lane: 0, dx: 0, dy: 0 },
    { side: 'top', lane: 0, dx: 0, dy: 0 },
    { side: 'top', lane: 1, dx: 0, dy: -1 },
    { side: 'right', lane: 1, dx: 1, dy: 0 },
    { side: 'left', lane: 1, dx: -1, dy: 0 },
  ];
}

export function expandPhotoRect(photoRect: LogicalRect): LogicalRect {
  return {
    left: photoRect.left - PHOTO_RECT_PADDING,
    right: photoRect.right + PHOTO_RECT_PADDING,
    top: photoRect.top - PHOTO_RECT_PADDING,
    bottom: photoRect.bottom + PHOTO_RECT_PADDING + PHOTO_BOTTOM_EXTRA,
  };
}

export function buildPhotoRect(
  groupPhotos: Array<Pick<PhotoItem, 'frameX' | 'frameY' | 'pixelWidth' | 'pixelHeight'>>,
  getPhotoLogicalSize: SizeReader,
): LogicalRect | null {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (const photo of groupPhotos) {
    if (photo.frameX == null || photo.frameY == null) continue;
    const size = getPhotoLogicalSize(photo);
    left = Math.min(left, photo.frameX - size.width / 2);
    right = Math.max(right, photo.frameX + size.width / 2);
    top = Math.min(top, photo.frameY - size.height / 2);
    bottom = Math.max(bottom, photo.frameY + size.height / 2);
  }

  if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
    return null;
  }

  return expandPhotoRect({ left, right, top, bottom });
}

export function buildGroupGeometryFromPhotoRect(
  photoRect: LogicalRect,
  title: string,
  photoCount = 1,
  scale = 1,
): GroupGeometry {
  return buildGroupGeometryFromPhotoRectWithVariant(
    photoRect,
    title,
    photoCount,
    scale,
    { side: 'bottom', lane: 0, dx: 0, dy: 0 },
  );
}

export function buildGroupGeometryFromPhotoRectWithVariant(
  photoRect: LogicalRect,
  title: string,
  photoCount = 1,
  scale = 1,
  variant: LabelPlacementVariant = { side: 'bottom', lane: 0, dx: 0, dy: 0 },
): GroupGeometry {
  const safeScale = Math.max(scale, 0.1);
  const photoCenter = rectCenter(photoRect);
  const labelSide: GroupLabelSide = variant.side;
  const labelHalfWidth = estimateLabelHalfWidth(title, safeScale);
  const lineAnchorRadius = toLogicalScreenSize(GROUP_ENDPOINT_RADIUS_SCREEN, safeScale);
  const photoWidth = Math.max(1, photoRect.right - photoRect.left);
  const photoHeight = Math.max(1, photoRect.bottom - photoRect.top);
  const photoArea = photoWidth * photoHeight;
  const areaFactor = clamp01((photoArea - GAP_AREA_MIN) / Math.max(1, GAP_AREA_MAX - GAP_AREA_MIN));
  const photoToLineGap = toLogicalScreenSize(
    buildAdaptiveGapScreenSize(PHOTO_TO_LINE_SCREEN_GAP_MIN, PHOTO_TO_LINE_SCREEN_GAP_MAX, areaFactor, photoCount),
    safeScale,
  );
  const lineToLabelGap = toLogicalScreenSize(
    buildAdaptiveGapScreenSize(LINE_TO_LABEL_SCREEN_GAP_MIN, LINE_TO_LABEL_SCREEN_GAP_MAX, areaFactor, photoCount),
    safeScale,
  );
  const labelHalfHeight = toLogicalScreenSize(GROUP_LABEL_HEIGHT_SCREEN, safeScale) / 2;
  const laneOffset = toLogicalScreenSize(LABEL_LANE_SCREEN_STEP * variant.lane, safeScale);
  const lateralOffsetX = toLogicalScreenSize(LABEL_LATERAL_SCREEN_STEP * variant.dx, safeScale);
  const lateralOffsetY = toLogicalScreenSize(LABEL_LATERAL_SCREEN_STEP * variant.dy, safeScale);
  const lineAnchorX =
    labelSide === 'left' ? photoRect.left - photoToLineGap :
    labelSide === 'right' ? photoRect.right + photoToLineGap :
    photoCenter.x + lateralOffsetX;
  const lineAnchorY =
    labelSide === 'top' ? photoRect.top - photoToLineGap :
    labelSide === 'bottom' ? photoRect.bottom + photoToLineGap :
    photoCenter.y + lateralOffsetY;
  const labelAnchorX =
    labelSide === 'left'
      ? lineAnchorX - lineAnchorRadius - lineToLabelGap - labelHalfWidth - laneOffset
      : labelSide === 'right'
        ? lineAnchorX + lineAnchorRadius + lineToLabelGap + labelHalfWidth + laneOffset
        : photoCenter.x + lateralOffsetX;
  const labelAnchorY =
    labelSide === 'top'
      ? lineAnchorY - lineAnchorRadius - lineToLabelGap - labelHalfHeight - laneOffset
      : labelSide === 'bottom'
        ? lineAnchorY + lineAnchorRadius + lineToLabelGap + labelHalfHeight + laneOffset
        : photoCenter.y + lateralOffsetY;
  const labelRect: LogicalRect = {
    left: labelAnchorX - labelHalfWidth,
    right: labelAnchorX + labelHalfWidth,
    top: labelAnchorY - labelHalfHeight,
    bottom: labelAnchorY + labelHalfHeight,
  };

  const lineRect: LogicalRect = {
    left: lineAnchorX - lineAnchorRadius,
    right: lineAnchorX + lineAnchorRadius,
    top: lineAnchorY - lineAnchorRadius,
    bottom: lineAnchorY + lineAnchorRadius,
  };

  const groupRect = unionRect(unionRect(photoRect, labelRect), lineRect);
  const overallRect = groupRect;

  return {
    photoRect,
    labelRect,
    lineRect,
    groupRect,
    overallRect,
    photoCenterX: photoCenter.x,
    photoCenterY: photoCenter.y,
    labelSide,
    labelAnchorX,
    labelAnchorY,
    lineAnchorX,
    lineAnchorY,
  };
}

export function buildGroupGeometryCandidatesFromPhotoRect(
  photoRect: LogicalRect,
  title: string,
  photoCount = 1,
  scale = 1,
) {
  return buildLabelPlacementVariants().map((variant) => (
    buildGroupGeometryFromPhotoRectWithVariant(photoRect, title, photoCount, scale, variant)
  ));
}

export function buildGroupGeometryLabelCandidates(
  geometry: GroupGeometry,
) {
  const photoCenter = rectCenter(geometry.photoRect);
  const labelHalfWidth = Math.max(1, (geometry.labelRect.right - geometry.labelRect.left) / 2);
  const labelHalfHeight = Math.max(1, (geometry.labelRect.bottom - geometry.labelRect.top) / 2);
  const lineAnchorRadius = Math.max(1, (geometry.lineRect.right - geometry.lineRect.left) / 2);
  const verticalGap =
    geometry.labelRect.top - geometry.lineRect.bottom > 0
      ? geometry.labelRect.top - geometry.lineRect.bottom
      : geometry.lineRect.top - geometry.labelRect.bottom;
  const horizontalGap =
    geometry.labelRect.left - geometry.lineRect.right > 0
      ? geometry.labelRect.left - geometry.lineRect.right
      : geometry.lineRect.left - geometry.labelRect.right;
  const laneStep = Math.max(labelHalfHeight, labelHalfWidth) * 0.5;
  const lateralStep = Math.max(labelHalfHeight, labelHalfWidth) * 0.65;

  const variants = buildLabelPlacementVariants();
  return variants.map((variant) => {
    const laneOffset = laneStep * variant.lane;
    const lateralOffsetX = lateralStep * variant.dx;
    const lateralOffsetY = lateralStep * variant.dy;
    const lineAnchorX =
      variant.side === 'left' ? geometry.photoRect.left - lineAnchorRadius :
      variant.side === 'right' ? geometry.photoRect.right + lineAnchorRadius :
      photoCenter.x + lateralOffsetX;
    const lineAnchorY =
      variant.side === 'top' ? geometry.photoRect.top - lineAnchorRadius :
      variant.side === 'bottom' ? geometry.photoRect.bottom + lineAnchorRadius :
      photoCenter.y + lateralOffsetY;
    const labelAnchorX =
      variant.side === 'left'
        ? lineAnchorX - horizontalGap - labelHalfWidth - laneOffset
        : variant.side === 'right'
          ? lineAnchorX + horizontalGap + labelHalfWidth + laneOffset
          : photoCenter.x + lateralOffsetX;
    const labelAnchorY =
      variant.side === 'top'
        ? lineAnchorY - verticalGap - labelHalfHeight - laneOffset
        : variant.side === 'bottom'
          ? lineAnchorY + verticalGap + labelHalfHeight + laneOffset
          : photoCenter.y + lateralOffsetY;
    const labelRect: LogicalRect = {
      left: labelAnchorX - labelHalfWidth,
      right: labelAnchorX + labelHalfWidth,
      top: labelAnchorY - labelHalfHeight,
      bottom: labelAnchorY + labelHalfHeight,
    };
    const lineRect: LogicalRect = {
      left: lineAnchorX - lineAnchorRadius,
      right: lineAnchorX + lineAnchorRadius,
      top: lineAnchorY - lineAnchorRadius,
      bottom: lineAnchorY + lineAnchorRadius,
    };
    const groupRect = unionRect(unionRect(geometry.photoRect, labelRect), lineRect);
    return {
      ...geometry,
      labelSide: variant.side,
      labelRect,
      lineRect,
      groupRect,
      overallRect: groupRect,
      labelAnchorX,
      labelAnchorY,
      lineAnchorX,
      lineAnchorY,
    };
  });
}

export function selectBestGroupGeometryLabelCandidate(
  geometry: GroupGeometry,
  occupiedGeometries: GroupGeometry[],
  mapRect?: LogicalRect,
  safeGap = 10,
) {
  const candidates = [geometry, ...buildGroupGeometryLabelCandidates(geometry)];
  let best = geometry;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    let score = 0;
    for (const occupied of occupiedGeometries) {
      score += scoreGroupGeometryPlacement(candidate, [occupied], safeGap);
      const verticalCenterGap = Math.abs(candidate.photoCenterY - occupied.photoCenterY);
      const horizontalCenterGap = Math.abs(candidate.photoCenterX - occupied.photoCenterX);
      const occupiedOnRight = occupied.photoCenterX >= candidate.photoCenterX;
      const occupiedOnBottom = occupied.photoCenterY >= candidate.photoCenterY;
      if (verticalCenterGap < 180) {
        const verticalCongestion = 180 - verticalCenterGap;
        if (candidate.labelSide === 'bottom' || candidate.labelSide === 'top') {
          score += verticalCongestion * 8;
        } else {
          score -= verticalCongestion * 1.2;
        }
      }
      if (verticalCenterGap < 260 && horizontalCenterGap < 260) {
        const localCongestion = (260 - verticalCenterGap) + (260 - horizontalCenterGap);
        if (
          (candidate.labelSide === 'right' && occupiedOnRight) ||
          (candidate.labelSide === 'left' && !occupiedOnRight) ||
          (candidate.labelSide === 'bottom' && occupiedOnBottom) ||
          (candidate.labelSide === 'top' && !occupiedOnBottom)
        ) {
          score += localCongestion * 2.8;
        } else {
          score -= localCongestion * 0.55;
        }
      }
    }
    if (mapRect) {
      const photoMapDx = Math.max(0, Math.max(mapRect.left - candidate.photoRect.right, candidate.photoRect.left - mapRect.right));
      const photoMapDy = Math.max(0, Math.max(mapRect.top - candidate.photoRect.bottom, candidate.photoRect.top - mapRect.bottom));
      const labelMapDx = Math.max(0, Math.max(mapRect.left - candidate.labelRect.right, candidate.labelRect.left - mapRect.right));
      const labelMapDy = Math.max(0, Math.max(mapRect.top - candidate.labelRect.bottom, candidate.labelRect.top - mapRect.bottom));
      if (!(candidate.photoRect.right <= mapRect.left - safeGap ||
            candidate.photoRect.left >= mapRect.right + safeGap ||
            candidate.photoRect.bottom <= mapRect.top - safeGap ||
            candidate.photoRect.top >= mapRect.bottom + safeGap)) {
        score += HARD_OVERLAP_WEIGHT * 40;
      }
      if (!(candidate.labelRect.right <= mapRect.left - safeGap ||
            candidate.labelRect.left >= mapRect.right + safeGap ||
            candidate.labelRect.bottom <= mapRect.top - safeGap ||
            candidate.labelRect.top >= mapRect.bottom + safeGap)) {
        score += HARD_OVERLAP_WEIGHT * 30;
      }
      score += (safeGap - Math.hypot(photoMapDx, photoMapDy)) > 0 ? (safeGap - Math.hypot(photoMapDx, photoMapDy)) ** 2 * 30 : 0;
      score += (safeGap - Math.hypot(labelMapDx, labelMapDy)) > 0 ? (safeGap - Math.hypot(labelMapDx, labelMapDy)) ** 2 * 24 : 0;
    }
    const anchorShift =
      Math.abs(candidate.labelAnchorX - geometry.labelAnchorX) +
      Math.abs(candidate.labelAnchorY - geometry.labelAnchorY) +
      Math.abs(candidate.lineAnchorX - geometry.lineAnchorX) +
      Math.abs(candidate.lineAnchorY - geometry.lineAnchorY);
    score += anchorShift * 0.35;
    if (candidate.labelSide === 'left' || candidate.labelSide === 'right') {
      score += 8;
    }
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

export function buildGroupGeometry(
  groupPhotos: Array<Pick<PhotoItem, 'frameX' | 'frameY' | 'pixelWidth' | 'pixelHeight' | 'placeTitle'>>,
  getPhotoLogicalSize: SizeReader,
  scale = 1,
): GroupGeometry | null {
  const photoRect = buildPhotoRect(groupPhotos, getPhotoLogicalSize);
  if (!photoRect) return null;
  const title = groupPhotos[0]?.placeTitle || '';
  return buildGroupGeometryFromPhotoRect(photoRect, title, groupPhotos.length, scale);
}

export function shiftGroupGeometryDown(
  geometry: GroupGeometry,
  deltaY: number,
): GroupGeometry {
  if (deltaY <= 0) return geometry;
  return {
    ...geometry,
    labelRect: {
      left: geometry.labelRect.left,
      right: geometry.labelRect.right,
      top: geometry.labelRect.top + deltaY,
      bottom: geometry.labelRect.bottom + deltaY,
    },
    lineRect: {
      left: geometry.lineRect.left,
      right: geometry.lineRect.right,
      top: geometry.lineRect.top + deltaY,
      bottom: geometry.lineRect.bottom + deltaY,
    },
    groupRect: {
      left: geometry.groupRect.left,
      right: geometry.groupRect.right,
      top: geometry.groupRect.top,
      bottom: geometry.groupRect.bottom + deltaY,
    },
    overallRect: {
      left: geometry.overallRect.left,
      right: geometry.overallRect.right,
      top: geometry.overallRect.top,
      bottom: geometry.overallRect.bottom + deltaY,
    },
    labelAnchorY: geometry.labelAnchorY + deltaY,
    lineAnchorY: geometry.lineAnchorY + deltaY,
  };
}

export function translateGroupGeometry(
  geometry: GroupGeometry,
  offsetX: number,
  offsetY: number,
): GroupGeometry {
  return {
    ...geometry,
    photoRect: translateLogicalRect(geometry.photoRect, offsetX, offsetY),
    labelRect: translateLogicalRect(geometry.labelRect, offsetX, offsetY),
    lineRect: translateLogicalRect(geometry.lineRect, offsetX, offsetY),
    groupRect: translateLogicalRect(geometry.groupRect, offsetX, offsetY),
    overallRect: translateLogicalRect(geometry.overallRect, offsetX, offsetY),
    photoCenterX: geometry.photoCenterX + offsetX,
    photoCenterY: geometry.photoCenterY + offsetY,
    labelAnchorX: geometry.labelAnchorX + offsetX,
    labelAnchorY: geometry.labelAnchorY + offsetY,
    lineAnchorX: geometry.lineAnchorX + offsetX,
    lineAnchorY: geometry.lineAnchorY + offsetY,
  };
}

export function scoreGroupGeometryPlacement(
  candidate: GroupGeometry,
  neighbors: GroupGeometry[],
  safeGap: number,
  options?: {
    labelGapBoost?: number;
  },
): number {
  let score = 0;
  const pairs: Array<[LogicalRect, LogicalRect, number]> = [];
  const labelGapBoost = options?.labelGapBoost ?? 0;
  const labelSafeGap = safeGap + 10 + labelGapBoost;
  const lineLabelSafeGap = safeGap + 6 + labelGapBoost * 0.7;

  for (const neighbor of neighbors) {
    pairs.push(
      [candidate.photoRect, neighbor.photoRect, 1],
      [candidate.photoRect, neighbor.labelRect, 1.3],
      [candidate.labelRect, neighbor.photoRect, 1.3],
      [candidate.labelRect, neighbor.labelRect, 1.25],
      [candidate.lineRect, neighbor.photoRect, 0.9],
      [candidate.photoRect, neighbor.lineRect, 0.9],
      [candidate.lineRect, neighbor.labelRect, 1.2],
      [candidate.labelRect, neighbor.lineRect, 1.2],
      [candidate.lineRect, neighbor.lineRect, 0.8],
    );
  }

  for (const [left, right, weight] of pairs) {
    const overlapArea = rectOverlapArea(left, right);
    if (overlapArea > 0) {
      score += overlapArea * HARD_OVERLAP_WEIGHT * weight;
      continue;
    }
    const effectiveSafeGap =
      weight >= 1.25 ? labelSafeGap : weight >= 1.2 ? lineLabelSafeGap : safeGap;
    const gapDistance = rectGapDistance(left, right);
    if (gapDistance >= effectiveSafeGap) continue;
    const gapPenalty = effectiveSafeGap - gapDistance;
    score += gapPenalty * gapPenalty * SOFT_GAP_WEIGHT * weight;
  }

  return score;
}

export function resolveGroupGeometryDownward<T extends string = string>(
  entries: GroupGeometryEntry<T>[],
  options?: {
    gap?: number;
    step?: number;
    maxOffset?: number;
  },
) {
  const gap = options?.gap ?? 10;
  const step = options?.step ?? 6;
  const maxOffset = options?.maxOffset ?? 108;
  const resolved = new Map<T, GroupGeometry>();
  const occupied: LogicalRect[] = [];
  const sortedEntries = [...entries].sort((left, right) => (
    left.geometry.photoRect.top - right.geometry.photoRect.top ||
    left.geometry.photoCenterX - right.geometry.photoCenterX
  ));

  for (const entry of sortedEntries) {
    let chosen = entry.geometry;
    for (let offset = 0; offset <= maxOffset; offset += step) {
      const candidate = offset === 0 ? entry.geometry : shiftGroupGeometryDown(entry.geometry, offset);
      if (occupied.some((rect) => rectsOverlap(candidate.groupRect, rect, gap))) continue;
      chosen = candidate;
      break;
    }
    resolved.set(entry.id, chosen);
    occupied.push(chosen.groupRect);
  }

  return resolved;
}

export function resolveGroupGeometryLabels<T extends string = string>(
  entries: GroupGeometryEntry<T>[],
  options?: {
    gap?: number;
    step?: number;
    maxOffset?: number;
    mapRect?: LogicalRect;
  },
) {
  const gap = options?.gap ?? 14;
  const resolved = new Map<T, GroupGeometry>();
  const occupied: GroupGeometry[] = [];
  const sortedEntries = [...entries].sort((left, right) => (
    left.geometry.photoRect.top - right.geometry.photoRect.top ||
    left.geometry.photoCenterX - right.geometry.photoCenterX
  ));

  for (const entry of sortedEntries) {
    const bestLabelCandidate = selectBestGroupGeometryLabelCandidate(
      entry.geometry,
      occupied,
      options?.mapRect,
      gap,
    );
    const downwardResolved = resolveGroupGeometryDownward(
      [{ id: entry.id, geometry: bestLabelCandidate }],
      { gap, step: options?.step ?? 6, maxOffset: options?.maxOffset ?? 108 },
    ).get(entry.id) ?? bestLabelCandidate;
    resolved.set(entry.id, downwardResolved);
    occupied.push(downwardResolved);
  }

  return resolved;
}

export function resolveGroupGeometryLabelAware<T extends string = string>(
  entries: GroupGeometryEntry<T>[],
  options?: {
    gap?: number;
    step?: number;
    maxOffset?: number;
    mapRect?: LogicalRect;
  },
) {
  const gap = options?.gap ?? 14;
  const step = options?.step ?? 6;
  const maxOffset = options?.maxOffset ?? 108;
  const resolved = new Map<T, GroupGeometry>();
  const occupied: GroupGeometry[] = [];
  const sortedEntries = [...entries].sort((left, right) => (
    left.geometry.photoRect.top - right.geometry.photoRect.top ||
    left.geometry.photoCenterX - right.geometry.photoCenterX
  ));

  for (const entry of sortedEntries) {
    const labelSeed = selectBestGroupGeometryLabelCandidate(
      entry.geometry,
      occupied,
      options?.mapRect,
      gap,
    );
    const variants = [labelSeed, ...buildGroupGeometryLabelCandidates(labelSeed)];
    let chosen = labelSeed;
    let accepted = false;

    for (const baseCandidate of variants) {
      for (let offset = 0; offset <= maxOffset; offset += step) {
        const candidate = offset === 0 ? baseCandidate : shiftGroupGeometryDown(baseCandidate, offset);
        if (occupied.some((item) => (
          rectsOverlap(candidate.photoRect, item.photoRect, gap - 4) ||
          rectsOverlap(candidate.labelRect, item.photoRect, gap + 4) ||
          rectsOverlap(candidate.photoRect, item.labelRect, gap + 4) ||
          rectsOverlap(candidate.labelRect, item.labelRect, gap + 2)
        ))) {
          continue;
        }
        chosen = candidate;
        accepted = true;
        break;
      }
      if (accepted) break;
    }

    resolved.set(entry.id, chosen);
    occupied.push(chosen);
  }

  return resolved;
}
