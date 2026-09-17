import Link from 'next/link';

/**
 * The primary call to action. Large, unmissable, and the only brand-coloured
 * button on the dashboard, so there is never a question about what this screen
 * is for.
 */
export function StartActivityButton({ disabled = false }: { disabled?: boolean }) {
  if (disabled) {
    return (
      <div className="rounded-2xl bg-ink-200 px-6 py-5 text-center dark:bg-ink-800">
        <p className="text-base font-bold text-ink-600 dark:text-ink-300">
          Activity already running
        </p>
        <p className="mt-1 text-sm text-secondary">End it before starting another.</p>
      </div>
    );
  }

  return (
    <Link
      href="/activity/start"
      className="flex min-h-16 w-full flex-col items-center justify-center rounded-2xl bg-brand-600 px-6 py-4 text-center font-bold text-white shadow-lg transition-colors hover:bg-brand-700 active:bg-brand-800"
    >
      <span className="text-lg tracking-wide">START SAFE ACTIVITY</span>
      <span className="mt-0.5 text-sm font-medium text-brand-50/90">
        You choose who can see you
      </span>
    </Link>
  );
}
