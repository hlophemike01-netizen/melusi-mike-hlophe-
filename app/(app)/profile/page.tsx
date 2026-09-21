import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { InlineNotice } from '@/components/ui/States';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { ProfileForm } from '@/features/profile/ProfileForm';
import { SAFETY_COPY } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';
import { getMyProfile, isModerator } from '@/services/profile.service';

export const metadata: Metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

const LINKS = [
  {
    href: '/profile/privacy',
    label: 'Privacy & location',
    detail: 'Control what is shared and with whom',
  },
  { href: '/profile/contacts', label: 'Trusted contacts', detail: 'Who to alert if something goes wrong' },
  { href: '/profile/blocked', label: 'Blocked people', detail: 'Manage who cannot contact you' },
  { href: '/legal/privacy', label: 'How we handle your location', detail: 'The full explanation' },
];

export default async function ProfilePage() {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);
  if (!profile) redirect('/sign-in');

  return (
    <div className="space-y-4">
      <AppHeader title="Profile" />

      <Card>
        <div className="flex items-center gap-4">
          <UserAvatar name={profile.display_name} avatarUrl={profile.avatar_url} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{profile.display_name}</h2>
            <p className="truncate text-sm text-secondary">{profile.email}</p>
            <p className="mt-0.5 text-xs text-secondary">
              {profile.verification_status === 'unverified'
                ? 'Email not confirmed'
                : profile.verification_status === 'fully_verified'
                  ? 'Email and phone confirmed'
                  : profile.verification_status === 'phone_verified'
                    ? 'Phone confirmed'
                    : 'Email confirmed'}
            </p>
          </div>
        </div>
        <InlineNotice tone="info">
          Other members only ever see your display name, avatar and area — never your email or phone
          number.
        </InlineNotice>
      </Card>

      <ProfileForm profile={profile} />

      <Card>
        <CardHeader title="Settings" />
        <ul className="divide-y divide-[color:var(--border-subtle)]">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="flex min-h-14 items-center justify-between gap-3 py-1">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{link.label}</span>
                  <span className="block truncate text-xs text-secondary">{link.detail}</span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-secondary">
                  ›
                </span>
              </Link>
            </li>
          ))}
          {isModerator(profile) ? (
            <li>
              <Link href="/admin" className="flex min-h-14 items-center justify-between gap-3 py-1">
                <span>
                  <span className="block text-sm font-medium">Admin dashboard</span>
                  <span className="block text-xs text-secondary">Moderation and reports</span>
                </span>
                <span aria-hidden="true" className="text-secondary">
                  ›
                </span>
              </Link>
            </li>
          ) : null}
        </ul>
      </Card>

      <Card>
        <p className="text-xs leading-relaxed text-secondary">{SAFETY_COPY.notEmergencyServices}</p>
        <p className="mt-2 text-xs leading-relaxed text-secondary">{SAFETY_COPY.noGuarantee}</p>
      </Card>

      <form action="/auth/sign-out" method="post">
        <button
          type="submit"
          className="surface min-h-12 w-full rounded-xl border border-subtle font-semibold"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
