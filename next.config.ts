import type { NextConfig } from 'next';

/**
 * Security headers.
 *
 * The Content-Security-Policy is NOT here. It carries a per-request nonce, and
 * a value in next.config.ts is a constant baked at build time — a constant
 * nonce is the same as no nonce. It is built in lib/csp.ts and attached by the
 * proxy, which is the only place that can see a single request.
 *
 * Everything below is request-independent, so it belongs here where it also
 * covers responses the proxy never sees.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Next would otherwise write AGENTS.md/CLAUDE.md into the repo root on every
  // dev run. This project documents itself under docs/.
  agentRules: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
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
