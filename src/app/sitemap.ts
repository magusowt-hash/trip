import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const now = new Date();
  return [
    { url: base, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/search`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/itinerary`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
  ];
}
