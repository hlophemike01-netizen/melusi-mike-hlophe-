import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

/**
 * Crawl rules.
 *
 * Only two pages are public: the landing page and the privacy explainer.
 * Everything else is either behind auth or is a capability URL, and an
 * indexed share link would defeat the point of the token protecting it.
 *
 * This is belt and braces — those pages also send `noindex` in their own
 * metadata, which is what actually binds. robots.txt only asks politely.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/legal/privacy'],
        disallow: [
          '/home',
          '/map',
          '/groups',
          '/activity',
          '/profile',
          '/admin',
          '/shared/', // one-time location share links
          '/auth/',
          '/api/',
          '/sign-in',
          '/sign-up',
          '/reset-password',
          '/update-password',
          '/offline',
        ],
      },
    ],
    sitemap: `${publicEnv.siteUrl.replace(/\/$/, '')}/sitemap.xml`,
  };
}
