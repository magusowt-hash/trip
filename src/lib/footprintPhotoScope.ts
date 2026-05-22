const FOOTPRINT_PHOTO_SCOPE_PREFIX = 'fpgi_';
const MAP_FOOTPRINT_PHOTO_SCOPE_PREFIX = 'mfpi_';

export function buildFootprintPhotoScopeKey(footprintItemId: number | string): string {
  return `${FOOTPRINT_PHOTO_SCOPE_PREFIX}${footprintItemId}`;
}

export function buildMapFootprintPhotoScopeKey(mapFootprintId: number | string): string {
  return `${MAP_FOOTPRINT_PHOTO_SCOPE_PREFIX}${mapFootprintId}`;
}

export function parseFootprintPhotoScopeKey(scopeKey: string | null | undefined): number | null {
  if (!scopeKey) return null;
  const match = /^fpgi_(\d+)$/.exec(scopeKey);
  if (!match) return null;
  const itemId = Number(match[1]);
  return Number.isFinite(itemId) ? itemId : null;
}

export function parseMapFootprintPhotoScopeKey(scopeKey: string | null | undefined): number | null {
  if (!scopeKey) return null;
  const match = /^mfpi_(\d+)$/.exec(scopeKey);
  if (!match) return null;
  const itemId = Number(match[1]);
  return Number.isFinite(itemId) ? itemId : null;
}
