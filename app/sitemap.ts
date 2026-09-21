import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

/**
 * The sitemap lists only what may be indexed. It is deliberately short: this
 * is an application, not a content site, and the two public pages are the
 * whole of its search surface.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicEnv.siteUrl.replace(/\/$/, '');
  const lastModified = new Date();

  return [
    { url: `${base}/`, lastModified, changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/legal/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.6 },
  ];
}
