/**
 * Environment access.
 *
 * Two separate entry points, deliberately. `publicEnv` is safe to import from
 * anywhere; `serverEnv` throws if it is ever evaluated in a browser bundle, so
 * a bad import is a build/runtime error rather than a leaked secret.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/**
 * Values that are compiled into the browser bundle. Everything here is public
 * by definition — the Supabase anon key is only safe because RLS is on.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only when the
 * property is accessed statically, so these must not be computed dynamically.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '',
  mapboxStyle: process.env.NEXT_PUBLIC_MAPBOX_STYLE ?? 'mapbox://styles/mapbox/light-v11',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  // The VAPID *public* key. Public by design: the browser needs it to
  // subscribe, and it only identifies the sender.
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
} as const;

export function assertPublicEnv(): void {
  required('NEXT_PUBLIC_SUPABASE_URL', publicEnv.supabaseUrl);
  required('NEXT_PUBLIC_SUPABASE_ANON_KEY', publicEnv.supabaseAnonKey);
}

/** Mapbox is optional: the map degrades to a list view without a token. */
export function hasMapboxToken(): boolean {
  return publicEnv.mapboxToken.startsWith('pk.');
}

/**
 * Server-only secrets. Reading this from client code is a programming error
 * and is caught immediately rather than silently returning undefined.
 */
export function serverEnv() {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() was called in the browser. Server secrets must never reach the client.');
  }
  return {
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    cronSecret: process.env.CRON_SECRET ?? '',
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    vapidSubject: process.env.VAPID_SUBJECT ?? '',
  };
}

export function requireServiceRoleKey(): string {
  return required('SUPABASE_SERVICE_ROLE_KEY', serverEnv().supabaseServiceRoleKey);
}

export function requireCronSecret(): string {
  return required('CRON_SECRET', serverEnv().cronSecret);
}

/** True when push is configured. The app works without it; alerts just stay in-app. */
export function hasPushConfigured(): boolean {
  return publicEnv.vapidPublicKey.length > 0;
}

export function requireVapid(): { publicKey: string; privateKey: string; subject: string } {
  const { vapidPrivateKey, vapidSubject } = serverEnv();
  return {
    publicKey: required('NEXT_PUBLIC_VAPID_PUBLIC_KEY', publicEnv.vapidPublicKey),
    privateKey: required('VAPID_PRIVATE_KEY', vapidPrivateKey),
    // web-push requires a contact URL or mailto: so a push service can reach
    // the operator about a misbehaving sender.
    subject: required('VAPID_SUBJECT', vapidSubject),
  };
}
