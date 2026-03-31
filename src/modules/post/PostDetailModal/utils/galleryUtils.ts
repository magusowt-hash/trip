/** 主图 / 缩略图加载失败时的占位（data URI，无外链依赖） */
export const FALLBACK_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#e5e7eb"/>
        <stop offset="100%" stop-color="#d1d5db"/>
      </linearGradient>
    </defs>
    <rect width="900" height="1200" fill="url(#g)"/>
    <text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle" fill="#6b7280" font-size="48" font-family="Arial, sans-serif">TRIP</text>
    <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#6b7280" font-size="28" font-family="Arial, sans-serif">IMAGE</text>
  </svg>`
)}`;

export const GALLERY_MAX = 20;

export const WHEEL_TO_SCROLL_FACTOR = 1.8;

/** 无有效图库时的本地演示图（SVG data URI） */
export function createLocalGallery(seed: string): string[] {
  return Array.from({ length: GALLERY_MAX }, (_, idx) => {
    const label = `${seed}-${idx + 1}`.toUpperCase();
    return `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${idx % 2 === 0 ? '#bfdbfe' : '#ddd6fe'}"/>
            <stop offset="100%" stop-color="${idx % 2 === 0 ? '#fde68a' : '#c7d2fe'}"/>
          </linearGradient>
        </defs>
        <rect width="900" height="1200" fill="url(#bg)"/>
        <text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle" fill="#111827" font-size="56" font-family="Arial, sans-serif">${label}</text>
      </svg>`
    )}`;
  });
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** 清洗图库：去空、去首尾空格，最多 20 张；若无有效项则返回本地 SVG 占位序列 */
export function sanitizeGalleryImages(
  gallery: string[] | undefined,
  title: string,
  author: string
): string[] {
  const seed = `${title}-${author}`.replace(/\s+/g, '-');
  if (!gallery || gallery.length === 0) {
    return createLocalGallery(seed);
  }
  const cleaned = gallery.map((u) => (typeof u === 'string' ? u.trim() : '')).filter(isNonEmptyString);
  if (cleaned.length === 0) {
    return createLocalGallery(seed);
  }
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

