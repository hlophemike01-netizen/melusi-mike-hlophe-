'use client';

import { useEffect } from 'react';
import { supabaseConfigProblem } from '@/lib/env';

/**
 * Global error boundary.
 *
 * `error.message` is never rendered: in production it is a digest, and in
 * development it could carry a query, a table name or a user identifier.
 *
 * The one exception is a broken Supabase configuration, which is shown in
 * full. It contains no secret — a URL and a key that is public by design — and
 * without it a misconfigured deployment shows a blank "Something went wrong"
 * with nothing to act on. That happened on a real deploy of this app: the
 * project URL had a typo in it and the page said nothing useful about why.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[mwhite-safecircle] unhandled error', error.digest ?? error);
  }, [error]);

  const configProblem = supabaseConfigProblem();

  if (configProblem) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="max-w-md">
          <h1 className="text-2xl font-bold">This app is not configured yet</h1>
          <p className="mt-2 text-sm text-secondary">
            Nothing is wrong with your account and no data has been affected. The site itself is
            missing the settings it needs to reach its database.
          </p>
          <p className="mt-4 rounded-xl bg-[var(--surface-muted)] p-3 text-sm">{configProblem}</p>
          <p className="mt-4 text-xs text-secondary">
            If this is your deployment, fix the environment variables and deploy again — they are
            compiled into the site at build time, so saving them without a rebuild changes nothing.
          </p>
        </div>
      </div>
    );
  }

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
