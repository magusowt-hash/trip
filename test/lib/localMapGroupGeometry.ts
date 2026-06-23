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
  return Math.max(36 / safeScale, Math.min(140 / safeScale, title.length * perChar));
}

function getRegionByPoint(x: number, y: number): 'N' | 'W' | 'S' | 'E' {
  if (Math.abs(x) > Math.abs(y)) {
    return x < 0 ? 'W' : 'E';
  }
  return y < 0 ? 'N' : 'S';
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
    ? Math.max(LABEL_TOP_GAP, MIN_GROUP_TO_LABEL_SCREEN_GAP / safeScale)
    : Math.max(LABEL_BOTTOM_GAP, MIN_GROUP_TO_LABEL_SCREEN_GAP / safeScale);
  const labelHalfWidth = estimateLabelHalfWidth(title, safeScale);
  const labelAnchorX = photoCenter.x;
  const labelAnchorY = labelSide === 'top'
    ? photoRect.top - groupToLabelGap
    : photoRect.bottom + groupToLabelGap;
  const labelRect: LogicalRect = {
    left: labelAnchorX - labelHalfWidth,
    right: labelAnchorX + labelHalfWidth,
    top: labelAnchorY - LABEL_HEIGHT / 2,
    bottom: labelAnchorY + LABEL_HEIGHT / 2,
  };

  const lineGap = labelSide === 'top'
    ? Math.max(LINE_ANCHOR_GAP_BOTTOM, MIN_LABEL_TO_LINE_SCREEN_GAP / safeScale)
    : Math.max(LINE_ANCHOR_GAP_TOP, MIN_LABEL_TO_LINE_SCREEN_GAP / safeScale);
  const lineAnchorX = labelAnchorX;
  const lineAnchorY = labelSide === 'top'
    ? labelRect.bottom + lineGap
    : labelRect.top - lineGap;
  const lineRect: LogicalRect = {
    left: lineAnchorX - LINE_ANCHOR_RADIUS,
    right: lineAnchorX + LINE_ANCHOR_RADIUS,
    top: lineAnchorY - LINE_ANCHOR_RADIUS,
    bottom: lineAnchorY + LINE_ANCHOR_RADIUS,
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
