/**
 * Tests for the product's safety and privacy promises as they appear in the UI.
 *
 * These are behavioural, not cosmetic. "Never imply the app contacted emergency
 * services" is a product rule with real consequences, so it gets a test that
 * fails if someone softens the wording.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafetyStatus, describeStatus } from '@/features/dashboard/SafetyStatus';
import { CommunityActivityCard } from '@/features/dashboard/CommunityActivityCard';
import { SAFETY_COPY, VISIBILITY_OPTIONS } from '@/lib/constants';
import type { ActivityRow, EmergencyEventRow, ProfileRow } from '@/types/database';

const profile = {
  id: 'user-1',
  display_name: 'Alice',
  email: 'alice@example.test',
  phone: null,
  avatar_url: null,
  approximate_area: null,
  verification_status: 'email_verified',
  role: 'user',
  account_status: 'active',
  location_sharing_enabled: false,
  discoverable_in_groups: true,
  default_activity_visibility: 'private',
  suspended_at: null,
  suspended_reason: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} satisfies ProfileRow;

function makeActivity(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: 'activity-1',
    user_id: 'user-1',
    activity_type: 'running',
    visibility: 'private',
    status: 'active',
    group_id: null,
    title: null,
    destination: null,
    start_time: '2026-01-01T00:00:00Z',
    expected_end_time: '2026-01-01T01:00:00Z',
    ended_at: null,
    contributes_to_density: false,
    approx_location_updated_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('standing safety disclaimers', () => {
  it('states plainly that SafeCircle does not replace emergency services', () => {
    expect(SAFETY_COPY.notEmergencyServices).toMatch(/does not replace emergency services/i);
  });

  it('never promises safety', () => {
    const allCopy = Object.values(SAFETY_COPY).join(' ').toLowerCase();
    for (const overclaim of ['guarantees your safety', 'keeps you safe', 'will keep you safe']) {
      expect(allCopy).not.toContain(overclaim);
    }
  });

  it('is honest about the browser background-location limit', () => {
    expect(SAFETY_COPY.backgroundLimitation).toMatch(/pause|background/i);
  });

  it('says contacts are alerted, not emergency services', () => {
    expect(SAFETY_COPY.contactsAlerted).toMatch(/emergency services are not contacted/i);
  });
});

describe('visibility options', () => {
  it('marks exactly the two modes that release a precise location', () => {
    const sharing = VISIBILITY_OPTIONS.filter((option) => option.sharesPreciseLocation).map(
      (option) => option.value,
    );
    expect(sharing.sort()).toEqual(['group', 'trusted_contacts']);
  });

  it("does not describe 'nearby' as sharing a location", () => {
    const nearby = VISIBILITY_OPTIONS.find((option) => option.value === 'nearby');
    expect(nearby?.sharesPreciseLocation).toBe(false);
    expect(nearby?.detail).toMatch(/no one receives your coordinates/i);
  });

  it('gives every option a full explanation, so no choice is made blind', () => {
    for (const option of VISIBILITY_OPTIONS) {
      expect(option.detail.length).toBeGreaterThan(60);
    }
  });
});

describe('SafetyStatus', () => {
  it('says nothing is shared when no activity is running', () => {
    render(<SafetyStatus profile={profile} activity={null} emergency={null} />);
    expect(screen.getByText(/nothing is being shared/i)).toBeInTheDocument();
  });

  it('names who can see a trusted-contacts activity', () => {
    render(
      <SafetyStatus
        profile={{ ...profile, location_sharing_enabled: true }}
        activity={makeActivity({ visibility: 'trusted_contacts' })}
        emergency={null}
      />,
    );
    expect(screen.getByText(/trusted contacts can see your location/i)).toBeInTheDocument();
  });

  it('states that a private activity is visible to nobody', () => {
    const status = describeStatus(profile, makeActivity({ visibility: 'private' }), null);
    expect(status.detail).toMatch(/nobody can see your location/i);
  });

  it('never implies emergency services were called during an emergency', () => {
    const emergency = {
      id: 'event-1',
      user_id: 'user-1',
      status: 'active',
      location_available: true,
      contacts_notified_count: 2,
      emergency_services_contacted: false,
    } as EmergencyEventRow;

    render(
      <SafetyStatus
        profile={{ ...profile, location_sharing_enabled: true }}
        activity={null}
        emergency={emergency}
      />,
    );

    expect(screen.getByText(/emergency services have not been contacted/i)).toBeInTheDocument();
  });
});

describe('CommunityActivityCard', () => {
  it('renders counts, never names or positions', () => {
    render(
      <CommunityActivityCard
        summary={[
          { activity_type: 'running', activity_count: 14 },
          { activity_type: 'walking', activity_count: 8 },
        ]}
        loading={false}
        locationAvailable
        activeGroups={3}
      />,
    );

    expect(screen.getByText(/runners nearby/i)).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it('explains that individuals cannot be seen', () => {
    render(
      <CommunityActivityCard summary={[]} loading={false} locationAvailable activeGroups={0} />,
    );
    expect(screen.getByText(/no one .* can see where any individual is/i)).toBeInTheDocument();
  });

  it('explains suppression rather than showing an empty area silently', () => {
    render(
      <CommunityActivityCard summary={[]} loading={false} locationAvailable activeGroups={0} />,
    );
    expect(screen.getByText(/fewer than 3/i)).toBeInTheDocument();
  });
});
