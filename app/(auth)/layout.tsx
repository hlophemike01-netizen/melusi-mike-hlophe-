import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col px-4 py-8">
      <div className="mx-auto w-full max-w-md flex-1">
        <Link href="/" className="mb-8 flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-lg text-white"
          >
            ◎
          </span>
          <span className="text-xl font-bold tracking-tight">SafeCircle</span>
        </Link>
        {children}
      </div>

      <footer className="mx-auto mt-8 w-full max-w-md text-center text-xs text-secondary">
        <p>SafeCircle does not replace emergency services.</p>
        <Link href="/legal/privacy" className="mt-1 inline-block underline">
          How we handle your location
        </Link>
      </footer>
    </div>
  );
}
