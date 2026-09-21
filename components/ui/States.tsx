import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

/** Skeleton block used while a section loads. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-lg bg-ink-200/70 dark:bg-ink-700/50', className)}
    />
  );
}

export function LoadingCard({ label = 'Loading' }: { label?: string }) {
  return (
    <Card aria-busy="true">
      <span className="sr-only-focusable">{label}</span>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-3 h-3 w-2/3" />
      <Skeleton className="mt-2 h-3 w-1/2" />
    </Card>
  );
}

/**
 * Empty state. Every list in the app has one — a blank area leaves people
 * wondering whether the app is broken or they simply have nothing yet.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-2 py-8 text-center">
      {icon ? (
        <span aria-hidden="true" className="text-3xl">
          {icon}
        </span>
      ) : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-secondary">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </Card>
  );
}

/**
 * Error state. `message` must already be a safe, user-facing string from
 * AppError.userMessage — never a raw exception.
 */
export function ErrorState({
  message,
  onRetry,
  retryLabel = 'Try again',
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <Card className="border-alert-600/40 bg-alert-50 dark:bg-alert-600/10">
      <div role="alert" className="flex flex-col gap-2">
        <p className="text-sm font-medium text-alert-700 dark:text-alert-50">{message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="self-start rounded-lg border border-alert-600/40 px-3 py-2 text-sm font-semibold text-alert-700 dark:text-alert-50"
          >
            {retryLabel}
          </button>
        ) : null}
      </div>
    </Card>
  );
}

export function InlineNotice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'caution' | 'safe';
  children: ReactNode;
}) {
  const tones = {
    info: 'bg-brand-50 text-brand-800 border-brand-200 dark:bg-brand-900/25 dark:text-brand-100 dark:border-brand-800',
    caution:
      'bg-caution-50 text-ink-800 border-caution-500/30 dark:bg-caution-500/10 dark:text-ink-100',
    safe: 'bg-safe-50 text-ink-800 border-safe-500/30 dark:bg-safe-500/10 dark:text-ink-100',
  } as const;

  return (
    <div className={cn('rounded-xl border px-3 py-2.5 text-sm leading-relaxed', tones[tone])}>
      {children}
    </div>
  );
}
