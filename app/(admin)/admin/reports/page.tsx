import type { Metadata } from 'next';
import { ReportQueue } from '@/features/admin/ReportQueue';
import { createClient } from '@/lib/supabase/server';
import { listReportQueue } from '@/services/admin.service';

export const metadata: Metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

export default async function AdminReportsPage() {
  const supabase = await createClient();
  const reports = await listReportQueue(supabase, undefined, 100);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Report queue</h2>
      <ReportQueue reports={reports} />
    </div>
  );
}
