/**
 * The most important behavioural guarantee in the product: Mwhite SafeCircle must not
 * ask the browser for a location until the user takes an action that needs one.
 *
 * These tests fail if a component ever calls getCurrentPosition or watchPosition
 * on mount.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGeolocation } from '@/hooks/useGeolocation';

interface GeolocationSpies {
  getCurrentPosition: ReturnType<typeof vi.fn>;
  watchPosition: ReturnType<typeof vi.fn>;
  clearWatch: ReturnType<typeof vi.fn>;
  permissionQuery: ReturnType<typeof vi.fn>;
}

function installGeolocation(state: PermissionState = 'prompt'): GeolocationSpies {
  const position = {
    coords: {
      latitude: -33.9249,
      longitude: 18.4241,
      accuracy: 12,
      heading: null,
      speed: null,
      altitude: null,
      altitudeAccuracy: null,
    },
    timestamp: Date.now(),
  } as unknown as GeolocationPosition;

  const spies: GeolocationSpies = {
    getCurrentPosition: vi.fn((success: PositionCallback) => success(position)),
    watchPosition: vi.fn((success: PositionCallback) => {
      success(position);
      return 1;
    }),
    clearWatch: vi.fn(),
    permissionQuery: vi.fn(() =>
      Promise.resolve({
        state,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as PermissionStatus),
    ),
  };

  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: spies.getCurrentPosition,
      watchPosition: spies.watchPosition,
      clearWatch: spies.clearWatch,
    },
  });

  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: spies.permissionQuery },
  });

  return spies;
}

let spies: GeolocationSpies;

beforeEach(() => {
  spies = installGeolocation();
});

describe('useGeolocation never prompts on its own', () => {
  it('reads no position when the hook mounts', async () => {
    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => expect(spies.permissionQuery).toHaveBeenCalled());

    // Checking the Permissions API is silent. Calling getCurrentPosition is not.
    expect(spies.getCurrentPosition).not.toHaveBeenCalled();
    expect(spies.watchPosition).not.toHaveBeenCalled();
    expect(result.current.reading).toBeNull();
  });

  it('stays silent even after the permission state resolves to granted', async () => {
    spies = installGeolocation('granted');
    renderHook(() => useGeolocation());

    await waitFor(() => expect(spies.permissionQuery).toHaveBeenCalled());

    // Already-granted permission is not consent to read a position unasked.
    expect(spies.getCurrentPosition).not.toHaveBeenCalled();
    expect(spies.watchPosition).not.toHaveBeenCalled();
  });

  it('reads a position only when requestOnce is called', async () => {
    const { result } = renderHook(() => useGeolocation());

    await act(async () => {
      await result.current.requestOnce();
    });

    expect(spies.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(result.current.reading?.latitude).toBeCloseTo(-33.9249, 4);
  });

  it('starts a watch only when startWatching is called, and stops it on unmount', async () => {
    const { result, unmount } = renderHook(() => useGeolocation());

    act(() => result.current.startWatching());
    expect(spies.watchPosition).toHaveBeenCalledTimes(1);

    unmount();
    // A watch left running after the screen is gone is a silent tracker.
    expect(spies.clearWatch).toHaveBeenCalled();
  });

  it('does not start a second watch if startWatching is called twice', () => {
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.startWatching());
    act(() => result.current.startWatching());

    expect(spies.watchPosition).toHaveBeenCalledTimes(1);
  });
});

describe('permission denial is handled without breaking the app', () => {
  it('reports denial in plain language and marks the permission denied', async () => {
    const denied = { code: 1, PERMISSION_DENIED: 1 } as unknown as GeolocationPositionError;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((_success: PositionCallback, failure?: PositionErrorCallback) =>
          failure?.(denied),
        ),
        watchPosition: vi.fn(),
        clearWatch: vi.fn(),
      },
    });

    const { result } = renderHook(() => useGeolocation());

    await act(async () => {
      const reading = await result.current.requestOnce();
      expect(reading).toBeNull();
    });

    await waitFor(() => expect(result.current.permission).toBe('denied'));
    expect(result.current.error).toMatch(/optional/i);
  });

  it('reports an unsupported browser rather than throwing', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });

    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.permission).toBe('unsupported'));
  });
});
