import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { EmptyState } from '@/components/ui/States';
import { ActivityCard } from '@/features/activities/ActivityCard';
import { StartActivityButton } from '@/features/dashboard/StartActivityButton';
import { createClient } from '@/lib/supabase/server';
import { getActiveActivity, listMyActivities, listSharedWithMe } from '@/services/activity.service';
import { getMyProfile } from '@/services/profile.service';

export const metadata: Metadata = { title: 'Activity' };
export const dynamic = 'force-dynamic';

export default async function ActivityListPage() {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);
  if (!profile) redirect('/sign-in');

  const [active, mine, shared] = await Promise.all([
    getActiveActivity(supabase),
    listMyActivities(supabase, 30),
    listSharedWithMe(supabase),
  ]);

  const past = mine.filter((activity) => activity.id !== active?.id);

  return (
    <div className="space-y-4">
      <AppHeader title="Activity" subtitle="Your sessions and ones shared with you" />

      {active ? (
        <ActivityCard activity={active} href={`/activity/${active.id}`} />
      ) : (
        <StartActivityButton />
      )}

      {shared.length > 0 ? (
        <section aria-labelledby="shared-heading" className="space-y-2">
          <h2
            id="shared-heading"
            className="px-1 text-sm font-semibold uppercase tracking-wide text-secondary"
          >
            Shared with you
          </h2>
          {shared.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} href={`/activity/${activity.id}`} />
          ))}
        </section>
      ) : null}

      <section aria-labelledby="history-heading" className="space-y-2">
        <h2
          id="history-heading"
          className="px-1 text-sm font-semibold uppercase tracking-wide text-secondary"
        >
          Your history
        </h2>
        {past.length === 0 ? (
          <EmptyState
            icon="🏃"
            title="No past activities"
            description="Activities you finish appear here. Only the summary is kept — precise locations are deleted when an activity ends."
          />
        ) : (
          past.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} href={`/activity/${activity.id}`} />
          ))
        )}
      </section>
    </div>
  );
}
