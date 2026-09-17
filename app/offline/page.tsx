import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Offline' };

/**
 * Served by the service worker when a navigation fails.
 *
 * It says plainly that live information is unavailable. A safety app must not
 * imply that a cached screen reflects the current situation.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <span aria-hidden="true" className="text-4xl">
          📡
        </span>
        <h1 className="mt-4 text-2xl font-bold">You are offline</h1>
        <p className="mt-2 text-sm leading-relaxed text-secondary">
          Mwhite SafeCircle needs a connection to show live activities, groups and locations. We do not
          show cached safety information, because it could be out of date.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-secondary">
          If you need help right now, call your local emergency number directly.
        </p>
      </div>
    </div>
  );
}
