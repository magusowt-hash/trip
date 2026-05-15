// OuterFrame coordinate system utilities.
// Model: screenX = logicalX * scale + viewportW/2 + tx
//        screenY = logicalY * scale + viewportH/2 + ty
// Logical origin (0,0) maps to viewport center when tx=ty=0 and scale=1.

export interface OuterFrameTransform {
  scale: number;
  tx: number;
  ty: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// --- Logical ↔ Screen ---

export function logicalToScreen(
  p: Point,
  viewportW: number,
  viewportH: number,
  t: OuterFrameTransform,
): Point {
  return {
    x: p.x * t.scale + viewportW / 2 + t.tx,
    y: p.y * t.scale + viewportH / 2 + t.ty,
  };
}

export function screenToLogical(
  sx: number,
  sy: number,
  viewportW: number,
  viewportH: number,
  t: OuterFrameTransform,
): Point {
  return {
    x: (sx - viewportW / 2 - t.tx) / t.scale,
    y: (sy - viewportH / 2 - t.ty) / t.scale,
  };
}

// --- Clamp scale ---

export const CLAMP_SCALE = { min: 0.2, max: 5 };
export const SCALE_DETENT = 0.5;

export function clampScale(s: number): number {
  return Math.max(CLAMP_SCALE.min, Math.min(CLAMP_SCALE.max, s));
}

// --- Viewport intersection ---

export function isInViewport(p: Point, vp: Viewport, margin: number = 200): boolean {
  return (
    p.x >= vp.left - margin &&
    p.x <= vp.right + margin &&
    p.y >= vp.top - margin &&
    p.y <= vp.bottom + margin
  );
}

export function logicalViewport(
  screenW: number,
  screenH: number,
  t: OuterFrameTransform,
): Viewport {
  const topLeft = screenToLogical(0, 0, screenW, screenH, t);
  const bottomRight = screenToLogical(screenW, screenH, screenW, screenH, t);
  return {
    left: topLeft.x,
    top: topLeft.y,
    right: bottomRight.x,
    bottom: bottomRight.y,
  };
}

// --- Zoom at point ---
// Given a screen point (center), compute new tx/ty so the point stays fixed.

export function zoomAt(
  screenX: number,
  screenY: number,
  viewportW: number,
  viewportH: number,
  newScale: number,
  t: OuterFrameTransform,
): { tx: number; ty: number } {
  const ratio = newScale / t.scale;
  // Point is at screen (screenX, screenY). Under transform t, its logical coord is:
  // logical = (screenX - Vw/2 - tx) / scale
  // After zoom, we want the same screen position:
  // screenX = logical * newScale + Vw/2 + newTx
  // = ((screenX - Vw/2 - tx) / scale) * newScale + Vw/2 + newTx
  // newTx = screenX - Vw/2 - (screenX - Vw/2 - tx) * ratio
  return {
    tx: (screenX - viewportW / 2) - (screenX - viewportW / 2 - t.tx) * ratio,
    ty: (screenY - viewportH / 2) - (screenY - viewportH / 2 - t.ty) * ratio,
  };
}

// --- Layout constant ---

export const MAP_AREA_RATIO = 0.6;
