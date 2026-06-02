import type { PhotoItem } from './OuterFrameCanvas';
import type { GroupGeometry } from './localMapGroupGeometry';

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
  collisionGeometry: GroupGeometry;
  collisionRect: LogicalRect;
  reservedLabelOffset: number;
  logicalX: number;
  logicalY: number;
  offsets: LogicalOffset[];
};
