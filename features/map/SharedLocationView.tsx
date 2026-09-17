'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState, InlineNotice, LoadingCard } from '@/components/ui/States';
import { toAppError } from '@/lib/errors';
import { useSupabase } from '@/hooks/useSupabase';
import { getLocationByToken } from '@/services/share.service';
import type { SharedLocationRow } from '@/types/database';

const REFRESH_MS = 30_000;

/**
 * Renders a single shared position.
 *
 * It shows one point and a timestamp — no trail, no history, no map of where
 * the person has been. The RPC behind it returns exactly one row for exactly
 * this reason.
 */
export function SharedLocationView({ token }: { token: string }) {
  const db = useSupabase();
  const [data, setData] = useState<SharedLocationRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const row = await getLocationByToken(db, token);
        if (!cancelled) {
          setData(row);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) setError(toAppError(cause).userMessage);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const interval = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [db, token]);

  if (loading) return <LoadingCard label="Loading shared location" />;

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setLoading(true);
          setError(null);
        }}
      />
    );
  }

  if (!data) {
    return (
      <ErrorState message="This link has expired or was turned off by the person who shared it." />
    );
  }

  const hasPosition = data.lat !== null && data.lng !== null;

  return (
    <div className="space-y-4">
      {data.emergency_active ? (
        <div className="rounded-[var(--radius-card)] border-2 border-alert-600 bg-alert-50 p-4 dark:bg-alert-600/10">
          <h1 className="text-lg font-bold text-alert-700 dark:text-alert-50">
            {data.sharer_name} has activated emergency mode
          </h1>
          <p className="mt-1.5 text-sm">
            They asked SafeCircle to alert you. <strong>Emergency services have not been
            contacted</strong> — if you believe they are in danger, call your local emergency number.
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader
            title={`${data.sharer_name} shared their location with you`}
            description={
              data.reason === 'check_in_missed'
                ? 'They missed a safety check-in.'
                : 'They are on an activity and chose to share it with you.'
            }
          />
        </Card>
      )}

      <Card>
        {hasPosition ? (
          <>
            <p className="text-sm text-secondary">Last known position</p>
            <p className="mt-1 font-mono text-lg tabular-nums">
              {data.lat!.toFixed(5)}, {data.lng!.toFixed(5)}
            </p>
            {data.accuracy ? (
              <p className="mt-0.5 text-xs text-secondary">
                Accurate to about {Math.round(data.accuracy)}m
              </p>
            ) : null}
            {data.recorded_at ? (
              <p className="mt-1 text-sm text-secondary">
                Updated {new Date(data.recorded_at).toLocaleTimeString()}
              </p>
            ) : null}
            <a
              href={`https://www.openstreetmap.org/?mlat=${data.lat}&mlon=${data.lng}#map=16/${data.lat}/${data.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-4 font-semibold text-white"
            >
              Open in maps
            </a>
          </>
        ) : (
          <p className="text-sm">
            No location is available right now. This can happen if their phone screen is locked or
            they have no signal.
          </p>
        )}
      </Card>

      <InlineNotice tone="info">
        This link stops working at {new Date(data.expires_at).toLocaleString()}, or sooner if{' '}
        {data.sharer_name} turns sharing off. It refreshes every 30 seconds while this page is open.
      </InlineNotice>
    </div>
  );
}
