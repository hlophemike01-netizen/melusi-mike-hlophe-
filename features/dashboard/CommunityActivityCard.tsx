'use client';

import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/Card';
import { InlineNotice, Skeleton } from '@/components/ui/States';
import { ACTIVITY_TYPE_ICONS, ACTIVITY_TYPE_PEOPLE } from '@/lib/constants';
import { K_ANONYMITY_THRESHOLD } from '@/lib/geo';
import type { ActivitySummaryRow } from '@/types/database';

/**
 * "14 runners nearby".
 *
 * This card is the entire community-discovery surface on the dashboard, and it
 * is a count — never a list of people, never a position. The footnote is not
 * decoration: it tells the user what other people can see about *them*, which
 * is the reciprocal fact that makes the count acceptable.
 */
export function CommunityActivityCard({
  summary,
  loading,
  locationAvailable,
  activeGroups,
}: {
  summary: ActivitySummaryRow[];
  loading: boolean;
  locationAvailable: boolean;
  activeGroups: number;
}) {
  return (
    <Card>
      <CardHeader
        title="Nearby right now"
        description="Approximate counts in your area"
        action={
          <Link href="/map" className="text-sm font-semibold text-brand-700 dark:text-brand-300">
            Map
          </Link>
        }
      />

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : !locationAvailable ? (
        <InlineNotice tone="info">
          Turn on location for this screen to see how many people are active nearby. Nothing is
          shared with anyone when you do — this only reads counts.
        </InlineNotice>
      ) : summary.length === 0 ? (
        <p className="text-sm text-secondary">
          No areas nearby have enough activity to show. Areas with fewer than {K_ANONYMITY_THRESHOLD}{' '}
          people are hidden so that individuals cannot be identified.
        </p>
      ) : (
        <ul className="space-y-2">
          {summary.map((row) => (
            <li key={row.activity_type} className="flex items-center gap-3">
              <span aria-hidden="true" className="text-xl">
                {ACTIVITY_TYPE_ICONS[row.activity_type]}
              </span>
              <span className="text-base">
                <strong className="font-bold">{row.activity_count}</strong>{' '}
                {ACTIVITY_TYPE_PEOPLE[row.activity_type]} nearby
              </span>
            </li>
          ))}
          {activeGroups > 0 ? (
            <li className="flex items-center gap-3">
              <span aria-hidden="true" className="text-xl">
                👥
              </span>
              <span className="text-base">
                <strong className="font-bold">{activeGroups}</strong> of your groups active
              </span>
            </li>
          ) : null}
        </ul>
      )}

      <p className="mt-3 border-t border-subtle pt-3 text-xs text-secondary">
        These are grouped counts for areas of about 1km. No one — including you — can see where any
        individual is.
      </p>
    </Card>
  );
}
