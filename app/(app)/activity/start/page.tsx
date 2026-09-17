import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { StartActivityForm } from '@/features/activities/StartActivityForm';
import { createClient } from '@/lib/supabase/server';
import { getActiveActivity } from '@/services/activity.service';
import { listContacts } from '@/services/contacts.service';
import { listMyGroups } from '@/services/group.service';
import { getMyProfile } from '@/services/profile.service';

export const metadata: Metadata = { title: 'Start activity' };
export const dynamic = 'force-dynamic';

export default async function StartActivityPage() {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);
  if (!profile) redirect('/sign-in');

  const existing = await getActiveActivity(supabase);
  if (existing) redirect(`/activity/${existing.id}`);

  const [groups, contacts] = await Promise.all([listMyGroups(supabase), listContacts(supabase)]);

  return (
    <div className="space-y-4">
      <AppHeader title="Start a safe activity" subtitle="You choose who can see you" backHref="/home" />
      <StartActivityForm
        profile={profile}
        groups={groups
          .filter((group) => group.myMembership?.status === 'approved')
          .map(({ myMembership: _myMembership, ...group }) => group)}
        contacts={contacts.filter((contact) => contact.is_active)}
      />
    </div>
  );
}
