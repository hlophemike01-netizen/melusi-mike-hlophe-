import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { createClient } from '@/lib/supabase/server';
import { getMyProfile } from '@/services/profile.service';

/**
 * Signed-in layout.
 *
 * The session check here is a second gate after middleware, not a replacement
 * for it — and neither is the real boundary. RLS is: even if both were removed,
 * a request without a valid session could not read another user's row.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/sign-in');

  const profile = await getMyProfile(supabase);

  if (profile?.account_status === 'suspended') {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-2xl font-bold">Your account is suspended</h1>
          <p className="mt-2 text-sm text-secondary">
            This account has been suspended following a review. If you think this is a mistake,
            contact support.
          </p>
          <form action="/auth/sign-out" method="post" className="mt-5">
            <button
              type="submit"
              className="min-h-11 rounded-xl border border-subtle px-5 font-semibold"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
