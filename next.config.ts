import type { NextConfig } from 'next';

/**
 * Security headers.
 *
 * The CSP is deliberately strict. Mapbox GL needs `worker-src blob:` and
 * `child-src blob:` for its worker, and `connect-src` entries for tile/style
 * endpoints. Supabase needs its project origin on `connect-src` and `wss:` for
 * Realtime. Everything else is locked down.
 */
const supabaseOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
})();

const connectSrc = [
  "'self'",
  'https://api.mapbox.com',
  'https://events.mapbox.com',
  supabaseOrigin,
  supabaseOrigin ? supabaseOrigin.replace(/^https:/, 'wss:') : '',
]
  .filter(Boolean)
  .join(' ');

const csp = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; 'unsafe-inline' is required for
  // those in the absence of a nonce-based setup. No remote script origins.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://api.mapbox.com " + supabaseOrigin,
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            // Geolocation is allowed for our own origin only; it is still gated
            // behind an explicit in-app opt-in before the browser prompt fires.
            value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
