import type { ReactNode } from 'react';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { EmergencyLauncher } from '@/features/emergency/EmergencyLauncher';

/**
 * The signed-in application frame.
 *
 * Layout order matters here: content, then the emergency launcher, then the
 * navigation. The launcher sits directly above the tab bar so it is reachable
 * from every screen without ever being the thing a stray tap hits.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only-focusable focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <main id="main" className="mx-auto max-w-2xl px-4 pb-[calc(var(--nav-height)+5.5rem)] pt-4">
        {children}
      </main>

      <EmergencyLauncher />
      <BottomNavigation />
    </div>
  );
}
