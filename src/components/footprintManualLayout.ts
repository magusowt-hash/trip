import type { PhotoItem } from './OuterFrameCanvas';
import type { GroupLayoutSnapshot } from './localMapGroupGeometry';

export type FootprintLayoutInteractionMode = 'preset' | 'manual';
export type ManualMapRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ManualPlaceRect = {
  placeKey: string;
  placeTitle: string;
  photoLeft: number;
  photoTop: number;
  photoRight: number;
  photoBottom: number;
  overallLeft: number;
  overallTop: number;
  overallRight: number;
  overallBottom: number;
  labelLeft: number;
  labelTop: number;
  labelRight: number;
  labelBottom: number;
  labelSide: 'top' | 'bottom';
  labelAnchorX: number;
  labelAnchorY: number;
  lineAnchorX: number;
  lineAnchorY: number;
};

export function applyPhotoDragToPhotos(
  photos: PhotoItem[],
  photoId: number | string,
  frameX: number,
  frameY: number,
) {
  return photos.map((photo) => (
    photo.id === photoId
      ? { ...photo, frameX, frameY }
      : photo
  ));
}

export function applyGroupDragToPhotos(
  photos: PhotoItem[],
  placeKey: string,
  dx: number,
  dy: number,
) {
  if (dx === 0 && dy === 0) return photos.slice();
  return photos.map((photo) => {
    if (photo.placeKey !== placeKey || photo.frameX == null || photo.frameY == null) {
      return photo;
    }
    return {
      ...photo,
      frameX: photo.frameX + dx,
      frameY: photo.frameY + dy,
    };
  });
}

export function applyGroupPhotoPositions(
  photos: PhotoItem[],
  placeKey: string,
  nextGroupPhotos: Array<Pick<PhotoItem, 'id' | 'frameX' | 'frameY'>>,
) {
  const nextById = new Map(nextGroupPhotos.map((photo) => [photo.id, photo]));
  return photos.map((photo) => {
    if (photo.placeKey !== placeKey) return photo;
    const next = nextById.get(photo.id);
    if (!next) return photo;
    return {
      ...photo,
      frameX: next.frameX,
      frameY: next.frameY,
    };
  });
}

export function mergeGroupLayoutSnapshot(
  layouts: GroupLayoutSnapshot[],
  nextLayout: GroupLayoutSnapshot,
) {
  const next = new Map(layouts.map((layout) => [layout.placeKey, layout]));
  next.set(nextLayout.placeKey, nextLayout);
  return Array.from(next.values());
}

export function translatePlaceRect(
  rect: ManualPlaceRect,
  dx: number,
  dy: number,
): ManualPlaceRect {
  if (dx === 0 && dy === 0) return { ...rect };
  return {
    ...rect,
    photoLeft: rect.photoLeft + dx,
    photoTop: rect.photoTop + dy,
    photoRight: rect.photoRight + dx,
    photoBottom: rect.photoBottom + dy,
    overallLeft: rect.overallLeft + dx,
    overallTop: rect.overallTop + dy,
    overallRight: rect.overallRight + dx,
    overallBottom: rect.overallBottom + dy,
    labelLeft: rect.labelLeft + dx,
    labelTop: rect.labelTop + dy,
    labelRight: rect.labelRight + dx,
    labelBottom: rect.labelBottom + dy,
    labelAnchorX: rect.labelAnchorX + dx,
    labelAnchorY: rect.labelAnchorY + dy,
    lineAnchorX: rect.lineAnchorX + dx,
    lineAnchorY: rect.lineAnchorY + dy,
  };
}

export function clampRectOutsideMap(
  rect: ManualPlaceRect,
  mapRect: ManualMapRect,
): ManualPlaceRect {
  const overlapsMap =
    rect.overallRight > mapRect.left &&
    rect.overallLeft < mapRect.right &&
    rect.overallBottom > mapRect.top &&
    rect.overallTop < mapRect.bottom;

  if (!overlapsMap) return rect;

  const dl = rect.overallRight - mapRect.left;
  const dr = mapRect.right - rect.overallLeft;
  const dt = rect.overallBottom - mapRect.top;
  const db = mapRect.bottom - rect.overallTop;
  const minD = Math.min(dl, dr, dt, db);

  if (minD === dl) return translatePlaceRect(rect, -dl, 0);
  if (minD === dr) return translatePlaceRect(rect, dr, 0);
  if (minD === dt) return translatePlaceRect(rect, 0, -dt);
  return translatePlaceRect(rect, 0, db);
}
