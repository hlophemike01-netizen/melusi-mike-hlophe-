import type { Metadata } from 'next';
import { AdminGroupTable } from '@/features/admin/AdminGroupTable';
import { createClient } from '@/lib/supabase/server';
import { listGroupsForReview } from '@/services/admin.service';

export const metadata: Metadata = { title: 'Groups' };
export const dynamic = 'force-dynamic';

export default async function AdminGroupsPage() {
  const supabase = await createClient();
  const groups = await listGroupsForReview(supabase, 100);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Groups</h2>
      <AdminGroupTable groups={groups} />
    </div>
  );
}
