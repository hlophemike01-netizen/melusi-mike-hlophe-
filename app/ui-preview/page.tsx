import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CommunityActivityCard } from '@/features/dashboard/CommunityActivityCard';
import { SafetyStatus } from '@/features/dashboard/SafetyStatus';
import { PreviewShareLinks } from './PreviewShareLinks';
import type { ActivityRow, EmergencyEventRow, ProfileRow } from '@/types/database';

/**
 * A visual harness, not the product.
 *
 * The signed-in screens are driven entirely by Supabase, so there is no way to
 * look at them without a backend. This route renders the same components
 * against fixed props so the interface can be reviewed. Nothing here is
 * connected to anything: no session, no database, no location.
 *
 * It is excluded from search engines and every component on it is one that
 * takes plain props — nothing that would fire a request on mount.
 */
export const metadata: Metadata = {
  title: 'Interface preview',
  robots: { index: false, follow: false },
};

const now = Date.now();
const iso = (offsetMinutes: number) => new Date(now + offsetMinutes * 60_000).toISOString();

const profile = (overrides: Partial<ProfileRow>): ProfileRow => ({
  id: 'preview',
  display_name: 'Thandi',
  email: null,
  phone: null,
  avatar_url: null,
  approximate_area: 'Braamfontein',
  verification_status: 'email_verified',
  role: 'user',
  account_status: 'active',
  location_sharing_enabled: false,
  discoverable_in_groups: false,
  default_activity_visibility: 'private',
  suspended_at: null,
  suspended_reason: null,
  created_at: iso(-10_000),
  updated_at: iso(-10_000),
  ...overrides,
});

const activity = (overrides: Partial<ActivityRow>): ActivityRow => ({
  id: 'preview-activity',
  user_id: 'preview',
  activity_type: 'walking',
  visibility: 'trusted_contacts',
  status: 'active',
  group_id: null,
  title: 'Walk home from campus',
  destination: 'Home via Jorissen Street',
  start_time: iso(-18),
  expected_end_time: iso(22),
  ended_at: null,
  contributes_to_density: true,
  approx_location_updated_at: iso(-1),
  created_at: iso(-18),
  updated_at: iso(-1),
  ...overrides,
});

const emergency: EmergencyEventRow = {
  id: 'preview-emergency',
  user_id: 'preview',
  activity_id: 'preview-activity',
  status: 'active',
  triggered_location_accuracy: 14,
  location_available: true,
  note: null,
  contacts_notified_count: 2,
  // The honest field. Nothing in this product contacts emergency services.
  emergency_services_contacted: false,
  triggered_at: iso(-3),
  resolved_at: null,
  resolved_by: null,
  resolution_note: null,
  created_at: iso(-3),
  updated_at: iso(-3),
};

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mb-3 mt-0.5 text-sm text-secondary">{note}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function UiPreviewPage() {
  // Never reachable in production. A page of convincing-looking fixture data on
  // a safety product is a liability: somebody would read it as live.
  if (process.env.NODE_ENV === 'production') notFound();


  return (
    <main className="mx-auto max-w-md px-4 py-6 pb-16">
      <div className="rounded-xl border-2 border-caution-400 bg-caution-50 p-3 text-sm dark:bg-caution-950/40">
        <p className="font-bold">Interface preview — not a working app</p>
        <p className="mt-1">
          Every value below is fixed text written into this page. There is no account, no database
          and no location behind any of it. Buttons that would normally save something do nothing.
        </p>
      </div>

      <Section title="Safety status" note="The card at the top of the home screen, in each of its states.">
        <SafetyStatus profile={profile({})} activity={null} emergency={null} />
        <SafetyStatus
          profile={profile({ location_sharing_enabled: true })}
          activity={null}
          emergency={null}
        />
        <SafetyStatus
          profile={profile({ location_sharing_enabled: true })}
          activity={activity({})}
          emergency={null}
        />
        <SafetyStatus
          profile={profile({ location_sharing_enabled: true })}
          activity={activity({ status: 'overdue', expected_end_time: iso(-9) })}
          emergency={null}
        />
        <SafetyStatus
          profile={profile({ location_sharing_enabled: true })}
          activity={activity({ status: 'emergency' })}
          emergency={emergency}
        />
      </Section>

      <Section
        title="Nearby right now"
        note="Counts only. Below the k-anonymity threshold of 3 an area reports zero rather than one."
      >
        <CommunityActivityCard
          summary={[
            { activity_type: 'running', activity_count: 7 },
            { activity_type: 'walking', activity_count: 4 },
            { activity_type: 'cycling', activity_count: 3 },
          ]}
          loading={false}
          locationAvailable
          activeGroups={2}
        />
        <CommunityActivityCard summary={[]} loading={false} locationAvailable={false} activeGroups={0} />
      </Section>

      <Section
        title="Sending a share link"
        note="Shown once when an activity starts. The buttons open WhatsApp, the share sheet or SMS with the text prefilled — the app never sends anything itself."
      >
        <PreviewShareLinks />
      </Section>
    </main>
  );
}
