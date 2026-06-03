import type { PhotoItem } from './OuterFrameCanvas';
import type { GroupLayoutSnapshot } from './localMapGroupGeometry';

export type FootprintLayoutInteractionMode = 'preset' | 'manual';

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
