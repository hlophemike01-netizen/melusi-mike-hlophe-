import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SAFETY_COPY } from '@/lib/constants';
import { publicEnv } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

const PROMISES = [
  {
    icon: '🔒',
    title: 'Off by default',
    body: 'Mwhite SafeCircle never asks for your location until you start something that needs it. Nothing is shared until you say so.',
  },
  {
    icon: '👥',
    title: 'You pick who sees you',
    body: 'Share with chosen trusted contacts, with a group, or with nobody at all. You can stop sharing at any moment.',
  },
  {
    icon: '⏱️',
    title: 'Temporary by design',
    body: 'Sharing ends when your activity ends. Precise locations are deleted, not archived — there is no movement history for anyone to browse.',
  },
  {
    icon: '🗺️',
    title: 'Counts, not people',
    body: 'The community map shows how many people are active in an area, rounded to about 1km. It never shows where an individual is.',
  },
];

/**
 * The landing page is one of only two pages that may be indexed (the other is
 * the privacy explainer). Everything else inherits noindex from the root
 * layout.
 *
 * The copy deliberately does not promise that you can "track" anyone: the
 * product cannot do that. The person sharing has to start an activity and
 * choose who sees it. Promising otherwise would attract people expecting a
 * covert tracker and disappoint every one of them.
 */
export const metadata: Metadata = {
  title: 'Mwhite SafeCircle — share your journey with people you trust',
  description:
    'Let the people you trust know you got there safely. Start a walk, run or journey, choose exactly who can see you, and sharing ends when you do. Location sharing is always optional.',
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  keywords: [
    'personal safety app',
    'share location with family',
    'safe walk home',
    'running safety',
    'check in when I get home',
    'South Africa',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_ZA',
    siteName: 'Mwhite SafeCircle',
    title: 'Mwhite SafeCircle — share your journey with people you trust',
    description:
      'Start a walk, run or journey and share it with the people you choose, for as long as you choose. Sharing is off until you turn it on.',
    url: '/',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Mwhite SafeCircle' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mwhite SafeCircle',
    description: 'Share your journey with people you trust. Sharing is off until you turn it on.',
    images: ['/og.png'],
  },
};

export default async function LandingPage() {
  // A signed-in visitor goes straight to their dashboard.
  if (publicEnv.supabaseUrl && publicEnv.supabaseAnonKey) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect('/home');
  }

  return (
    <div className="min-h-dvh">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <header className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-lg text-white"
          >
            ◎
          </span>
          <span className="text-xl font-bold tracking-tight">Mwhite SafeCircle</span>
        </header>

        <h1 className="mt-10 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          Tell someone where you are going. Nobody else.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-secondary">
          Mwhite SafeCircle lets you start a temporary safety activity — a walk home, a run, a journey —
          and share it with the people you choose, for as long as you choose.
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className="flex min-h-14 flex-1 items-center justify-center rounded-xl bg-brand-600 px-6 font-bold text-white hover:bg-brand-700"
          >
            Create an account
          </Link>
          <Link
            href="/sign-in"
            className="surface flex min-h-14 flex-1 items-center justify-center rounded-xl border border-subtle px-6 font-semibold"
          >
            Sign in
          </Link>
        </div>

        <section aria-label="How Mwhite SafeCircle protects you" className="mt-10 space-y-3">
          {PROMISES.map((promise) => (
            <div key={promise.title} className="surface rounded-[var(--radius-card)] border border-subtle p-4">
              <div className="flex gap-3">
                <span aria-hidden="true" className="text-2xl">
                  {promise.icon}
                </span>
                <div>
                  <h2 className="font-semibold">{promise.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-secondary">{promise.body}</p>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-8 rounded-[var(--radius-card)] border border-caution-500/40 bg-caution-50 p-4 dark:bg-caution-500/10">
          <h2 className="font-semibold">What Mwhite SafeCircle is not</h2>
          <p className="mt-1.5 text-sm leading-relaxed">{SAFETY_COPY.notEmergencyServices}</p>
          <p className="mt-1.5 text-sm leading-relaxed">{SAFETY_COPY.noGuarantee}</p>
          <p className="mt-1.5 text-sm leading-relaxed">{SAFETY_COPY.backgroundLimitation}</p>
        </section>

        <footer className="mt-10 border-t border-subtle pt-5 text-sm text-secondary">
          <Link href="/legal/privacy" className="font-semibold underline">
            How Mwhite SafeCircle handles your location
          </Link>
        </footer>
      </div>
    </div>
  );
}
