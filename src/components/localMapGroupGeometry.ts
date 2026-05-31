import type { PhotoItem } from './OuterFrameCanvas';

export type GroupLabelSide = 'top' | 'bottom';

export type LogicalRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type GroupGeometry = {
  photoRect: LogicalRect;
  labelRect: LogicalRect;
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

const PHOTO_RECT_PADDING = 40;
const PHOTO_BOTTOM_EXTRA = 20;
const LABEL_TOP_GAP = 28;
const LABEL_BOTTOM_GAP = 20;
const LINE_ANCHOR_GAP_TOP = 16;
const LINE_ANCHOR_GAP_BOTTOM = 24;
const MIN_GROUP_TO_LABEL_SCREEN_GAP = 20;
const MIN_LABEL_TO_LINE_SCREEN_GAP = 18;
const LABEL_HEIGHT = 20;
const LINE_ANCHOR_RADIUS = 8;

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

function rectCenter(rect: LogicalRect) {
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  };
}

function estimateLabelHalfWidth(title: string, scale: number) {
  const safeScale = Math.max(scale, 0.1);
  const perChar = 6.5 / safeScale;
  return Math.max(
    toLogicalScreenSize(36, safeScale),
    Math.min(toLogicalScreenSize(140, safeScale), title.length * perChar),
  );
}

function getRegionByPoint(x: number, y: number): 'N' | 'W' | 'S' | 'E' {
  if (Math.abs(x) > Math.abs(y)) {
    return x < 0 ? 'W' : 'E';
  }
  return y < 0 ? 'N' : 'S';
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
  scale = 1,
): GroupGeometry {
  const safeScale = Math.max(scale, 0.1);
  const photoCenter = rectCenter(photoRect);
  const labelSide = getRegionByPoint(photoCenter.x, photoCenter.y) === 'S' ? 'top' : 'bottom';
  const groupToLabelGap = labelSide === 'top'
    ? Math.max(toLogicalScreenSize(LABEL_TOP_GAP, safeScale), toLogicalScreenSize(MIN_GROUP_TO_LABEL_SCREEN_GAP, safeScale))
    : Math.max(toLogicalScreenSize(LABEL_BOTTOM_GAP, safeScale), toLogicalScreenSize(MIN_GROUP_TO_LABEL_SCREEN_GAP, safeScale));
  const labelHalfWidth = estimateLabelHalfWidth(title, safeScale);
  const labelAnchorX = photoCenter.x;
  const labelAnchorY = labelSide === 'top'
    ? photoRect.top - groupToLabelGap
    : photoRect.bottom + groupToLabelGap;
  const labelRect: LogicalRect = {
    left: labelAnchorX - labelHalfWidth,
    right: labelAnchorX + labelHalfWidth,
    top: labelAnchorY - toLogicalScreenSize(LABEL_HEIGHT, safeScale) / 2,
    bottom: labelAnchorY + toLogicalScreenSize(LABEL_HEIGHT, safeScale) / 2,
  };

  const lineGap = labelSide === 'top'
    ? Math.max(toLogicalScreenSize(LINE_ANCHOR_GAP_BOTTOM, safeScale), toLogicalScreenSize(MIN_LABEL_TO_LINE_SCREEN_GAP, safeScale))
    : Math.max(toLogicalScreenSize(LINE_ANCHOR_GAP_TOP, safeScale), toLogicalScreenSize(MIN_LABEL_TO_LINE_SCREEN_GAP, safeScale));
  const lineAnchorX = labelAnchorX;
  const lineAnchorY = labelSide === 'top'
    ? labelRect.bottom + lineGap
    : labelRect.top - lineGap;
  const lineRect: LogicalRect = {
    left: lineAnchorX - toLogicalScreenSize(LINE_ANCHOR_RADIUS, safeScale),
    right: lineAnchorX + toLogicalScreenSize(LINE_ANCHOR_RADIUS, safeScale),
    top: lineAnchorY - toLogicalScreenSize(LINE_ANCHOR_RADIUS, safeScale),
    bottom: lineAnchorY + toLogicalScreenSize(LINE_ANCHOR_RADIUS, safeScale),
  };

  const overallRect = unionRect(unionRect(photoRect, labelRect), lineRect);

  return {
    photoRect,
    labelRect,
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

export function buildGroupGeometry(
  groupPhotos: Array<Pick<PhotoItem, 'frameX' | 'frameY' | 'pixelWidth' | 'pixelHeight' | 'placeTitle'>>,
  getPhotoLogicalSize: SizeReader,
  scale = 1,
): GroupGeometry | null {
  const photoRect = buildPhotoRect(groupPhotos, getPhotoLogicalSize);
  if (!photoRect) return null;
  const title = groupPhotos[0]?.placeTitle || '';
  return buildGroupGeometryFromPhotoRect(photoRect, title, scale);
}
