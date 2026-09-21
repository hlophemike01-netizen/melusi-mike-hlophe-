'use client';

import { useCallback, useEffect, useState } from 'react';
import { publicEnv, hasPushConfigured } from '@/lib/env';
import { useSupabase } from '@/hooks/useSupabase';

export type PushState =
  | 'unsupported'   // the browser has no Push API
  | 'unconfigured'  // no VAPID key deployed
  | 'denied'        // the user refused notifications
  | 'off'           // supported and permitted, but not subscribed here
  | 'on';

/**
 * Turning trusted-contact alerts on for this browser.
 *
 * Same discipline as geolocation: mounting this hook never asks for
 * permission. It reads the existing state, which is silent, and only calls
 * `Notification.requestPermission()` from `enable()` — which a component must
 * call from a real user action.
 *
 * A subscription is per-browser, so this tells you about the device you are
 * on, not the account.
 */
export function usePushAlerts() {
  const db = useSupabase();
  const [state, setState] = useState<PushState>('off');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async (): Promise<PushState> => {
    if (typeof window === 'undefined') return 'off';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return 'unsupported';
    }
    if (!hasPushConfigured()) return 'unconfigured';
    if (Notification.permission === 'denied') return 'denied';

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      return existing ? 'on' : 'off';
    } catch {
      return 'off';
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void read().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [read]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        setError(
          permission === 'denied'
            ? 'Notifications are blocked for this site. You can turn them back on in your browser settings.'
            : null,
        );
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicEnv.vapidPublicKey),
      });

      const json = subscription.toJSON();
      // user_id is deliberately omitted: the database derives it from the
      // session, so a tampered request cannot register against someone else.
      const { error: saveError } = await db.from('push_subscriptions').upsert(
        {
          endpoint: subscription.endpoint,
          p256dh: json.keys?.p256dh ?? '',
          auth: json.keys?.auth ?? '',
          is_active: true,
        },
        { onConflict: 'endpoint' },
      );

      if (saveError) throw saveError;
      setState('on');
    } catch {
      setError('We could not turn on alerts for this device. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [db]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await db.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState('off');
    } catch {
      setError('We could not turn alerts off. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [db]);

  return { state, busy, error, enable, disable };
}

/**
 * VAPID keys are base64url; PushManager wants raw bytes.
 *
 * Backed by an explicit ArrayBuffer because the DOM types require
 * Uint8Array<ArrayBuffer> specifically — a plain `new Uint8Array(n)` widens to
 * ArrayBufferLike, which also admits SharedArrayBuffer and is rejected.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
