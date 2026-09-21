import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Page header. Deliberately plain: the header is orientation, not decoration,
 * and it must not compete with the safety status card below it.
 */
export function AppHeader({
  title,
  subtitle,
  action,
  backHref,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  backHref?: string;
}) {
  return (
    <header className="surface sticky top-0 z-30 border-b border-subtle px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Go back"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-xl text-secondary"
          >
            ←
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
          {subtitle ? <p className="truncate text-sm text-secondary">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
