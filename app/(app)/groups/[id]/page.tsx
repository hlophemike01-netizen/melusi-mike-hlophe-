import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { GroupDetail } from '@/features/groups/GroupDetail';
import { createClient } from '@/lib/supabase/server';
import { getGroup, getMyMembership, listGroupMembers } from '@/services/group.service';
import { getMyProfile } from '@/services/profile.service';

export const metadata: Metadata = { title: 'Group' };
export const dynamic = 'force-dynamic';

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);
  if (!profile) redirect('/sign-in');

  // RLS hides private groups from non-members, so an invisible group and a
  // non-existent one are indistinguishable from here — which is the point.
  const group = await getGroup(supabase, id);
  if (!group) notFound();

  const [membership, members] = await Promise.all([
    getMyMembership(supabase, id),
    listGroupMembers(supabase, id),
  ]);

  return (
    <div className="space-y-4">
      <AppHeader title={group.name} backHref="/groups" />
      <GroupDetail
        group={group}
        membership={membership}
        members={members}
        currentUserId={profile.id}
      />
    </div>
  );
}
