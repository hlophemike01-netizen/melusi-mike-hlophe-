import type { Metadata } from 'next';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';
import { createClient } from '@/lib/supabase/server';
import { listAuditLog } from '@/services/admin.service';

export const metadata: Metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

export default async function AdminAuditPage() {
  const supabase = await createClient();
  const entries = await listAuditLog(supabase, 200);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Audit log</h2>
      <p className="text-sm text-secondary">
        Append-only. Entries cannot be edited or deleted by anyone, including administrators.
        Coordinates, contact details and credentials are never recorded here.
      </p>

      {entries.length === 0 ? (
        <EmptyState icon="📜" title="No audit entries yet" />
      ) : (
        <Card>
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-subtle text-left text-xs uppercase tracking-wide text-secondary">
                  <th scope="col" className="py-2 pr-4 font-semibold">When</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Action</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Entity</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Actor role</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-subtle last:border-0">
                    <td className="whitespace-nowrap py-2.5 pr-4 text-secondary">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{entry.action}</td>
                    <td className="py-2.5 pr-4 text-secondary">{entry.entity_type}</td>
                    <td className="py-2.5 pr-4 capitalize text-secondary">
                      {entry.actor_role ?? 'system'}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-secondary">
                      {JSON.stringify(entry.metadata)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
