import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { AlertSettings } from '@/features/notifications/AlertSettings';
import { PrivacySettings } from '@/features/privacy/PrivacySettings';
import { createClient } from '@/lib/supabase/server';
import { listActiveShares } from '@/services/contacts.service';
import { getMyProfile } from '@/services/profile.service';

export const metadata: Metadata = { title: 'Privacy & location' };
export const dynamic = 'force-dynamic';

export default async function PrivacyPage() {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);
  if (!profile) redirect('/sign-in');

  const shares = await listActiveShares(supabase);

  return (
    <div className="space-y-4">
      <AppHeader title="Privacy & location" backHref="/profile" />
      <PrivacySettings profile={profile} activeShareCount={shares.length} />
      <AlertSettings />
    </div>
  );
}
