import type { PhotoItem } from './OuterFrameCanvas.tsx';

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

type LabelLayoutEntry = {
  placeKey: string;
  geometry: GroupGeometry;
  title: string;
  photoCount: number;
  scale: number;
};

export const GROUP_LABEL_FONT_SCREEN_SIZE = 10;
export const GROUP_LABEL_MIN_FONT_SCREEN_SIZE = 9;
export const GROUP_LABEL_LINE_HEIGHT_SCREEN = 13;
export const GROUP_ENDPOINT_RADIUS_SCREEN = 4;

const PHOTO_RECT_PADDING = 52;
const PHOTO_BOTTOM_EXTRA = 28;
const PHOTO_TO_LINE_SCREEN_GAP_UNIFORM = 3;
const LINE_TO_LABEL_SCREEN_GAP_UNIFORM = 1;
const LABEL_MIN_SCREEN_WIDTH = 56;
const LABEL_MAX_SCREEN_WIDTH = 132;
const LABEL_WIDTH_RATIO = 0.9;
const LABEL_MAX_LINES = 1;
const HARD_OVERLAP_WEIGHT = 1000;
const SOFT_GAP_WEIGHT = 20;
const BOTTOM_SECTOR_HALF_ANGLE = Math.PI / 4;

type LabelPlacementGapPolicy = {
  labelPhotoGap: number;
  labelGap: number;
  mapGap: number;
};

function getAdaptiveLabelScaleFactor(scale: number) {
  const safeScale = Math.max(scale, 0.1);
  if (safeScale >= 0.4) return 1;
  if (safeScale <= 0.1) return 0.42;
  return 0.42 + ((safeScale - 0.1) / 0.3) * 0.58;
}

export function getAdaptiveLabelScreenMetrics(scale: number) {
  const factor = getAdaptiveLabelScaleFactor(scale);
  return {
    fontSize: GROUP_LABEL_FONT_SCREEN_SIZE * factor,
    minFontSize: Math.max(4, GROUP_LABEL_MIN_FONT_SCREEN_SIZE * factor),
    lineHeight: Math.max(6, GROUP_LABEL_LINE_HEIGHT_SCREEN * factor),
    minWidth: Math.max(24, LABEL_MIN_SCREEN_WIDTH * factor),
    maxWidth: Math.max(52, LABEL_MAX_SCREEN_WIDTH * factor),
  };
}

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

export function resolvePreferredLabelSideForMap(centerX: number, centerY: number, mapRect?: LogicalRect): GroupLabelSide {
  if (!mapRect) return resolvePreferredLabelSide(centerX, centerY);
  if (centerY <= mapRect.bottom) return 'bottom';
  if (centerX >= mapRect.left && centerX <= mapRect.right) return 'top';

  const verticalDistance = centerY - mapRect.bottom;
  const leftCornerDistance = mapRect.left - centerX;
  const rightCornerDistance = centerX - mapRect.right;
  const withinLeftBottomPartition = centerX < mapRect.left && verticalDistance >= leftCornerDistance;
  const withinRightBottomPartition = centerX > mapRect.right && verticalDistance >= rightCornerDistance;
  return withinLeftBottomPartition || withinRightBottomPartition ? 'top' : 'bottom';
}

