import type { PhotoItem } from './OuterFrameCanvas';
import type { GroupGeometry, GroupLabelSide } from './localMapGroupGeometry';

export type LogicalRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type LogicalOffset = {
  offsetX: number;
  offsetY: number;
};

export type LogicalSize = {
  width: number;
  height: number;
};

export type FootprintPlacement = {
  centerX: number;
  centerY: number;
};

export type PendingPlaceGroup = {
  placeKey: string;
  placePhotos: PhotoItem[];
  renderRect: LogicalRect;
  collisionGeometry: GroupGeometry;
  collisionRect: LogicalRect;
  collisionCandidates?: GroupGeometry[];
  preferredLabelSide?: GroupLabelSide;
  logicalX: number;
  logicalY: number;
  offsets: LogicalOffset[];
};
