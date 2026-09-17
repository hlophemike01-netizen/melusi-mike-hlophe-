'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';
import { ACTIVITY_TYPE_LABELS } from '@/lib/constants';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useSupabase } from '@/hooks/useSupabase';
import { setGroupStatus } from '@/services/admin.service';
import type { GroupRow, GroupStatus } from '@/types/database';

export function AdminGroupTable({ groups }: { groups: GroupRow[] }) {
  const db = useSupabase();
  const router = useRouter();

  const change = useAsyncAction(async (groupId: string, status: GroupStatus) => {
    await setGroupStatus(db, groupId, status);
    router.refresh();
    return null;
  });

  if (groups.length === 0) {
    return <EmptyState icon="👥" title="No groups yet" />;
  }

  return (
    <Card>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-subtle text-left text-xs uppercase tracking-wide text-secondary">
              <th scope="col" className="py-2 pr-4 font-semibold">Name</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Type</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Visibility</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Members</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.id} className="border-b border-subtle last:border-0">
                <td className="py-2.5 pr-4 font-medium">{group.name}</td>
                <td className="py-2.5 pr-4 text-secondary">
                  {ACTIVITY_TYPE_LABELS[group.activity_type]}
                </td>
                <td className="py-2.5 pr-4 capitalize text-secondary">
                  {group.visibility.replace(/_/g, ' ')}
                </td>
                <td className="py-2.5 pr-4 tabular-nums">{group.member_count}</td>
                <td className="py-2.5 pr-4 capitalize">{group.status}</td>
                <td className="py-2.5 pr-4">
                  {group.status === 'suspended' ? (
                    <Button size="sm" variant="secondary" onClick={() => void change.run(group.id, 'active')}>
                      Restore
                    </Button>
                  ) : (
                    <Button size="sm" variant="danger" onClick={() => void change.run(group.id, 'suspended')}>
                      Suspend
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {change.error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-alert-600">
          {change.error}
        </p>
      ) : null}
    </Card>
  );
}
