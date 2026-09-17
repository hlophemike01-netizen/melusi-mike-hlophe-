import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { ACTIVITY_TYPE_ICONS, ACTIVITY_TYPE_LABELS } from '@/lib/constants';
import type { ActivityRow, ActivityStatus, ActivityVisibility } from '@/types/database';

const VISIBILITY_BADGE: Record<ActivityVisibility, { label: string; className: string }> = {
  private: { label: 'Private', className: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200' },
  nearby: { label: 'Area count', className: 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100' },
  group: { label: 'Group', className: 'bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-50' },
  trusted_contacts: {
    label: 'Trusted contacts',
    className: 'bg-safe-50 text-safe-500 dark:bg-safe-500/15 dark:text-safe-500',
  },
};

const STATUS_LABEL: Record<ActivityStatus, string> = {
  active: 'In progress',
  overdue: 'Check-in missed',
  emergency: 'Emergency',
  completed: 'Finished',
  cancelled: 'Cancelled',
};

export function ActivityCard({
  activity,
  href,
  ownerName,
}: {
  activity: ActivityRow;
  href?: string;
  /** Present when the activity belongs to someone else. */
  ownerName?: string;
}) {
  const badge = VISIBILITY_BADGE[activity.visibility];
  const live = activity.status === 'active' || activity.status === 'overdue' || activity.status === 'emergency';

  const body = (
    <Card className={cn('transition-colors', href && 'hover:border-brand-300')}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-2xl">
          {ACTIVITY_TYPE_ICONS[activity.activity_type]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">
              {activity.title || ACTIVITY_TYPE_LABELS[activity.activity_type]}
            </h3>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', badge.className)}>
              {badge.label}
            </span>
          </div>

          {ownerName ? <p className="mt-0.5 text-sm text-secondary">Shared by {ownerName}</p> : null}

          <p className="mt-1 text-sm text-secondary">
            {STATUS_LABEL[activity.status]} ·{' '}
            {live
              ? `until ${formatTime(activity.expected_end_time)}`
              : formatDate(activity.ended_at ?? activity.start_time)}
          </p>

          {activity.destination ? (
            <p className="mt-1 truncate text-sm text-secondary">Heading to {activity.destination}</p>
          ) : null}
        </div>
      </div>
    </Card>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