export function translateLogicalRect(rect: LogicalRect, offsetX: number, offsetY: number): LogicalRect {
  return {
    left: rect.left + offsetX,
    right: rect.right + offsetX,
    top: rect.top + offsetY,
    bottom: rect.bottom + offsetY,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function estimateCharacterScreenWidth(char: string) {
  if (/\s/.test(char)) return GROUP_LABEL_FONT_SCREEN_SIZE * 0.36;
  if (/[\u3400-\u9fff\uf900-\ufaff]/.test(char)) return GROUP_LABEL_FONT_SCREEN_SIZE * 1.08;
  if (/[A-Z0-9]/.test(char)) return GROUP_LABEL_FONT_SCREEN_SIZE * 0.72;
  if (/[a-z]/.test(char)) return GROUP_LABEL_FONT_SCREEN_SIZE * 0.62;
  return GROUP_LABEL_FONT_SCREEN_SIZE * 0.68;
}

function estimateCharacterWidth(char: string, fontSize: number) {
  const scaleFactor = fontSize / GROUP_LABEL_FONT_SCREEN_SIZE;
  return estimateCharacterScreenWidth(char) * scaleFactor;
}

function splitLabelText(title: string) {
  const compact = title.trim().replace(/\s+/g, ' ');
  if (!compact) return [''];
  return Array.from(compact);
}

export function measureGroupLabelLayout(
  title: string,
  photoRectWidth: number,
  scale: number,
) {
  const safeScale = Math.max(scale, 0.1);
  const photoWidthScreen = Math.max(1, photoRectWidth * safeScale);
  const metrics = getAdaptiveLabelScreenMetrics(safeScale);
  const tokens = splitLabelText(title);

  if (LABEL_MAX_LINES === 1) {
    const line = tokens.join('');
    const fullWidth = line.split('').reduce((sum, char) => sum + estimateCharacterWidth(char, metrics.fontSize), 0);
    const widthLogical = toLogicalScreenSize(
      Math.max(metrics.minWidth, Math.min(metrics.maxWidth, fullWidth || metrics.minWidth)),
      safeScale,
    );
    return {
      lines: [line],
      width: widthLogical,
      height: toLogicalScreenSize(metrics.lineHeight, safeScale),
      maxWidth: widthLogical,
    };
  }

  const labelMaxWidthScreen = clamp(
    photoWidthScreen * LABEL_WIDTH_RATIO,
    metrics.minWidth,
    metrics.maxWidth,
  );
  const lines: string[] = [];
  let currentLine = '';
  let currentWidth = 0;
  let maxLineWidth = 0;

  for (const token of tokens) {
    const tokenWidth = estimateCharacterWidth(token, metrics.fontSize);
    if (currentLine && currentWidth + tokenWidth > labelMaxWidthScreen + 1e-6) {
      lines.push(currentLine);
      maxLineWidth = Math.max(maxLineWidth, currentWidth);
      currentLine = token;
      currentWidth = tokenWidth;
      if (lines.length === LABEL_MAX_LINES - 1) continue;
    } else {
      currentLine += token;
      currentWidth += tokenWidth;
    }
  }

  if (lines.length < LABEL_MAX_LINES && currentLine) {
    lines.push(currentLine);
    maxLineWidth = Math.max(maxLineWidth, currentWidth);
  }

  if (lines.length > LABEL_MAX_LINES) {
    lines.length = LABEL_MAX_LINES;
  }

  const widthLogical = toLogicalScreenSize(Math.max(metrics.minWidth, Math.min(labelMaxWidthScreen, maxLineWidth || metrics.minWidth)), safeScale);
  const heightLogical = toLogicalScreenSize(lines.length * metrics.lineHeight, safeScale);

  return {
    lines: lines.length > 0 ? lines : [''],
    width: widthLogical,
    height: heightLogical,
    maxWidth: toLogicalScreenSize(labelMaxWidthScreen, safeScale),
  };
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
  mapRect?: LogicalRect,
): GroupGeometry {
  const safeScale = Math.max(scale, 0.1);
  const photoCenter = rectCenter(photoRect);
  const labelSide = fixedLabelSide ?? resolvePreferredLabelSideForMap(photoCenter.x, photoCenter.y, mapRect);
  const lineAnchorRadius = toLogicalScreenSize(GROUP_ENDPOINT_RADIUS_SCREEN, safeScale);
  const photoWidth = Math.max(1, photoRect.right - photoRect.left);
  const photoHeight = Math.max(1, photoRect.bottom - photoRect.top);
  const labelLayout = measureGroupLabelLayout(title, photoWidth, safeScale);
  const labelHalfWidth = labelLayout.width / 2;
  const photoToLineGap = toLogicalScreenSize(
    PHOTO_TO_LINE_SCREEN_GAP_UNIFORM,
    safeScale,
  );
  const lineToLabelGap = toLogicalScreenSize(
    LINE_TO_LABEL_SCREEN_GAP_UNIFORM,
    safeScale,
  );
  const labelHalfHeight = labelLayout.height / 2;
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
  mapRect?: LogicalRect,
) {
  const safeScale = Math.max(scale, 0.1);
  const photoCenter = rectCenter(photoRect);
  const lineAnchorRadius = toLogicalScreenSize(GROUP_ENDPOINT_RADIUS_SCREEN, safeScale);
  const photoWidth = Math.max(1, photoRect.right - photoRect.left);
  const photoHeight = Math.max(1, photoRect.bottom - photoRect.top);
  const labelLayout = measureGroupLabelLayout(title, photoWidth, safeScale);
  const labelHalfWidth = labelLayout.width / 2;
  const photoToLineGap = toLogicalScreenSize(
    PHOTO_TO_LINE_SCREEN_GAP_UNIFORM,
    safeScale,
  );
  const lineToLabelGap = toLogicalScreenSize(
    LINE_TO_LABEL_SCREEN_GAP_UNIFORM,
    safeScale,
  );
  const labelHalfHeight = labelLayout.height / 2;

  const buildForSide = (labelSide: GroupLabelSide, extraOffset = 0): GroupGeometry => {
    const lineAnchorX = photoCenter.x;
    const lineAnchorY =
      labelSide === 'top'
        ? photoRect.top - photoToLineGap - fixedLabelOffset - extraOffset
        : photoRect.bottom + photoToLineGap + fixedLabelOffset + extraOffset;
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

  const preferredSide = fixedLabelSide ?? resolvePreferredLabelSideForMap(photoCenter.x, photoCenter.y, mapRect);
  const alternateSide: GroupLabelSide = preferredSide === 'top' ? 'bottom' : 'top';
  const offsetSteps = [0, 18, 36];
  const candidates: GroupGeometry[] = [];

  for (const side of [preferredSide, alternateSide]) {
    for (const offset of offsetSteps) {
      candidates.push(buildForSide(side, offset));
    }
  }

  return candidates;
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

  const buildForSide = (labelSide: GroupLabelSide, extraOffset = 0): GroupGeometry => {
    const lineAnchorX = photoCenter.x;
    const lineAnchorY =
      labelSide === 'top'
        ? photoRect.top - photoToLineGap - fixedLabelOffset - extraOffset
        : photoRect.bottom + photoToLineGap + fixedLabelOffset + extraOffset;
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
  const alternateSide: GroupLabelSide = preferredSide === 'top' ? 'bottom' : 'top';
  const offsetSteps = [0, 18, 36];
  const candidates: GroupGeometry[] = [];

  for (const side of [preferredSide, alternateSide]) {
    for (const offset of offsetSteps) {
      candidates.push(buildForSide(side, offset));
    }
  }

  return candidates;
}

export function buildSingleSideGroupGeometryFromGeometry(
  geometry: GroupGeometry,
  fixedLabelSide?: GroupLabelSide,
) {
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

  const labelSide = fixedLabelSide ?? geometry.labelSide ?? resolvePreferredLabelSide(photoCenter.x, photoCenter.y);
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
}

export function buildGroupGeometry(
  groupPhotos: Array<Pick<PhotoItem, 'frameX' | 'frameY' | 'pixelWidth' | 'pixelHeight' | 'placeTitle'>>,
  getPhotoLogicalSize: SizeReader,
  scale = 1,
  fixedLabelSide?: GroupLabelSide,
  fixedLabelOffset = 0,
  mapRect?: LogicalRect,
): GroupGeometry | null {
  const photoRect = buildPhotoRect(groupPhotos, getPhotoLogicalSize);
  if (!photoRect) return null;
  const title = groupPhotos[0]?.placeTitle || '';
  return buildGroupGeometryFromPhotoRect(photoRect, title, groupPhotos.length, scale, fixedLabelSide, fixedLabelOffset, mapRect);
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
  mapRect?: LogicalRect,
) {
  const layoutByPlaceKey = new Map(layouts.map((layout) => [layout.placeKey, layout]));
  const layout = layoutByPlaceKey.get(placeKey);
  const photoRect = buildPhotoRect(groupPhotos, getPhotoLogicalSize);
  const centerX = photoRect ? (photoRect.left + photoRect.right) * 0.5 : 0;
  const centerY = photoRect ? (photoRect.top + photoRect.bottom) * 0.5 : 0;
  const computedLabelSide = resolvePreferredLabelSideForMap(centerX, centerY, mapRect);
  return buildGroupGeometry(
    groupPhotos,
    getPhotoLogicalSize,
    scale,
    computedLabelSide,
    layout?.labelOffset ?? 0,
    mapRect,
  );
}

export function resolveGroupLabelLayouts(
  entries: LabelLayoutEntry[],
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
  const mapGap = options?.mapGap ?? gap;
  const gapPolicy = buildLabelPlacementGapPolicy(gap, mapGap);
  const step = options?.step ?? 8;
  const maxOffset = options?.maxOffset ?? 120;
  const labelGapBoost = options?.labelGapBoost ?? 0;
  const sortedEntries = [...entries].sort((left, right) => (
    rectDistanceToCenter(right.geometry.photoRect) - rectDistanceToCenter(left.geometry.photoRect) ||
    left.geometry.photoRect.top - right.geometry.photoRect.top ||
    left.geometry.photoCenterX - right.geometry.photoCenterX
  ));
  const resolved = new Map<string, GroupGeometry>();
  const candidateEntries: Array<{ id: string; geometry: GroupGeometry; candidates: GroupGeometry[] }> = [];

  for (const entry of sortedEntries) {
    const candidates: GroupGeometry[] = [];
    const candidateKeys = new Set<string>();
    const baseCandidates = buildGroupGeometryCandidatesFromPhotoRect(
      entry.geometry.photoRect,
      entry.title,
      entry.photoCount,
      entry.scale,
      entry.geometry.labelSide,
      0,
      options?.mapRect,
    );

    for (const baseCandidate of baseCandidates) {
      const baseOffset =
        baseCandidate.labelSide === 'top'
          ? Math.max(0, baseCandidate.photoRect.top - baseCandidate.lineAnchorY)
          : Math.max(0, baseCandidate.lineAnchorY - baseCandidate.photoRect.bottom);
      const extraOffsets = new Set<number>([0]);
      for (let extraOffset = 0; extraOffset <= maxOffset; extraOffset += step) {
        extraOffsets.add(extraOffset);
      }
      const requiredMapClearance = computeMapClearanceOffset(baseCandidate, options?.mapRect, mapGap);
      if (requiredMapClearance > 0) {
        extraOffsets.add(requiredMapClearance);
        extraOffsets.add(Math.ceil(requiredMapClearance / Math.max(step, 1)) * Math.max(step, 1));
        extraOffsets.add(requiredMapClearance + step);
        extraOffsets.add(requiredMapClearance + step * 2);
      }
      for (const extraOffset of Array.from(extraOffsets).sort((left, right) => left - right)) {
        const finalOffset = Math.max(0, baseOffset + extraOffset);
        const candidateKey = `${baseCandidate.labelSide}:${Math.round(finalOffset * 1000)}`;
        if (candidateKeys.has(candidateKey)) continue;
        candidateKeys.add(candidateKey);
        candidates.push(
          buildGroupGeometryFromPhotoRect(
            entry.geometry.photoRect,
            entry.title,
            entry.photoCount,
            entry.scale,
            baseCandidate.labelSide,
            finalOffset,
            options?.mapRect,
          ),
        );
      }
    }
    candidateEntries.push({ id: entry.placeKey, geometry: entry.geometry, candidates });
  }

  for (const entry of candidateEntries) {
    const occupied = candidateEntries
      .filter((candidate) => candidate.id !== entry.id)
      .map((candidate) => resolved.get(candidate.id))
      .filter((candidate): candidate is GroupGeometry => candidate != null);
    const chosen = pickBestResolvedCandidate(
      entry.candidates,
      occupied,
      entry.geometry,
      gap,
      gapPolicy,
      labelGapBoost,
      options?.mapRect,
      mapGap,
    );
    resolved.set(entry.id, chosen);
  }

  optimizeResolvedAssignments(
    candidateEntries,
    resolved,
    gap,
    gapPolicy,
    labelGapBoost,
    options?.mapRect,
    mapGap,
  );

  const searched = searchResolvedAssignments(
    candidateEntries,
    gap,
    gapPolicy,
    labelGapBoost,
    options?.mapRect,
    mapGap,
  );
  if (searched) {
    searched.forEach((geometry, placeKey) => {
      resolved.set(placeKey, geometry);
    });
  }

  return new Map(
    Array.from(resolved.entries()).map(([placeKey, geometry]) => [
      placeKey,
      createGroupLayoutSnapshot(placeKey, geometry),
    ]),
  );
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

function buildLabelPlacementGapPolicy(
  safeGap: number,
  mapGap: number,
): LabelPlacementGapPolicy {
  return {
    labelPhotoGap: Math.max(18, safeGap + 16),
    labelGap: Math.max(16, safeGap + 16),
    mapGap,
  };
}

function scorePlacementGapViolation(
  left: LogicalRect,
  right: LogicalRect,
  safeGap: number,
  weight: number,
) {
  const overlapArea = rectOverlapArea(left, right);
  if (overlapArea > 0) {
    return overlapArea * HARD_OVERLAP_WEIGHT * weight * 4;
  }

  const gapDistance = rectGapDistance(left, right);
  if (gapDistance >= safeGap) return 0;
  const deficit = safeGap - gapDistance;
  return deficit * deficit * SOFT_GAP_WEIGHT * weight * 10;
}

function computeMapClearanceOffset(
  candidate: GroupGeometry,
  mapRect?: LogicalRect,
  mapGap = 0,
) {
  if (!mapRect) return 0;
  if (candidate.labelSide === 'top') {
    return Math.max(0, candidate.labelRect.bottom - (mapRect.top - mapGap));
  }
  return Math.max(0, mapRect.bottom + mapGap - candidate.labelRect.top);
}

function isLabelPlacementHardInvalid(
  candidate: GroupGeometry,
  occupied: GroupGeometry[],
  gapPolicy: LabelPlacementGapPolicy,
  mapRect?: LogicalRect,
) {
  if (occupied.some((neighbor) => (
    rectsOverlap(candidate.labelRect, neighbor.photoRect, gapPolicy.labelPhotoGap) ||
    rectsOverlap(candidate.labelRect, neighbor.labelRect, gapPolicy.labelGap)
  ))) {
    return true;
  }

  if (mapRect && rectOverlapsMap(candidate.labelRect, mapRect, gapPolicy.mapGap)) {
    return true;
  }

  return false;
}

function scoreLabelPlacementPenalties(
  candidate: GroupGeometry,
  occupied: GroupGeometry[],
  gapPolicy: LabelPlacementGapPolicy,
  mapRect?: LogicalRect,
) {
  let penalty = 0;
  const overlapsMap = mapRect
    ? rectOverlapsMap(candidate.labelRect, mapRect, gapPolicy.mapGap)
    : false;

  for (const neighbor of occupied) {
    penalty += scorePlacementGapViolation(
      candidate.labelRect,
      neighbor.photoRect,
      gapPolicy.labelPhotoGap,
      1.6,
    );
    penalty += scorePlacementGapViolation(
      candidate.labelRect,
      neighbor.labelRect,
      gapPolicy.labelGap,
      1.4,
    );
  }

  if (mapRect) {
    penalty += scorePlacementGapViolation(
      candidate.labelRect,
      mapRect,
      gapPolicy.mapGap,
      4.2,
    );
  }

  return penalty + (overlapsMap ? 10_000_000 : 0);
}

function scoreResolvedCandidate(
  candidate: GroupGeometry,
  occupied: GroupGeometry[],
  baseGeometry: GroupGeometry,
  safeGap: number,
  gapPolicy: LabelPlacementGapPolicy,
  labelGapBoost: number,
  mapRect?: LogicalRect,
  mapGap?: number,
) {
  let score = scoreGroupGeometryPlacement(candidate, occupied, safeGap, { labelGapBoost });
  const hardInvalid = isLabelPlacementHardInvalid(candidate, occupied, gapPolicy, mapRect);
  const hardPenalty = scoreLabelPlacementPenalties(candidate, occupied, gapPolicy, mapRect);

  const nearbySameSidePenalty = occupied.reduce((sum, neighbor) => {
    if (neighbor.labelSide !== candidate.labelSide) return sum;
    const centerDistance = Math.hypot(
      candidate.photoCenterX - neighbor.photoCenterX,
      candidate.photoCenterY - neighbor.photoCenterY,
    );
    if (centerDistance >= safeGap * 14) return sum;
    return sum + Math.max(0, safeGap * 14 - centerDistance) * 12;
  }, 0);
  score += nearbySameSidePenalty;

  if (mapRect && mapGap != null && rectOverlapsMap(candidate.overallRect, mapRect, mapGap)) {
    score += 500000;
  }

  const candidateOffset =
    candidate.labelSide === 'top'
      ? Math.max(0, candidate.photoRect.top - candidate.lineAnchorY)
      : Math.max(0, candidate.lineAnchorY - candidate.photoRect.bottom);
  score += candidateOffset * 0.6;

  if (candidate.labelSide !== baseGeometry.labelSide) {
    score += 24;
  }

  return {
    hardInvalid,
    preferredScore: score,
    fallbackScore: score + hardPenalty,
  };
}

function pickBestResolvedCandidate(
  candidates: GroupGeometry[],
  occupied: GroupGeometry[],
  baseGeometry: GroupGeometry,
  safeGap: number,
  gapPolicy: LabelPlacementGapPolicy,
  labelGapBoost: number,
  mapRect?: LogicalRect,
  mapGap?: number,
) {
  let chosen = candidates[0] ?? baseGeometry;
  let bestPreferredScore = Number.POSITIVE_INFINITY;
  let bestFallbackScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const evaluation = scoreResolvedCandidate(
      candidate,
      occupied,
      baseGeometry,
      safeGap,
      gapPolicy,
      labelGapBoost,
      mapRect,
      mapGap,
    );

    if (evaluation.fallbackScore < bestFallbackScore) {
      bestFallbackScore = evaluation.fallbackScore;
      chosen = candidate;
    }

    if (evaluation.hardInvalid) continue;

    if (evaluation.preferredScore < bestPreferredScore) {
      bestPreferredScore = evaluation.preferredScore;
      chosen = candidate;
    }
  }

  return chosen;
}

function optimizeResolvedAssignments<T extends string>(
  orderedEntries: Array<{ id: T; geometry: GroupGeometry; candidates: GroupGeometry[] }>,
  resolved: Map<T, GroupGeometry>,
  safeGap: number,
  gapPolicy: LabelPlacementGapPolicy,
  labelGapBoost: number,
  mapRect?: LogicalRect,
  mapGap?: number,
) {
  for (let iteration = 0; iteration < 4; iteration++) {
    let changed = false;

    for (const entry of orderedEntries) {
      const occupied = orderedEntries
        .filter((candidate) => candidate.id !== entry.id)
        .map((candidate) => resolved.get(candidate.id))
        .filter((candidate): candidate is GroupGeometry => candidate != null);

      const next = pickBestResolvedCandidate(
        entry.candidates,
        occupied,
        entry.geometry,
        safeGap,
        gapPolicy,
        labelGapBoost,
        mapRect,
        mapGap,
      );
      const current = resolved.get(entry.id);

      if (!current || current !== next) {
        resolved.set(entry.id, next);
        changed = true;
      }
    }

    if (!changed) break;
  }
}

function computeResolvedTotalScore<T extends string>(
  orderedEntries: Array<{ id: T; geometry: GroupGeometry; candidates: GroupGeometry[] }>,
  resolved: Map<T, GroupGeometry>,
  safeGap: number,
  gapPolicy: LabelPlacementGapPolicy,
  labelGapBoost: number,
  mapRect?: LogicalRect,
  mapGap?: number,
) {
  let total = 0;

  for (const entry of orderedEntries) {
    const candidate = resolved.get(entry.id);
    if (!candidate) continue;
    const occupied = orderedEntries
      .filter((neighbor) => neighbor.id !== entry.id)
      .map((neighbor) => resolved.get(neighbor.id))
      .filter((neighbor): neighbor is GroupGeometry => neighbor != null);
    total += scoreResolvedCandidate(
      candidate,
      occupied,
      entry.geometry,
      safeGap,
      gapPolicy,
      labelGapBoost,
      mapRect,
      mapGap,
    ).fallbackScore;
  }

  return total;
}

function searchResolvedAssignments<T extends string>(
  orderedEntries: Array<{ id: T; geometry: GroupGeometry; candidates: GroupGeometry[] }>,
  safeGap: number,
  gapPolicy: LabelPlacementGapPolicy,
  labelGapBoost: number,
  mapRect?: LogicalRect,
  mapGap?: number,
) {
  if (orderedEntries.length === 0 || orderedEntries.length > 8) return null;

  const rankedEntries = orderedEntries.map((entry) => ({
    ...entry,
    candidates: entry.candidates
      .map((candidate) => ({
        candidate,
        score: scoreResolvedCandidate(
          candidate,
          [],
          entry.geometry,
          safeGap,
          gapPolicy,
          labelGapBoost,
          mapRect,
          mapGap,
        ).fallbackScore,
      }))
      .sort((left, right) => left.score - right.score)
      .slice(0, 6)
      .map((item) => item.candidate),
  }));

  let bestScore = Number.POSITIVE_INFINITY;
  let best: Map<T, GroupGeometry> | null = null;
  const partial = new Map<T, GroupGeometry>();

  function dfs(index: number) {
    if (index >= rankedEntries.length) {
      const totalScore = computeResolvedTotalScore(
        rankedEntries,
        partial,
        safeGap,
        gapPolicy,
        labelGapBoost,
        mapRect,
        mapGap,
      );
      if (totalScore < bestScore) {
        bestScore = totalScore;
        best = new Map(partial);
      }
      return;
    }

    const entry = rankedEntries[index]!;
    const occupied = rankedEntries
      .slice(0, index)
      .map((neighbor) => partial.get(neighbor.id))
      .filter((neighbor): neighbor is GroupGeometry => neighbor != null);

    for (const candidate of entry.candidates) {
      const evaluation = scoreResolvedCandidate(
        candidate,
        occupied,
        entry.geometry,
        safeGap,
        gapPolicy,
        labelGapBoost,
        mapRect,
        mapGap,
      );
      if (evaluation.fallbackScore >= bestScore) continue;
      partial.set(entry.id, candidate);
      dfs(index + 1);
      partial.delete(entry.id);
    }
  }

  dfs(0);
  return best;
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
  const gapPolicy = buildLabelPlacementGapPolicy(gap, mapGap);
  const labelGapBoost = options?.labelGapBoost ?? 0;
  const sortedEntries = [...entries].sort((left, right) => (
    rectDistanceToCenter(right.geometry.photoRect) - rectDistanceToCenter(left.geometry.photoRect) ||
    left.geometry.photoRect.top - right.geometry.photoRect.top ||
    left.geometry.photoCenterX - right.geometry.photoCenterX
  ));
  const candidateEntries = sortedEntries.map((entry) => ({
    id: entry.id,
    geometry: entry.geometry,
    candidates: entry.candidates?.length ? entry.candidates : [buildSingleSideGroupGeometryFromGeometry(entry.geometry)],
  }));
  const resolved = new Map<T, GroupGeometry>();

  for (const entry of candidateEntries) {
    const occupied = candidateEntries
      .filter((candidate) => candidate.id !== entry.id)
      .map((candidate) => resolved.get(candidate.id))
      .filter((candidate): candidate is GroupGeometry => candidate != null);
    const chosen = pickBestResolvedCandidate(
      entry.candidates,
      occupied,
      entry.geometry,
      gap,
      gapPolicy,
      labelGapBoost,
      options?.mapRect,
      mapGap,
    );
    resolved.set(entry.id, chosen);
  }

  optimizeResolvedAssignments(
    candidateEntries,
    resolved,
    gap,
    gapPolicy,
    labelGapBoost,
    options?.mapRect,
    mapGap,
  );

  const searched = searchResolvedAssignments(
    candidateEntries,
    gap,
    gapPolicy,
    labelGapBoost,
    options?.mapRect,
    mapGap,
  );
  if (searched) {
    searched.forEach((geometry, id) => {
      resolved.set(id, geometry);
    });
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
