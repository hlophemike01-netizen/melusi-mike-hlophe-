'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CommunityActivityCard } from '@/features/dashboard/CommunityActivityCard';
import { toAppError } from '@/lib/errors';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useSupabase } from '@/hooks/useSupabase';
import { getActiveGroupCount, getNearbySummary } from '@/services/community.service';
import type { ActivitySummaryRow } from '@/types/database';

/**
 * "Nearby right now" on the dashboard.
 *
 * Note the flow: on mount it fetches nothing that needs a position. The
 * location prompt only fires when the user presses "Show nearby activity" —
 * browsing the dashboard must never trigger a permission dialog.
 *
 * The position is used to ask the server for counts and is not stored or sent
 * anywhere else.
 */
export function NearbyPanel() {
  const db = useSupabase();
  const { permission, requestOnce } = useGeolocation();
  const [summary, setSummary] = useState<ActivitySummaryRow[]>([]);
  const [activeGroups, setActiveGroups] = useState(0);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group counts need no position at all, so they load immediately.
  useEffect(() => {
    void getActiveGroupCount(db)
      .then(setActiveGroups)
      .catch(() => setActiveGroups(0));
  }, [db]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const reading = await requestOnce();
      if (!reading) {
        setEnabled(false);
        return;
      }
      const rows = await getNearbySummary(db, {
        latitude: reading.latitude,
        longitude: reading.longitude,
      });
      setSummary(rows);
      setEnabled(true);
    } catch (cause) {
      setError(toAppError(cause).userMessage);
    } finally {
      setLoading(false);
    }
  }, [db, requestOnce]);

  // Once permission is already granted, refreshing on return costs nothing
  // extra in privacy terms — the browser will not prompt again.
  useEffect(() => {
    if (permission === 'granted' && !enabled && !loading) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission]);

  if (!enabled && !loading) {
    return (
      <div className="surface rounded-[var(--radius-card)] border border-subtle p-4">
        <h2 className="text-base font-semibold">Nearby right now</h2>
        <p className="mt-1 text-sm text-secondary">
          See how many people are active in your area. SafeCircle uses your location once to fetch
          counts — it is not stored, and nothing about you is shared.
        </p>
        {error ? (
          <p role="alert" className="mt-2 text-sm font-medium text-alert-600">
            {error}
          </p>
        ) : null}
        {permission === 'denied' ? (
          <p className="mt-2 text-sm text-secondary">
            Location permission is off for this site. You can turn it on in your browser settings.
          </p>
        ) : (
          <Button variant="secondary" className="mt-3" onClick={() => void load()}>
            Show nearby activity
          </Button>
        )}
      </div>
    );
  }

  return (
    <CommunityActivityCard
      summary={summary}
      loading={loading}
      locationAvailable={enabled}
      activeGroups={activeGroups}
    />
  );
}
