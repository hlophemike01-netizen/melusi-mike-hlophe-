'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { InlineNotice, Skeleton } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { ACTIVITY_TYPE_LABELS } from '@/lib/constants';
import { hasMapboxToken } from '@/lib/env';
import { toAppError } from '@/lib/errors';
import { K_ANONYMITY_THRESHOLD, type MapBounds } from '@/lib/geo';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useSupabase } from '@/hooks/useSupabase';
import { getDensityCells } from '@/services/community.service';
import type { ActivityType, DensityCell } from '@/types/database';

// Mapbox GL touches `window` at import time, so it must not be server-rendered.
const MapContainer = dynamic(
  () => import('@/features/map/MapContainer').then((module) => module.MapContainer),
  { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> },
);

const FILTERS: ActivityType[] = ['running', 'walking', 'cycling', 'group_activity'];

export function CommunityMap() {
  const db = useSupabase();
  const { permission, requestOnce } = useGeolocation();
  const [cells, setCells] = useState<DensityCell[]>([]);
  const [filters, setFilters] = useState<ActivityType[]>([]);
  const [centre, setCentre] = useState<{ latitude: number; longitude: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const loadCells = useCallback(
    async (bounds: MapBounds, activeFilters: ActivityType[]) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const rows = await getDensityCells(db, bounds, activeFilters);
        // Ignore a response that a later pan has already superseded.
        if (requestId === requestIdRef.current) setCells(rows);
      } catch (cause) {
        if (requestId === requestIdRef.current) setError(toAppError(cause).userMessage);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [db],
  );

  const lastBounds = useRef<MapBounds | null>(null);

  const onBoundsChange = useCallback(
    (bounds: MapBounds) => {
      lastBounds.current = bounds;
      void loadCells(bounds, filters);
    },
    [loadCells, filters],
  );

  const toggleFilter = (type: ActivityType) => {
    const next = filters.includes(type)
      ? filters.filter((value) => value !== type)
      : [...filters, type];
    setFilters(next);
    if (lastBounds.current) void loadCells(lastBounds.current, next);
  };

  const total = useMemo(
    () => cells.reduce((sum, cell) => sum + cell.activity_count, 0),
    [cells],
  );

  const locateMe = async () => {
    const reading = await requestOnce();
    if (reading) setCentre({ latitude: reading.latitude, longitude: reading.longitude });
  };

  if (!hasMapboxToken()) {
    return (
      <div className="space-y-3 p-4">
        <InlineNotice tone="caution">
          The map needs a Mapbox access token. Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> in your
          environment — see <code>.env.example</code>.
        </InlineNotice>
        <p className="text-sm text-secondary">
          Everything else in SafeCircle works without it. The map only ever shows approximate area
          counts, so nothing private depends on this configuration.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-var(--nav-height)-9rem)] flex-col">
      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
        {FILTERS.map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={filters.includes(type)}
            onClick={() => toggleFilter(type)}
            className={cn(
              'min-h-9 shrink-0 rounded-full border-2 px-3.5 text-sm font-semibold',
              filters.includes(type)
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'surface border-subtle',
            )}
          >
            {ACTIVITY_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <div className="relative flex-1 overflow-hidden rounded-t-2xl">
        <MapContainer cells={cells} centre={centre} onBoundsChange={onBoundsChange} />

        <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-between gap-2">
          <div className="surface pointer-events-auto rounded-xl border border-subtle px-3 py-2 text-sm shadow-sm">
            {loading ? (
              <span className="text-secondary">Loading…</span>
            ) : total > 0 ? (
              <span>
                <strong>{total}</strong> people active in view
              </span>
            ) : (
              <span className="text-secondary">No areas to show here</span>
            )}
          </div>

          <Button
            size="sm"
            variant="secondary"
            className="pointer-events-auto shadow-sm"
            onClick={() => void locateMe()}
          >
            {permission === 'granted' ? 'Recentre' : 'Find me'}
          </Button>
        </div>
      </div>

      <div className="space-y-2 px-4 pt-3">
        {error ? (
          <p role="alert" className="text-sm font-medium text-alert-600">
            {error}
          </p>
        ) : null}
        <p className="text-xs leading-relaxed text-secondary">
          Circles show roughly how many people are active in an area of about 1km — never where
          anyone is. Areas with fewer than {K_ANONYMITY_THRESHOLD} people are hidden entirely, and
          only people who chose to be counted appear at all.
        </p>
      </div>
    </div>
  );
}
