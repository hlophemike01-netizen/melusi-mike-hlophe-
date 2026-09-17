import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { EmptyState } from '@/components/ui/States';
import { GroupCard } from '@/features/groups/GroupCard';
import { createClient } from '@/lib/supabase/server';
import { discoverGroups, listMyGroups } from '@/services/group.service';
import { getMyProfile } from '@/services/profile.service';

export const metadata: Metadata = { title: 'Groups' };
export const dynamic = 'force-dynamic';

export default async function GroupsPage() {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);
  if (!profile) redirect('/sign-in');

  const [mine, discover] = await Promise.all([listMyGroups(supabase), discoverGroups(supabase)]);
  const myIds = new Set(mine.map((group) => group.id));
  const suggestions = discover.filter((group) => !myIds.has(group.id));

  return (
    <div className="space-y-4">
      <AppHeader
        title="Groups"
        subtitle="Communities you can share activities with"
        action={
          <Link
            href="/groups/new"
            className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white"
          >
            Create
          </Link>
        }
      />

      <section aria-labelledby="my-groups" className="space-y-2">
        <h2 id="my-groups" className="px-1 text-sm font-semibold uppercase tracking-wide text-secondary">
          Your groups
        </h2>
        {mine.length === 0 ? (
          <EmptyState
            icon="👥"
            title="You have not joined a group yet"
            description="Groups let you share an activity with people who walk or run the same routes. Only approved members can see a group activity."
          />
        ) : (
          mine.map((group) => (
            <GroupCard key={group.id} group={group} membershipStatus={group.myMembership?.status} />
          ))
        )}
      </section>

      <section aria-labelledby="discover" className="space-y-2">
        <h2 id="discover" className="px-1 text-sm font-semibold uppercase tracking-wide text-secondary">
          Discover
        </h2>
        {suggestions.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="No public groups yet"
            description="Public groups in your area will appear here. You can create one for your neighbourhood."
          />
        ) : (
          suggestions.map((group) => <GroupCard key={group.id} group={group} />)
        )}
      </section>

      <p className="px-1 pb-2 text-xs text-secondary">
        Group members can see your display name and area, never your email or phone number.
      </p>
    </div>
  );
}
