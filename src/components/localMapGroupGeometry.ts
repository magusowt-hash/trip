import type { PhotoItem } from './OuterFrameCanvas';

export type GroupLabelSide = 'top' | 'bottom';
export type GroupLayoutSnapshot = {
  placeKey: string;
  labelSide: GroupLabelSide;
  labelOffset: number;
};

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

type WholeGeometryEntry<T extends string = string> = {
  id: T;
  geometry: GroupGeometry;
  candidates?: GroupGeometry[];
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
const BOTTOM_SECTOR_HALF_ANGLE = Math.PI / 3;

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

function normalizeAngle(angle: number) {
  const fullTurn = Math.PI * 2;
  const normalized = angle % fullTurn;
  return normalized >= 0 ? normalized : normalized + fullTurn;
}

function angleDistance(left: number, right: number) {
  const fullTurn = Math.PI * 2;
  let delta = normalizeAngle(left) - normalizeAngle(right);
  if (delta > Math.PI) delta -= fullTurn;
  if (delta < -Math.PI) delta += fullTurn;
  return Math.abs(delta);
}

export function resolvePreferredLabelSide(centerX: number, centerY: number): GroupLabelSide {
  const angle = Math.atan2(centerY, centerX);
  const downwardAngle = Math.PI / 2;
  return angleDistance(angle, downwardAngle) <= BOTTOM_SECTOR_HALF_ANGLE ? 'top' : 'bottom';
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
  fixedLabelSide?: GroupLabelSide,
  fixedLabelOffset = 0,
): GroupGeometry {
  const safeScale = Math.max(scale, 0.1);
  const photoCenter = rectCenter(photoRect);
  const labelSide = fixedLabelSide ?? resolvePreferredLabelSide(photoCenter.x, photoCenter.y);
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
  const labelAnchorX = photoCenter.x;
  const lineAnchorX = labelAnchorX;
  const lineAnchorY =
    labelSide === 'top'
      ? photoRect.top - photoToLineGap - fixedLabelOffset
      : photoRect.bottom + photoToLineGap + fixedLabelOffset;
  const labelAnchorY =
    labelSide === 'top'
      ? lineAnchorY - lineAnchorRadius - lineToLabelGap - labelHalfHeight
      : lineAnchorY + lineAnchorRadius + lineToLabelGap + labelHalfHeight;
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
  fixedLabelSide?: GroupLabelSide,
  fixedLabelOffset = 0,
) {
  const safeScale = Math.max(scale, 0.1);
  const photoCenter = rectCenter(photoRect);
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

  const buildForSide = (labelSide: GroupLabelSide): GroupGeometry => {
    const lineAnchorX = photoCenter.x;
    const lineAnchorY =
      labelSide === 'top'
        ? photoRect.top - photoToLineGap - fixedLabelOffset
        : photoRect.bottom + photoToLineGap + fixedLabelOffset;
    const labelAnchorX = photoCenter.x;
    const labelAnchorY =
      labelSide === 'top'
        ? lineAnchorY - lineAnchorRadius - lineToLabelGap - labelHalfHeight
        : lineAnchorY + lineAnchorRadius + lineToLabelGap + labelHalfHeight;

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

    return {
      photoRect,
      labelRect,
      lineRect,
      groupRect,
      overallRect: groupRect,
      photoCenterX: photoCenter.x,
      photoCenterY: photoCenter.y,
      labelSide,
      labelAnchorX,
      labelAnchorY,
      lineAnchorX,
      lineAnchorY,
    };
  };

  const preferredSide = fixedLabelSide ?? resolvePreferredLabelSide(photoCenter.x, photoCenter.y);
  return [buildForSide(preferredSide)];
}

export function buildGroupGeometryCandidatesFromGeometry(geometry: GroupGeometry, fixedLabelSide?: GroupLabelSide) {
  const photoRect = geometry.photoRect;
  const photoCenter = rectCenter(photoRect);
  const labelHalfWidth = Math.max(1, geometry.labelRect.right - geometry.labelRect.left) / 2;
  const labelHalfHeight = Math.max(1, geometry.labelRect.bottom - geometry.labelRect.top) / 2;
  const lineAnchorRadius = Math.max(1, geometry.lineRect.right - geometry.lineRect.left) / 2;
  const fixedLabelOffset =
    geometry.labelSide === 'top'
      ? Math.max(0, photoRect.top - geometry.lineAnchorY)
      : Math.max(0, geometry.lineAnchorY - photoRect.bottom);
  const photoToLineGap =
    geometry.labelSide === 'top'
      ? Math.max(0, photoRect.top - geometry.lineAnchorY - fixedLabelOffset)
      : Math.max(0, geometry.lineAnchorY - photoRect.bottom - fixedLabelOffset);
  const lineToLabelGap =
    geometry.labelSide === 'top'
      ? Math.max(0, geometry.lineRect.top - geometry.labelRect.bottom)
      : Math.max(0, geometry.labelRect.top - geometry.lineRect.bottom);

  const buildForSide = (labelSide: GroupLabelSide): GroupGeometry => {
    const lineAnchorX = photoCenter.x;
    const lineAnchorY =
      labelSide === 'top'
        ? photoRect.top - photoToLineGap - fixedLabelOffset
        : photoRect.bottom + photoToLineGap + fixedLabelOffset;
    const labelAnchorX = photoCenter.x;
    const labelAnchorY =
      labelSide === 'top'
        ? lineAnchorY - lineAnchorRadius - lineToLabelGap - labelHalfHeight
        : lineAnchorY + lineAnchorRadius + lineToLabelGap + labelHalfHeight;

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

    return {
      ...geometry,
      labelRect,
      lineRect,
      groupRect,
      overallRect: groupRect,
      photoCenterX: photoCenter.x,
      photoCenterY: photoCenter.y,
      labelSide,
      labelAnchorX,
      labelAnchorY,
      lineAnchorX,
      lineAnchorY,
    };
  };

  const preferredSide = fixedLabelSide ?? geometry.labelSide ?? resolvePreferredLabelSide(photoCenter.x, photoCenter.y);
  return [buildForSide(preferredSide)];
}

export function buildGroupGeometry(
  groupPhotos: Array<Pick<PhotoItem, 'frameX' | 'frameY' | 'pixelWidth' | 'pixelHeight' | 'placeTitle'>>,
  getPhotoLogicalSize: SizeReader,
  scale = 1,
  fixedLabelSide?: GroupLabelSide,
  fixedLabelOffset = 0,
): GroupGeometry | null {
  const photoRect = buildPhotoRect(groupPhotos, getPhotoLogicalSize);
  if (!photoRect) return null;
  const title = groupPhotos[0]?.placeTitle || '';
  return buildGroupGeometryFromPhotoRect(photoRect, title, groupPhotos.length, scale, fixedLabelSide, fixedLabelOffset);
}

export function createGroupLayoutSnapshot(placeKey: string, geometry: GroupGeometry): GroupLayoutSnapshot {
  const labelOffset =
    geometry.labelSide === 'top'
      ? Math.max(0, geometry.photoRect.top - geometry.lineAnchorY)
      : Math.max(0, geometry.lineAnchorY - geometry.photoRect.bottom);

  return {
    placeKey,
    labelSide: geometry.labelSide,
    labelOffset,
  };
}

export function buildGroupGeometryFromLayout(
  placeKey: string,
  groupPhotos: Array<Pick<PhotoItem, 'frameX' | 'frameY' | 'pixelWidth' | 'pixelHeight' | 'placeTitle'>>,
  getPhotoLogicalSize: SizeReader,
  scale = 1,
  layouts: GroupLayoutSnapshot[] = [],
) {
  const layoutByPlaceKey = new Map(layouts.map((layout) => [layout.placeKey, layout]));
  const layout = layoutByPlaceKey.get(placeKey);
  return buildGroupGeometry(
    groupPhotos,
    getPhotoLogicalSize,
    scale,
    layout?.labelSide,
    layout?.labelOffset ?? 0,
  );
}

export function resolveGroupLabelLayouts(
  entries: Array<{
    placeKey: string;
    geometry: GroupGeometry;
    title: string;
    photoCount: number;
    scale: number;
  }>,
  options?: {
    gap?: number;
    mapRect?: LogicalRect;
    mapGap?: number;
    labelGapBoost?: number;
    step?: number;
    maxOffset?: number;
  },
) {
  const gap = options?.gap ?? 10;
  const step = options?.step ?? 8;
  const maxOffset = options?.maxOffset ?? 120;
  const labelGapBoost = options?.labelGapBoost ?? 0;
  const resolved = new Map<string, GroupLayoutSnapshot>();
  const occupied: GroupGeometry[] = [];
  const sortedEntries = [...entries].sort((left, right) => (
    rectDistanceToCenter(right.geometry.photoRect) - rectDistanceToCenter(left.geometry.photoRect) ||
    left.geometry.photoRect.top - right.geometry.photoRect.top ||
    left.geometry.photoCenterX - right.geometry.photoCenterX
  ));

  for (const entry of sortedEntries) {
    let chosen = entry.geometry;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let offset = 0; offset <= maxOffset; offset += step) {
      const candidate = buildGroupGeometryFromPhotoRect(
        entry.geometry.photoRect,
        entry.title,
        entry.photoCount,
        entry.scale,
        entry.geometry.labelSide,
        offset,
      );

      let score = scoreGroupGeometryPlacement(candidate, occupied, gap, { labelGapBoost });

      if (options?.mapRect) {
        if (rectOverlapsMap(candidate.overallRect, options.mapRect, options.mapGap ?? gap)) {
          score += 500000;
        }
      }

      score += offset * 0.6;

      if (score < bestScore) {
        bestScore = score;
        chosen = candidate;
      }

      if (score === 0) break;
    }

    occupied.push(chosen);
    resolved.set(entry.placeKey, createGroupLayoutSnapshot(entry.placeKey, chosen));
  }

  return resolved;
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

function rectDistanceToCenter(rect: LogicalRect) {
  const center = rectCenter(rect);
  return Math.hypot(center.x, center.y);
}

function rectOverlapsMap(rect: LogicalRect, mapRect: LogicalRect, gap: number) {
  return rectsOverlap(rect, mapRect, gap);
}

export function resolveGroupGeometryAsWhole<T extends string = string>(
  entries: WholeGeometryEntry<T>[],
  options?: {
    gap?: number;
    mapRect?: LogicalRect;
    mapGap?: number;
    labelGapBoost?: number;
  },
) {
  const gap = options?.gap ?? 10;
  const mapGap = options?.mapGap ?? gap;
  const labelGapBoost = options?.labelGapBoost ?? 0;
  const resolved = new Map<T, GroupGeometry>();
  const occupied: GroupGeometry[] = [];
  const sortedEntries = [...entries].sort((left, right) => (
    rectDistanceToCenter(right.geometry.photoRect) - rectDistanceToCenter(left.geometry.photoRect) ||
    left.geometry.photoRect.top - right.geometry.photoRect.top ||
    left.geometry.photoCenterX - right.geometry.photoCenterX
  ));

  for (const entry of sortedEntries) {
    const candidates = entry.candidates?.length ? entry.candidates : buildGroupGeometryCandidatesFromGeometry(entry.geometry);
    let chosen = candidates[0];
    let bestScore = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      let score = scoreGroupGeometryPlacement(candidate, occupied, gap, { labelGapBoost });

      if (options?.mapRect) {
        if (rectOverlapsMap(candidate.overallRect, options.mapRect, mapGap)) {
          score += 500000;
        }
      }

      score += rectDistanceToCenter(candidate.overallRect) * 0.08;

      if (candidate.labelSide !== entry.geometry.labelSide) {
        score += 24;
      }

      if (score < bestScore) {
        bestScore = score;
        chosen = candidate;
      }
    }

    resolved.set(entry.id, chosen);
    occupied.push(chosen);
  }

  return resolved;
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

export function resolveGroupGeometryTextAware<T extends string = string>(
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
  const occupied: GroupGeometry[] = [];
  const sortedEntries = [...entries].sort((left, right) => (
    left.geometry.photoRect.top - right.geometry.photoRect.top ||
    left.geometry.photoCenterX - right.geometry.photoCenterX
  ));

  for (const entry of sortedEntries) {
    const photoRect = entry.geometry.photoRect;
    const lineRect = entry.geometry.lineRect;
    const labelWidth = Math.max(1, entry.geometry.labelRect.right - entry.geometry.labelRect.left);
    const labelHeight = Math.max(1, entry.geometry.labelRect.bottom - entry.geometry.labelRect.top);
    const photoCenterX = entry.geometry.photoCenterX;
    const photoCenterY = entry.geometry.photoCenterY;
    const lineRadius = Math.max(1, (lineRect.right - lineRect.left) / 2);
    const verticalGap =
      entry.geometry.labelRect.top - entry.geometry.lineRect.bottom > 0
        ? entry.geometry.labelRect.top - entry.geometry.lineRect.bottom
        : entry.geometry.lineRect.top - entry.geometry.labelRect.bottom;
    const horizontalGap =
      entry.geometry.labelRect.left - entry.geometry.lineRect.right > 0
        ? entry.geometry.labelRect.left - entry.geometry.lineRect.right
        : entry.geometry.lineRect.left - entry.geometry.labelRect.right;

    const candidates: GroupGeometry[] = [
      entry.geometry,
      {
        ...entry.geometry,
        labelRect: {
          left: photoCenterX - labelWidth / 2,
          right: photoCenterX + labelWidth / 2,
          top: photoRect.top - lineRadius - verticalGap - labelHeight,
          bottom: photoRect.top - lineRadius - verticalGap,
        },
        lineRect: {
          left: photoCenterX - lineRadius,
          right: photoCenterX + lineRadius,
          top: photoRect.top - lineRadius,
          bottom: photoRect.top + lineRadius,
        },
        groupRect: {
          left: Math.min(photoRect.left, photoCenterX - labelWidth / 2),
          right: Math.max(photoRect.right, photoCenterX + labelWidth / 2),
          top: photoRect.top - lineRadius - verticalGap - labelHeight,
          bottom: Math.max(photoRect.bottom, photoRect.top + lineRadius),
        },
        overallRect: {
          left: Math.min(photoRect.left, photoCenterX - labelWidth / 2),
          right: Math.max(photoRect.right, photoCenterX + labelWidth / 2),
          top: photoRect.top - lineRadius - verticalGap - labelHeight,
          bottom: Math.max(photoRect.bottom, photoRect.top + lineRadius),
        },
        labelAnchorX: photoCenterX,
        labelAnchorY: photoRect.top - lineRadius - verticalGap - labelHeight / 2,
        lineAnchorX: photoCenterX,
        lineAnchorY: photoRect.top,
      },
      {
        ...entry.geometry,
        labelRect: {
          left: photoRect.left - lineRadius - horizontalGap - labelWidth,
          right: photoRect.left - lineRadius - horizontalGap,
          top: photoCenterY - labelHeight / 2,
          bottom: photoCenterY + labelHeight / 2,
        },
        lineRect: {
          left: photoRect.left - lineRadius,
          right: photoRect.left + lineRadius,
          top: photoCenterY - lineRadius,
          bottom: photoCenterY + lineRadius,
        },
        groupRect: {
          left: photoRect.left - lineRadius - horizontalGap - labelWidth,
          right: Math.max(photoRect.right, photoRect.left + lineRadius),
          top: Math.min(photoRect.top, photoCenterY - labelHeight / 2),
          bottom: Math.max(photoRect.bottom, photoCenterY + labelHeight / 2),
        },
        overallRect: {
          left: photoRect.left - lineRadius - horizontalGap - labelWidth,
          right: Math.max(photoRect.right, photoRect.left + lineRadius),
          top: Math.min(photoRect.top, photoCenterY - labelHeight / 2),
          bottom: Math.max(photoRect.bottom, photoCenterY + labelHeight / 2),
        },
        labelAnchorX: photoRect.left - lineRadius - horizontalGap - labelWidth / 2,
        labelAnchorY: photoCenterY,
        lineAnchorX: photoRect.left,
        lineAnchorY: photoCenterY,
      },
      {
        ...entry.geometry,
        labelRect: {
          left: photoRect.right + lineRadius + horizontalGap,
          right: photoRect.right + lineRadius + horizontalGap + labelWidth,
          top: photoCenterY - labelHeight / 2,
          bottom: photoCenterY + labelHeight / 2,
        },
        lineRect: {
          left: photoRect.right - lineRadius,
          right: photoRect.right + lineRadius,
          top: photoCenterY - lineRadius,
          bottom: photoCenterY + lineRadius,
        },
        groupRect: {
          left: Math.min(photoRect.left, photoRect.right - lineRadius),
          right: photoRect.right + lineRadius + horizontalGap + labelWidth,
          top: Math.min(photoRect.top, photoCenterY - labelHeight / 2),
          bottom: Math.max(photoRect.bottom, photoCenterY + labelHeight / 2),
        },
        overallRect: {
          left: Math.min(photoRect.left, photoRect.right - lineRadius),
          right: photoRect.right + lineRadius + horizontalGap + labelWidth,
          top: Math.min(photoRect.top, photoCenterY - labelHeight / 2),
          bottom: Math.max(photoRect.bottom, photoCenterY + labelHeight / 2),
        },
        labelAnchorX: photoRect.right + lineRadius + horizontalGap + labelWidth / 2,
        labelAnchorY: photoCenterY,
        lineAnchorX: photoRect.right,
        lineAnchorY: photoCenterY,
      },
    ];

    let chosen = entry.geometry;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const baseCandidate of candidates) {
      for (let offset = 0; offset <= maxOffset; offset += step) {
        const candidate = offset === 0 ? baseCandidate : shiftGroupGeometryDown(baseCandidate, offset);
        const score = occupied.reduce((sum, item) => (
          sum + scoreGroupGeometryPlacement(candidate, [item], gap)
        ), 0);
        if (score < bestScore) {
          bestScore = score;
          chosen = candidate;
        }
        if (occupied.some((item) => (
          rectsOverlap(candidate.photoRect, item.photoRect, gap) ||
          rectsOverlap(candidate.labelRect, item.photoRect, gap + 8) ||
          rectsOverlap(candidate.photoRect, item.labelRect, gap + 8) ||
          rectsOverlap(candidate.labelRect, item.labelRect, gap + 6)
        ))) {
          continue;
        }
        chosen = candidate;
        bestScore = score;
        break;
      }
      if (bestScore === 0) break;
    }

    resolved.set(entry.id, chosen);
    occupied.push(chosen);
  }

  return resolved;
}
