import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { ActivityCard } from '@/features/activities/ActivityCard';
import { LiveActivityPanel } from '@/features/activities/LiveActivityPanel';
import { InlineNotice } from '@/components/ui/States';
import { createClient } from '@/lib/supabase/server';
import { getScheduledCheckIn } from '@/services/checkin.service';
import { listActiveShares } from '@/services/contacts.service';
import { getMyProfile } from '@/services/profile.service';
import type { ActivityRow } from '@/types/database';

export const metadata: Metadata = { title: 'Activity' };
export const dynamic = 'force-dynamic';

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);
  if (!profile) redirect('/sign-in');

  // RLS decides whether this row is visible at all. A 404 for an activity the
  // caller may not see is correct: confirming it exists would leak that a
  // particular person has an activity running.
  const { data } = await supabase.from('activities').select('*').eq('id', id).maybeSingle();
  const activity = data as ActivityRow | null;
  if (!activity) notFound();

  const isOwner = activity.user_id === profile.id;

  if (!isOwner) {
    return (
      <div className="space-y-4">
        <AppHeader title="Shared activity" backHref="/home" />
        <ActivityCard activity={activity} />
        <InlineNotice tone="info">
          You can see this activity because the person shared it with you. Access ends when the
          activity does.
        </InlineNotice>
      </div>
    );
  }

  const [checkIn, shares] = await Promise.all([
    getScheduledCheckIn(supabase, activity.id),
    listActiveShares(supabase),
  ]);

  return (
    <div className="space-y-4">
      <AppHeader title="Your activity" backHref="/home" />
      <LiveActivityPanel
        activity={activity}
        initialCheckIn={checkIn}
        shares={shares.filter((share) => share.activity_id === activity.id)}
        shareLinks={[]}
      />
    </div>
  );
}
