export type PassportVisaViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const PASSPORT_VISA_MIN_ZOOM_SCALE = 0.8;
export const PASSPORT_VISA_MAX_ZOOM_SCALE = 12;

type PassportVisaSvgLike = {
  getAttribute(name: string): string | null;
};

export function parsePassportVisaViewBox(
  viewBoxValueOrSvg: string | PassportVisaSvgLike | null | undefined,
  widthValue: string | null | undefined,
  heightValue: string | null | undefined,
) {
  const viewBoxValue = typeof viewBoxValueOrSvg === 'string'
    ? viewBoxValueOrSvg
    : viewBoxValueOrSvg?.getAttribute('viewBox');
  const resolvedWidthValue = typeof viewBoxValueOrSvg === 'string'
    ? widthValue
    : (viewBoxValueOrSvg?.getAttribute('width') ?? widthValue);
  const resolvedHeightValue = typeof viewBoxValueOrSvg === 'string'
    ? heightValue
    : (viewBoxValueOrSvg?.getAttribute('height') ?? heightValue);

  if (viewBoxValue) {
    const values = viewBoxValue
      .trim()
      .split(/[\s,]+/)
      .map((value) => Number(value));

    if (values.length === 4 && values.every((value) => Number.isFinite(value))) {
      return {
        x: values[0],
        y: values[1],
        width: values[2],
        height: values[3],
      } satisfies PassportVisaViewBox;
    }
  }

  const width = Number(resolvedWidthValue);
  const height = Number(resolvedHeightValue);

  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return {
      x: 0,
      y: 0,
      width,
      height,
    } satisfies PassportVisaViewBox;
  }

  return null;
}

export function zoomPassportVisaViewBoxAtPoint(
  viewBox: PassportVisaViewBox,
  pointerX: number,
  pointerY: number,
  viewportWidth: number,
  viewportHeight: number,
  zoomFactor: number,
) {
  const nextWidth = viewBox.width / zoomFactor;
  const nextHeight = viewBox.height / zoomFactor;
  const worldX = viewBox.x + (pointerX / viewportWidth) * viewBox.width;
  const worldY = viewBox.y + (pointerY / viewportHeight) * viewBox.height;

  return {
    x: worldX - (pointerX / viewportWidth) * nextWidth,
    y: worldY - (pointerY / viewportHeight) * nextHeight,
    width: nextWidth,
    height: nextHeight,
  } satisfies PassportVisaViewBox;
}

export function panPassportVisaViewBox(
  viewBox: PassportVisaViewBox,
  deltaX: number,
  deltaY: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  return {
    x: viewBox.x - deltaX * (viewBox.width / viewportWidth),
    y: viewBox.y - deltaY * (viewBox.height / viewportHeight),
    width: viewBox.width,
    height: viewBox.height,
  } satisfies PassportVisaViewBox;
}

export function clampPassportVisaZoomViewBoxAtPoint(
  baseViewBox: PassportVisaViewBox,
  nextViewBox: PassportVisaViewBox,
  pointerX: number,
  pointerY: number,
  viewportWidth: number,
  viewportHeight: number,
  minZoomScale: number,
  maxZoomScale: number,
) {
  const minWidth = baseViewBox.width / maxZoomScale;
  const maxWidth = baseViewBox.width / minZoomScale;
  const clampedWidth = Math.min(maxWidth, Math.max(minWidth, nextViewBox.width));

  if (clampedWidth === nextViewBox.width) {
    return nextViewBox;
  }

  const clampedHeight = baseViewBox.height * (clampedWidth / baseViewBox.width);
  const pointerRatioX = pointerX / viewportWidth;
  const pointerRatioY = pointerY / viewportHeight;
  const worldX = nextViewBox.x + (pointerRatioX * nextViewBox.width);
  const worldY = nextViewBox.y + (pointerRatioY * nextViewBox.height);

  return {
    x: worldX - pointerRatioX * clampedWidth,
    y: worldY - pointerRatioY * clampedHeight,
    width: clampedWidth,
    height: clampedHeight,
  } satisfies PassportVisaViewBox;
}
