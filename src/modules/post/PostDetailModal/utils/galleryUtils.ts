/** 主图 / 缩略图加载失败时的占位（data URI，无外链依赖） */
export const FALLBACK_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
    <rect width="900" height="1200" fill="#ffffff"/>
  </svg>`
)}`;

export const GALLERY_MAX = 20;

export const WHEEL_TO_SCROLL_FACTOR = 1.8;

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** 清洗图库：去空、去首尾空格，最多 20 张；若无有效项则返回空数组 */
export function sanitizeGalleryImages(
  gallery: string[] | undefined,
  title: string,
  author: string
): string[] {
  if (!gallery || gallery.length === 0) {
    return [];
  }
  const cleaned = gallery.map((u) => (typeof u === 'string' ? u.trim() : '')).filter(isNonEmptyString);
  return cleaned.slice(0, GALLERY_MAX);
}

/** 索引合法化：空数组时返回 0（由调用方保证至少有兜底图） */
export function clampImageIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

/**
 * 主图 src 三级兜底：当前图库项 → 封面 → 内置 SVG
 * 保证返回值永不为空字符串
 */
export function resolveMainImageSrc(images: string[], activeIndex: number, cover: string): string {
  const idx = clampImageIndex(activeIndex, images.length);
  const fromGallery = images[idx];
  if (isNonEmptyString(fromGallery)) return fromGallery.trim();
  if (isNonEmptyString(cover)) return cover.trim();
  return FALLBACK_IMAGE;
}

