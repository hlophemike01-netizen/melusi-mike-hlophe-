'use client';

import { cn } from '@/lib/cn';

/**
 * The emergency control.
 *
 * Rules it exists to satisfy:
 *   - always reachable, from every screen, in one tap;
 *   - unmistakable, but not alarming enough to dominate the interface;
 *   - never triggers anything on its own — it opens a confirmation, because an
 *     accidental alert to someone's family at 2am has a real cost.
 */
export function EmergencyButton({
  onActivate,
  active,
  compact = false,
}: {
  onActivate: () => void;
  active: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-label={active ? 'Emergency active. Open emergency options.' : 'Open emergency options'}
      className={cn(
        'flex items-center justify-center gap-2 rounded-full font-bold text-white shadow-lg',
        'bg-alert-600 hover:bg-alert-700 active:bg-alert-700',
        'transition-colors focus-visible:outline-offset-4',
        compact ? 'min-h-11 px-4 text-sm' : 'min-h-14 w-full px-6 text-base',
        active && 'animate-emergency-pulse',
      )}
    >
      <span aria-hidden="true">{active ? '🔴' : '🆘'}</span>
      {active ? 'Emergency active — tap to manage' : 'Emergency'}
    </button>
  );
}
