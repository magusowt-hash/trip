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

export const GROUP_LABEL_FONT_SCREEN_SIZE = 10;
export const GROUP_LABEL_MIN_FONT_SCREEN_SIZE = 9;
export const GROUP_LABEL_HEIGHT_SCREEN = 16;
export const GROUP_ENDPOINT_RADIUS_SCREEN = 5;

const PHOTO_RECT_PADDING = 40;
const PHOTO_BOTTOM_EXTRA = 20;
const PHOTO_TO_LINE_SCREEN_GAP = 18;
const LINE_TO_LABEL_SCREEN_GAP = 10;
const LABEL_MAX_SCREEN_WIDTH = 112;

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
  const perChar = 5.8 / safeScale;
  return Math.max(
    toLogicalScreenSize(36, safeScale),
    Math.min(toLogicalScreenSize(LABEL_MAX_SCREEN_WIDTH, safeScale), title.length * perChar),
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
  scale = 1,
): GroupGeometry {
  const safeScale = Math.max(scale, 0.1);
  const photoCenter = rectCenter(photoRect);
  const labelSide: GroupLabelSide = 'bottom';
  const labelHalfWidth = estimateLabelHalfWidth(title, safeScale);
  const lineAnchorRadius = toLogicalScreenSize(GROUP_ENDPOINT_RADIUS_SCREEN, safeScale);
  const photoToLineGap = toLogicalScreenSize(PHOTO_TO_LINE_SCREEN_GAP, safeScale);
  const lineToLabelGap = toLogicalScreenSize(LINE_TO_LABEL_SCREEN_GAP, safeScale);
  const labelHalfHeight = toLogicalScreenSize(GROUP_LABEL_HEIGHT_SCREEN, safeScale) / 2;
  const labelAnchorX = photoCenter.x;
  const lineAnchorX = labelAnchorX;
  const lineAnchorY = photoRect.bottom + photoToLineGap;
  const labelAnchorY = lineAnchorY + lineAnchorRadius + lineToLabelGap + labelHalfHeight;
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
