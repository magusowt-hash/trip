import type { PassportVisaCountryRecord } from './passportVisaAdminTypes.ts';

export function getPassportVisaHoverCardTitle(
  country: Pick<PassportVisaCountryRecord, 'chineseName' | 'englishName'>,
) {
  return country.chineseName;
}

export function getPassportVisaHoverCardPosition({
  pointerX,
  pointerY,
  viewportWidth,
  viewportHeight,
  cardWidth,
  cardHeight,
  offsetX,
  offsetY,
  edgePadding,
}: {
  pointerX: number;
  pointerY: number;
  viewportWidth: number;
  viewportHeight: number;
  cardWidth: number;
  cardHeight: number;
  offsetX: number;
  offsetY: number;
  edgePadding: number;
}) {
  const maxLeft = Math.max(edgePadding, viewportWidth - cardWidth - edgePadding);
  const preferredLeft = pointerX + offsetX;
  const left = Math.min(maxLeft, Math.max(edgePadding, preferredLeft));

  const preferredTop = pointerY + offsetY;
  const maxTop = Math.max(edgePadding, viewportHeight - cardHeight - edgePadding);
  const top = preferredTop + cardHeight <= viewportHeight - edgePadding
    ? Math.max(edgePadding, preferredTop)
    : Math.max(edgePadding, pointerY - offsetY - cardHeight);

  return {
    left,
    top: Math.min(maxTop, top),
  };
}

export function getPassportVisaHoverCardMaxWidth({
  viewportWidth,
  edgePadding,
  preferredMaxWidth,
}: {
  viewportWidth: number;
  edgePadding: number;
  preferredMaxWidth: number;
}) {
  return Math.max(0, Math.min(preferredMaxWidth, viewportWidth - (edgePadding * 2)));
}
