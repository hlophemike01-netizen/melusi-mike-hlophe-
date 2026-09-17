import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'safe';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-ink-300',
  secondary:
    'bg-white text-ink-800 border border-ink-200 hover:bg-ink-50 active:bg-ink-100 dark:bg-transparent dark:text-ink-100 dark:border-ink-700',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/30',
  // Reserved for the emergency control and destructive confirmations.
  danger: 'bg-alert-600 text-white hover:bg-alert-700 active:bg-alert-700 disabled:bg-ink-300',
  safe: 'bg-safe-500 text-white hover:brightness-95 active:brightness-90 disabled:bg-ink-300',
};

const SIZES: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-sm',
  // 44px minimum: these are pressed one-handed, often while moving.
  md: 'min-h-11 px-4 text-base',
  lg: 'min-h-14 px-6 text-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, fullWidth = false, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold',
        'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-70',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
});
