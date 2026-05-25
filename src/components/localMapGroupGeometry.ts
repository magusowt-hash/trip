import type { PhotoItem } from './OuterFrameCanvas';

export type GroupLabelSide = 'top' | 'bottom';

export type GroupLogicalRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type GroupGeometry = {
  rect: GroupLogicalRect;
  centerX: number;
  centerY: number;
  labelSide: GroupLabelSide;
  labelAnchorX: number;
  labelAnchorY: number;
  lineAnchorX: number;
  lineAnchorY: number;
  overallTop: number;
  overallBottom: number;
};

type SizeReader = (photo: PhotoItem) => { width: number; height: number };

const RECT_PADDING = 40;
const OUTER_EDGE_GAP = 10;
const LABEL_TOP_GAP = 28;
const LABEL_BOTTOM_GAP = 20;
const LINE_ANCHOR_GAP_TOP = 16;
const LINE_ANCHOR_GAP_BOTTOM = 24;
const MIN_GROUP_TO_LABEL_SCREEN_GAP = 20;
const MIN_LABEL_TO_LINE_SCREEN_GAP = 18;

function getRegionByPoint(x: number, y: number): 'N' | 'W' | 'S' | 'E' {
  if (Math.abs(x) > Math.abs(y)) {
    return x < 0 ? 'W' : 'E';
  }
  return y < 0 ? 'N' : 'S';
}

export function buildGroupGeometry(
  groupPhotos: PhotoItem[],
  getPhotoLogicalSize: SizeReader,
  scale = 1,
): GroupGeometry | null {
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

  const rect = {
    left: left - RECT_PADDING,
    right: right + RECT_PADDING,
    top: top - RECT_PADDING,
    bottom: bottom + RECT_PADDING + 20,
  };
  const centerX = (rect.left + rect.right) / 2;
  const centerY = (rect.top + rect.bottom) / 2;
  const labelSide = getRegionByPoint(centerX, centerY) === 'S' ? 'top' : 'bottom';
  const safeScale = Math.max(scale, 0.1);
  const groupToLabelGap = labelSide === 'top'
    ? Math.max(LABEL_TOP_GAP, MIN_GROUP_TO_LABEL_SCREEN_GAP / safeScale)
    : Math.max(LABEL_BOTTOM_GAP, MIN_GROUP_TO_LABEL_SCREEN_GAP / safeScale);
  const labelAnchorX = centerX;
  const labelAnchorY = labelSide === 'top'
    ? rect.top - groupToLabelGap
    : rect.bottom + groupToLabelGap;
  const lineGap = labelSide === 'top'
    ? Math.max(LINE_ANCHOR_GAP_BOTTOM, MIN_LABEL_TO_LINE_SCREEN_GAP / safeScale)
    : Math.max(LINE_ANCHOR_GAP_TOP, MIN_LABEL_TO_LINE_SCREEN_GAP / safeScale);
  const lineAnchorX = centerX;
  const lineAnchorY = labelSide === 'top'
    ? labelAnchorY + lineGap
    : labelAnchorY - lineGap;
  const overallTop = Math.min(rect.top, labelAnchorY, lineAnchorY);
  const overallBottom = Math.max(rect.bottom, labelAnchorY, lineAnchorY);

  return {
    rect,
    centerX,
    centerY,
    labelSide,
    labelAnchorX,
    labelAnchorY,
    lineAnchorX,
    lineAnchorY,
    overallTop,
    overallBottom,
  };
}

export function getGroupOuterEdgeAnchor(geometry: GroupGeometry) {
  return {
    x: geometry.centerX,
    y: geometry.labelSide === 'top'
      ? geometry.rect.top - OUTER_EDGE_GAP
      : geometry.rect.bottom + OUTER_EDGE_GAP,
  };
}
