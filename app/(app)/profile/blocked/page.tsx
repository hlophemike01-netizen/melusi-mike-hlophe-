import type { Metadata } from 'next';
import { AppHeader } from '@/components/layout/AppHeader';
import { BlockedList } from '@/features/reports/BlockedList';
import { createClient } from '@/lib/supabase/server';
import { listMyBlocks } from '@/services/report.service';
import { getPublicProfiles } from '@/services/profile.service';

export const metadata: Metadata = { title: 'Blocked people' };
export const dynamic = 'force-dynamic';

export default async function BlockedPage() {
  const supabase = await createClient();
  const blocks = await listMyBlocks(supabase);

  // A blocked person is hidden from public_profiles by design, so their display
  // name may not resolve. The list falls back to a neutral label rather than
  // un-blocking them just to show a name.
  const profiles = await getPublicProfiles(
    supabase,
    blocks.map((block) => block.blocked_id),
  );

  return (
    <div className="space-y-4">
      <AppHeader title="Blocked people" backHref="/profile" />
      <BlockedList
        blocks={blocks.map((block) => ({
          id: block.id,
          blockedId: block.blocked_id,
          createdAt: block.created_at,
          displayName:
            profiles.find((profile) => profile.id === block.blocked_id)?.display_name ??
            'Blocked member',
        }))}
      />
    </div>
  );
}
