/**
 * Environment access.
 *
 * Two separate entry points, deliberately. `publicEnv` is safe to import from
 * anywhere; `serverEnv` throws if it is ever evaluated in a browser bundle, so
 * a bad import is a build/runtime error rather than a leaked secret.
 */

/**
 * The first value that is actually set.
 *
 * `??` is wrong here: it falls through only on null/undefined, so a variable
 * created and left blank — which is exactly what a hosting dashboard produces
 * when someone adds a row and does not fill it — would win over a working
 * value further down the list.
 */
function firstSet(...values: (string | undefined)[]): string {
  for (const value of values) {
    if (value && value.trim() !== '') return value;
  }
  return '';
}

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
  /**
   * Supabase calls this the *publishable* key now; it used to be the *anon*
   * key. Both names are read so a project on either generation works, and so
   * an existing deployment does not break the moment it is rolled forward.
   *
   * Each `process.env.NEXT_PUBLIC_*` is written as a separate static property
   * access on purpose: Next.js only substitutes the value at build time when
   * it can see the property literally, so computing the name would leave this
   * empty in the browser bundle.
   */
  supabaseKey: firstSet(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '',
  mapboxStyle: process.env.NEXT_PUBLIC_MAPBOX_STYLE ?? 'mapbox://styles/mapbox/light-v11',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  // The VAPID *public* key. Public by design: the browser needs it to
  // subscribe, and it only identifies the sender.
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
} as const;

export function assertPublicEnv(): void {
  required('NEXT_PUBLIC_SUPABASE_URL', publicEnv.supabaseUrl);
  required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', publicEnv.supabaseKey);
}

/** The project reference inside a legacy `eyJ…` key, or null for any other key. */
function refInsideLegacyKey(key: string): string | null {
  if (!key.startsWith('eyJ')) return null;
  try {
    const payload: unknown = JSON.parse(atob(key.split('.')[1] ?? ''));
    if (payload && typeof payload === 'object' && 'ref' in payload) {
      const ref = (payload as { ref: unknown }).ref;
      return typeof ref === 'string' ? ref : null;
    }
  } catch {
    // Not a key we can read. Not our problem to diagnose.
  }
  return null;
}

/**
 * Why Supabase cannot be reached, in words worth showing someone.
 *
 * This exists because of a real deployment: a mistyped project URL produced a
 * blank "Something went wrong" page with nothing to act on. None of these
 * strings contain a secret — a URL and a key that is public by design — so
 * they are safe to render.
 *
 * Returns null when the configuration looks usable. It cannot prove the
 * project is reachable; only that the values are not obviously wrong.
 */
export function supabaseConfigProblem(): string | null {
  const url = publicEnv.supabaseUrl;
  const key = publicEnv.supabaseKey;

  if (!url && !key) {
    return 'This deployment has no Supabase settings. NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set, and the site must be rebuilt afterwards — these values are baked in at build time, so changing them without a new deploy has no effect.';
  }
  if (!url) return 'NEXT_PUBLIC_SUPABASE_URL is not set on this deployment.';
  if (!key) return 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set on this deployment.';

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return `NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${url}`;
  }

  const ref = host.endsWith('.supabase.co') ? host.slice(0, -'.supabase.co'.length) : null;

  // Every Supabase project reference is 20 characters. A 19- or 21-character
  // one is a typo, and it fails as a DNS error with no useful message.
  if (ref !== null && ref.length !== 20) {
    return `The project reference in NEXT_PUBLIC_SUPABASE_URL is ${ref.length} characters ("${ref}"). Supabase references are always 20 — this looks like a typo.`;
  }

  const keyRef = refInsideLegacyKey(key);
  if (ref !== null && keyRef !== null && keyRef !== ref) {
    return `NEXT_PUBLIC_SUPABASE_URL points at project "${ref}" but the key belongs to project "${keyRef}". One of the two is from a different project.`;
  }

  return null;
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
