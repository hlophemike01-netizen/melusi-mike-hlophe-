import { cn } from '@/lib/cn';

/**
 * A single dashboard metric.
 *
 * `tone="alert"` is used only where a number genuinely needs attention (open
 * emergencies, unreviewed reports) — colouring every tile would make none of
 * them mean anything.
 */
export function AdminMetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  detail?: string;
  tone?: 'neutral' | 'alert' | 'positive';
}) {
  const tones = {
    neutral: 'border-subtle',
    alert: 'border-alert-600/50 bg-alert-50 dark:bg-alert-600/10',
    positive: 'border-safe-500/40 bg-safe-50 dark:bg-safe-500/10',
  } as const;

  return (
    <div className={cn('surface rounded-[var(--radius-card)] border p-4', tones[tone])}>
      <p className="text-xs font-semibold uppercase tracking-wide text-secondary">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {detail ? <p className="mt-1 text-xs text-secondary">{detail}</p> : null}
    </div>
  );
}
