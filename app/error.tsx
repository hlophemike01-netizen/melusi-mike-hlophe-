'use client';

import { useEffect } from 'react';

/**
 * Global error boundary.
 *
 * Shows a generic message only. `error.message` is never rendered: in
 * production it would be a digest, and in development it could carry a query,
 * a table name or a user identifier.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[safecircle] unhandled error', error.digest ?? error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-secondary">
          We could not load this page. Your data has not been affected.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 font-semibold text-white"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
