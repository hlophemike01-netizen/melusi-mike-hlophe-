import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, InlineNotice } from '@/components/ui/States';
import { ActivityCard } from '@/features/activities/ActivityCard';
import { NearbyPanel } from '@/features/dashboard/NearbyPanel';
import { SafetyStatus } from '@/features/dashboard/SafetyStatus';
import { StartActivityButton } from '@/features/dashboard/StartActivityButton';
import { SAFETY_COPY } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';
import { getActiveActivity, listMyActivities } from '@/services/activity.service';
import { listContacts } from '@/services/contacts.service';
import { getActiveEmergency } from '@/services/emergency.service';
import { listMyGroups } from '@/services/group.service';
import { getMyProfile } from '@/services/profile.service';

export const metadata: Metadata = { title: 'Home' };

// Every read here is user-scoped and time-sensitive, so nothing is cached.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);
  if (!profile) redirect('/sign-in');

  const [activeActivity, emergency, groups, contacts, recentActivities] = await Promise.all([
    getActiveActivity(supabase),
    getActiveEmergency(supabase),
    listMyGroups(supabase),
    listContacts(supabase),
    listMyActivities(supabase, 5),
  ]);

  const approvedGroups = groups.filter((group) => group.myMembership?.status === 'approved');
  const pastActivities = recentActivities.filter((activity) => activity.id !== activeActivity?.id);

  return (
    <div className="space-y-4">
      <AppHeader title={`Hello, ${profile.display_name.split(' ')[0]}`} subtitle="Your safety dashboard" />

      <SafetyStatus profile={profile} activity={activeActivity} emergency={emergency} />

      {activeActivity ? (
        <ActivityCard activity={activeActivity} href={`/activity/${activeActivity.id}`} />
      ) : (
        <StartActivityButton />
      )}

      {!profile.location_sharing_enabled ? (
        <InlineNotice tone="info">
          {SAFETY_COPY.locationOptional}{' '}
          <Link href="/profile/privacy" className="font-semibold underline">
            Privacy settings
          </Link>
        </InlineNotice>
      ) : null}

      <NearbyPanel />

      <Card>
        <CardHeader
          title="Trusted contacts"
          description={
            contacts.length === 0
              ? 'Nobody is set up yet'
              : `${contacts.length} contact${contacts.length === 1 ? '' : 's'}`
          }
          action={
            <Link href="/profile/contacts" className="text-sm font-semibold text-brand-700 dark:text-brand-300">
              Manage
            </Link>
          }
        />
        {contacts.length === 0 ? (
          <p className="text-sm text-secondary">
            Add someone you would want to know if a check-in was missed. They only ever see your
            location during a session you authorize.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {contacts.slice(0, 3).map((contact) => (
              <li key={contact.id} className="flex items-center justify-between gap-3">
                <span className="truncate font-medium">{contact.name}</span>
                <span className="shrink-0 text-xs text-secondary">
                  {contact.permission_level === 'emergency_only'
                    ? 'Emergencies only'
                    : contact.permission_level === 'activity_only'
                      ? 'Shared activities'
                      : 'Activities & emergencies'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Your groups"
          description={approvedGroups.length === 0 ? 'No groups yet' : undefined}
          action={
            <Link href="/groups" className="text-sm font-semibold text-brand-700 dark:text-brand-300">
              All groups
            </Link>
          }
        />
        {approvedGroups.length === 0 ? (
          <p className="text-sm text-secondary">
            Join a community group to share activities with people who run or walk the same routes.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {approvedGroups.slice(0, 4).map((group) => (
              <li key={group.id}>
                <Link href={`/groups/${group.id}`} className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium">{group.name}</span>
                  <span className="shrink-0 text-xs text-secondary">{group.member_count} members</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section aria-labelledby="recent-heading" className="space-y-2">
        <h2 id="recent-heading" className="px-1 text-sm font-semibold uppercase tracking-wide text-secondary">
          Recent safety activity
        </h2>
        {pastActivities.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No activities yet"
            description="When you finish an activity it appears here. Precise locations are deleted when an activity ends."
          />
        ) : (
          <div className="space-y-2">
            {pastActivities.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} href={`/activity/${activity.id}`} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
