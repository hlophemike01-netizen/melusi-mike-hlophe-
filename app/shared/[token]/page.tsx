import type { Metadata } from 'next';
import Link from 'next/link';
import { SharedLocationView } from '@/features/map/SharedLocationView';

export const metadata: Metadata = {
  title: 'Shared location',
  robots: { index: false, follow: false },
};

/**
 * The page a trusted contact without a SafeCircle account opens.
 *
 * The token in the URL is the credential. It is never sent to an analytics
 * endpoint, never logged, and the page is marked noindex so a pasted link
 * cannot end up in a search index. The lookup happens client-side so the token
 * does not appear in server request logs either.
 */
export default async function SharedLocationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 py-6">
      <header className="mb-5 flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white"
        >
          ◎
        </span>
        <span className="font-bold tracking-tight">SafeCircle</span>
      </header>

      <SharedLocationView token={token} />

      <footer className="mt-8 border-t border-subtle pt-4 text-xs leading-relaxed text-secondary">
        <p>
          Someone shared their location with you for a limited time. Access ends automatically, and
          they can stop it at any moment.
        </p>
        <p className="mt-2">
          SafeCircle does not replace emergency services. If someone is in danger, call your local
          emergency number.
        </p>
        <Link href="/" className="mt-2 inline-block font-semibold underline">
          What is SafeCircle?
        </Link>
      </footer>
    </div>
  );
}
