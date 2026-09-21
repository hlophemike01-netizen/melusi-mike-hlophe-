import { publicEnv } from '@/lib/env';

/**
 * Content Security Policy.
 *
 * An XSS on a location-sharing app is not a defacement — it reads somebody's
 * position and their trusted contacts. That is why script-src carries a
 * per-request nonce instead of 'unsafe-inline': with 'unsafe-inline', any
 * injected <script> runs, and every other protection in the product is
 * downstream of the attacker already being inside the page.
 *
 * 'strict-dynamic' lets the nonced Next.js bootstrap load its own chunks
 * without listing every one, and makes browsers ignore host allowlists — so
 * a stray CDN origin cannot quietly reopen the hole later.
 */
function supabaseOrigin(): string {
  try {
    return publicEnv.supabaseUrl ? new URL(publicEnv.supabaseUrl).origin : '';
  } catch {
    return '';
  }
}

export function buildCsp(nonce: string, isDev: boolean): string {
  const supabase = supabaseOrigin();

  const connect = [
    "'self'",
    'https://api.mapbox.com',
    'https://events.mapbox.com',
    supabase,
    supabase ? supabase.replace(/^https:/, 'wss:') : '',
  ]
    .filter(Boolean)
    .join(' ');

  return [
    "default-src 'self'",

    // 'unsafe-eval' is required by the dev-server's hot reload and by nothing
    // in a production build, so it is never sent to a real user.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,

    // Styles stay 'unsafe-inline'. Next and Mapbox both inject style tags, and
    // an injected stylesheet cannot read a location or call an API — the
    // exposure is not comparable to script.
    "style-src 'self' 'unsafe-inline'",

    `img-src 'self' data: blob: https://api.mapbox.com ${supabase}`.trim(),
    "font-src 'self' data:",
    `connect-src ${connect}`,

    // Mapbox GL runs its renderer in a blob worker.
    "worker-src 'self' blob:",
    "child-src 'self' blob:",

    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/** Cryptographically random, one per request. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
