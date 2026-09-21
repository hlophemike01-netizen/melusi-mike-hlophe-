/* eslint-disable */
/**
 * Mwhite SafeCircle service worker.
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

const VERSION = 'mwhite-safecircle-v2';
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

/**
 * Push notifications.
 *
 * The payload is sealed to this browser's own keys, so the push service that
 * relayed it could not read it. It still carries only a name and what
 * happened — never a location, never a share token. See the CHECK constraint
 * on notification_outbox.
 *
 * Nothing here claims emergency services were contacted, because they were
 * not. The wording has to survive being read on a lock screen at 2am.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const name = typeof data.name === 'string' ? data.name : 'Someone';
  const kind = data.kind;

  let title = 'Mwhite SafeCircle';
  let body = name + ' needs your attention.';
  let url = '/home';

  if (kind === 'emergency_raised') {
    title = name + ' activated emergency mode';
    body = 'They asked SafeCircle to alert you. Emergency services have NOT been contacted.';
    url = '/home';
  } else if (kind === 'check_in_missed') {
    title = name + ' missed a safety check-in';
    body = 'They did not respond when their timer ran out. You can see their location.';
    url = '/home';
  } else if (kind === 'emergency_resolved') {
    title = name + ' is safe';
    body = 'They marked their emergency as resolved.';
    url = '/home';
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      /* an emergency should not be silently stacked under an older alert */
      tag: kind === 'emergency_raised' ? 'emergency' : 'safecircle',
      renotify: kind === 'emergency_raised',
      requireInteraction: kind === 'emergency_raised',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/home';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.includes(target) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
