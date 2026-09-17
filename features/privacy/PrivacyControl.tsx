'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';

/**
 * A single privacy switch with its explanation attached.
 *
 * The explanation is a required prop, not an optional one. A privacy toggle
 * whose consequence is not spelled out where it is flipped is a dark pattern,
 * so the component makes it impossible to ship one.
 */
export function PrivacyControl({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  tone = 'neutral',
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** 'sharing' marks a control that turns sharing ON, so it reads differently. */
  tone?: 'neutral' | 'sharing';
}) {
  const id = useId();

  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-base font-medium">
          {label}
        </label>
        <p id={`${id}-description`} className="mt-1 text-sm leading-relaxed text-secondary">
          {description}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-describedby={`${id}-description`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50',
          checked
            ? tone === 'sharing'
              ? 'bg-safe-500'
              : 'bg-brand-600'
            : 'bg-ink-300 dark:bg-ink-700',
        )}
      >
        <span className="sr-only-focusable">{checked ? 'On' : 'Off'}</span>
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  );
}
