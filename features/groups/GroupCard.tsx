import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { ACTIVITY_TYPE_ICONS, ACTIVITY_TYPE_LABELS } from '@/lib/constants';
import type { GroupMemberStatus, GroupRow } from '@/types/database';

export function GroupCard({
  group,
  membershipStatus,
}: {
  group: GroupRow;
  membershipStatus?: GroupMemberStatus | null;
}) {
  return (
    <Link href={`/groups/${group.id}`} className="block">
      <Card className="transition-colors hover:border-brand-300">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="text-2xl">
            {ACTIVITY_TYPE_ICONS[group.activity_type]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">{group.name}</h3>
              {membershipStatus === 'pending' ? (
                <span className="rounded-full bg-caution-50 px-2 py-0.5 text-xs font-semibold text-ink-800 dark:bg-caution-500/20 dark:text-ink-100">
                  Awaiting approval
                </span>
              ) : null}
              {group.visibility === 'private' ? (
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-700 dark:bg-ink-800 dark:text-ink-200">
                  Private
                </span>
              ) : null}
            </div>

            {group.description ? (
              <p className="mt-1 line-clamp-2 text-sm text-secondary">{group.description}</p>
            ) : null}

            <p className="mt-1.5 text-sm text-secondary">
              {ACTIVITY_TYPE_LABELS[group.activity_type]} · {group.member_count} member
              {group.member_count === 1 ? '' : 's'}
              {group.approximate_area ? ` · ${group.approximate_area}` : ''}
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
