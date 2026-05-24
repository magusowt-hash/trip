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
};

type SizeReader = (photo: PhotoItem) => { width: number; height: number };

const RECT_PADDING = 40;
const OUTER_EDGE_GAP = 10;
const LABEL_TOP_GAP = 28;
const LABEL_BOTTOM_GAP = 20;
const LINE_ANCHOR_GAP = 16;

function getRegionByPoint(x: number, y: number): 'N' | 'W' | 'S' | 'E' {
  if (Math.abs(x) > Math.abs(y)) {
    return x < 0 ? 'W' : 'E';
  }
  return y < 0 ? 'N' : 'S';
}

export function buildGroupGeometry(groupPhotos: PhotoItem[], getPhotoLogicalSize: SizeReader): GroupGeometry | null {
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
  const labelAnchorX = centerX;
  const labelAnchorY = labelSide === 'top'
    ? rect.top - LABEL_TOP_GAP
    : rect.bottom + LABEL_BOTTOM_GAP;
  const lineAnchorX = centerX;
  const lineAnchorY = labelSide === 'top'
    ? labelAnchorY - LINE_ANCHOR_GAP
    : labelAnchorY + LINE_ANCHOR_GAP;

  return {
    rect,
    centerX,
    centerY,
    labelSide,
    labelAnchorX,
    labelAnchorY,
    lineAnchorX,
    lineAnchorY,
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
