import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getMyProfile, isModerator } from '@/services/profile.service';

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/groups', label: 'Groups' },
  { href: '/admin/audit', label: 'Audit log' },
];

/**
 * Admin layout.
 *
 * The role check here produces a 404, not a 403: telling an unauthorised
 * visitor that an admin area exists at this path is information they do not
 * need. The real enforcement is in the RPCs, every one of which re-checks the
 * role server-side — this layout only decides what to render.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);

  if (!isModerator(profile)) notFound();

  return (
    <div className="min-h-dvh">
      <header className="surface border-b border-subtle">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Mwhite SafeCircle admin</h1>
              <p className="text-sm text-secondary">
                Signed in as {profile?.display_name} · {profile?.role}
              </p>
            </div>
            <Link href="/home" className="text-sm font-semibold text-brand-700 dark:text-brand-300">
              Back to app
            </Link>
          </div>

          <nav aria-label="Admin sections" className="mt-4 flex gap-1 overflow-x-auto">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className="min-h-10 shrink-0 rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--surface-muted)]"
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-8">
        <p className="rounded-xl border border-subtle bg-[var(--surface-muted)] p-3 text-xs leading-relaxed text-secondary">
          Administrators can see aggregate counts and moderate reports, groups and accounts. They
          cannot see any user&apos;s location, activities or trusted contacts — those are blocked by
          row-level security, not by this interface. Every action you take here is written to the
          audit log.
        </p>
      </footer>
    </div>
  );
}
