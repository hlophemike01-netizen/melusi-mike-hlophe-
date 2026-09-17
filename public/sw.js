/* eslint-disable */
/**
 * SafeCircle service worker.
 *
 * Scope is deliberately narrow. It caches the application shell and static
 * assets so the app opens offline, and it serves an offline page for
 * navigations it cannot fulfil.
 *
 * What it does NOT do, and must not be extended to do:
 *   - cache Supabase API responses. A cached roster, activity or location can
 *     be hours stale, and stale safety information is more dangerous than an
 *     honest "you are offline".
 *   - cache anything containing a location, a token or a share link.
 *   - perform background geolocation. Service workers cannot access
 *     geolocation at all; see docs/LOCATION_MODEL.md.
 */

const VERSION = 'safecircle-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const OFFLINE_URL = '/offline';

const SHELL_ASSETS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Same-origin only. Never intercept Supabase, Mapbox or any other API.
  if (url.origin !== self.location.origin) return;

  // Never cache auth callbacks, share links or API routes.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/shared/')
  ) {
    return;
  }

  // Navigations: network first, offline page as the fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  // Static build output: cache first, since it is content-hashed.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});
