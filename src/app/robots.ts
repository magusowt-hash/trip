import type { MetadataRoute } from 'next';

/** 公网运营时可改为按环境读取 NEXT_PUBLIC_SITE_URL */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${base.replace(/\/$/, '')}/sitemap.xml`,
  };
}
