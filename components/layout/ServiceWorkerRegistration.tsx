'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * The worker caches the application shell so the app opens without a network,
 * showing the offline page for anything it cannot serve. It deliberately does
 * NOT cache API responses: a cached location or group roster could be stale by
 * hours, and stale safety information is worse than none.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Registration failure is not fatal — the app works without offline
        // support. Nothing to show the user.
      });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
