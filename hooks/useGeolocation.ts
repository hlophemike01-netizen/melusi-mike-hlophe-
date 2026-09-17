'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from '@/lib/geo';

export type LocationPermissionState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface GeolocationReading extends LatLng {
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export interface UseGeolocationResult {
  permission: LocationPermissionState;
  reading: GeolocationReading | null;
  error: string | null;
  watching: boolean;
  /** Triggers the browser prompt. Only call this from an explicit user action. */
  requestOnce: () => Promise<GeolocationReading | null>;
  startWatching: () => void;
  stopWatching: () => void;
}

/**
 * Geolocation access.
 *
 * The contract this hook exists to enforce:
 *
 *   Nothing in it touches `navigator.geolocation` until the caller invokes
 *   `requestOnce()` or `startWatching()` in response to a user action.
 *   Mounting the hook — on the dashboard, the map, anywhere — reads the
 *   Permissions API at most, which never prompts and never returns a position.
 *
 * That is why permission state is read through `navigator.permissions.query`
 * rather than by "just calling getCurrentPosition to see what happens", which
 * is the usual shortcut and which does prompt.
 */
export function useGeolocation(): UseGeolocationResult {
  const [permission, setPermission] = useState<LocationPermissionState>('unknown');
  const [reading, setReading] = useState<GeolocationReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  // Passive permission check. Does not prompt and does not read a position.
  //
  // All of it runs in an async function so that nothing sets state during the
  // effect body itself — the state only moves when the browser answers.
  useEffect(() => {
    let cancelled = false;
    let status: PermissionStatus | null = null;

    const onChange = () => {
      if (status && !cancelled) setPermission(status.state as LocationPermissionState);
    };

    const detect = async () => {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        if (!cancelled) setPermission('unsupported');
        return;
      }

      if (!('permissions' in navigator)) {
        // Older Safari has no Permissions API. Stay at 'unknown' rather than
        // probing with getCurrentPosition, because probing means prompting.
        if (!cancelled) setPermission('unknown');
        return;
      }

      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (cancelled) return;
        status = result;
        setPermission(result.state as LocationPermissionState);
        result.addEventListener('change', onChange);
      } catch {
        if (!cancelled) setPermission('unknown');
      }
    };

    void detect();

    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
    };
  }, []);

  const toReading = (position: GeolocationPosition): GeolocationReading => ({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
    heading: Number.isFinite(position.coords.heading ?? NaN) ? position.coords.heading : null,
    speed: Number.isFinite(position.coords.speed ?? NaN) ? position.coords.speed : null,
    timestamp: position.timestamp,
  });

  const describeError = (positionError: GeolocationPositionError): string => {
    switch (positionError.code) {
      case positionError.PERMISSION_DENIED:
        return 'Location permission was declined. You can still use SafeCircle — location sharing is optional.';
      case positionError.POSITION_UNAVAILABLE:
        return 'We could not get a location fix. Try moving somewhere with a clearer view of the sky.';
      case positionError.TIMEOUT:
        return 'Getting your location took too long. Please try again.';
      default:
        return 'We could not read your location.';
    }
  };

  const requestOnce = useCallback(async (): Promise<GeolocationReading | null> => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setPermission('unsupported');
      setError('This browser does not support location.');
      return null;
    }

    setError(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const next = toReading(position);
          setReading(next);
          setPermission('granted');
          resolve(next);
        },
        (positionError) => {
          setError(describeError(positionError));
          if (positionError.code === positionError.PERMISSION_DENIED) setPermission('denied');
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
      );
    });
  }, []);

  const startWatching = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setPermission('unsupported');
      return;
    }
    if (watchIdRef.current !== null) return;

    setError(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setReading(toReading(position));
        setPermission('granted');
      },
      (positionError) => {
        setError(describeError(positionError));
        if (positionError.code === positionError.PERMISSION_DENIED) {
          setPermission('denied');
          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
            setWatching(false);
          }
        }
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
    );
    setWatching(true);
  }, []);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setWatching(false);
  }, []);

  // Never leave a watch running after the component goes away.
  useEffect(() => stopWatching, [stopWatching]);

  return { permission, reading, error, watching, requestOnce, startWatching, stopWatching };
}
