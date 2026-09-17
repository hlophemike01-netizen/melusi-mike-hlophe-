'use client';

import { useEffect, useRef, useState } from 'react';
import { LOCATION_UPDATE_INTERVAL_MS } from '@/lib/constants';
import { recordLocation } from '@/services/activity.service';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useSupabase } from '@/hooks/useSupabase';

export interface LocationBroadcastState {
  active: boolean;
  lastSentAt: number | null;
  error: string | null;
  permission: ReturnType<typeof useGeolocation>['permission'];
}

/**
 * Streams the user's position to the server while an activity is running.
 *
 * Two constraints shape this:
 *
 *  1. It only starts when `enabled` is true, which the caller sets from the
 *     activity's own state. It never self-starts.
 *
 *  2. Browsers stop or heavily throttle geolocation once the page is hidden,
 *     so this is NOT background tracking and is not presented as such. When
 *     the tab is hidden we stop sending rather than pretending to continue —
 *     a stale point shown as live is worse than an honest gap.
 *     See docs/LOCATION_MODEL.md for the native-app path.
 */
export function useLocationBroadcast(
  activityId: string | null,
  enabled: boolean,
): LocationBroadcastState {
  const db = useSupabase();
  const { permission, reading, error, startWatching, stopWatching } = useGeolocation();
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!enabled || !activityId) {
      stopWatching();
      return;
    }

    startWatching();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopWatching();
      } else {
        startWatching();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopWatching();
    };
  }, [enabled, activityId, startWatching, stopWatching]);

  useEffect(() => {
    if (!enabled || !activityId || !reading) return;

    const now = Date.now();
    if (now - lastSentRef.current < LOCATION_UPDATE_INTERVAL_MS) return;
    lastSentRef.current = now;

    let cancelled = false;
    void recordLocation(db, activityId, {
      latitude: reading.latitude,
      longitude: reading.longitude,
      accuracy: reading.accuracy,
      heading: reading.heading,
      speed: reading.speed,
    })
      .then(() => {
        if (!cancelled) {
          setLastSentAt(now);
          setSendError(null);
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        // A failed update is not fatal: the previous point stands until it
        // expires. Surface it so the user knows the feed has gone quiet.
        setSendError(
          cause instanceof Error ? cause.message : 'We could not send your latest location.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [db, enabled, activityId, reading]);

  return {
    active: enabled && Boolean(activityId),
    lastSentAt,
    error: sendError ?? error,
    permission,
  };
}
