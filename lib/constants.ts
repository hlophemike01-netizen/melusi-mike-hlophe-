/**
 * Product-level constants and the user-facing wording that carries the safety
 * and privacy promises. Keeping the copy here means a reviewer can audit every
 * claim the product makes in one place.
 */

import type {
  ActivityType,
  ActivityVisibility,
  ContactPermissionLevel,
  ReportCategory,
} from '@/types/database';

/**
 * Standing disclaimers. These must appear wherever the relevant action is
 * offered and must not be softened.
 */
export const SAFETY_COPY = {
  notEmergencyServices:
    'Mwhite SafeCircle does not replace emergency services. In an emergency, call your local emergency number.',
  locationOptional: 'Location sharing is optional. It stays off until you turn it on.',
  onlyAuthorised: 'Only people you authorize can see your precise location.',
  noGuarantee:
    'Mwhite SafeCircle helps you share your plans with people you trust. It cannot guarantee your safety.',
  backgroundLimitation:
    'Location updates pause when this app is closed or your screen is locked. Web browsers do not allow continuous background location.',
  contactsAlerted:
    'Your trusted contacts will be alerted in the app and can open your share link. Emergency services are not contacted.',
} as const;

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  running: 'Running',
  walking: 'Walking',
  cycling: 'Cycling',
  travelling: 'Travelling',
  group_activity: 'Group activity',
  other: 'Other',
};

export const ACTIVITY_TYPE_ICONS: Record<ActivityType, string> = {
  running: '🏃',
  walking: '🚶',
  cycling: '🚴',
  travelling: '🚗',
  group_activity: '👥',
  other: '📍',
};

/** Plural nouns used by the community map counts ("14 runners nearby"). */
export const ACTIVITY_TYPE_PEOPLE: Record<ActivityType, string> = {
  running: 'runners',
  walking: 'walkers',
  cycling: 'cyclists',
  travelling: 'travellers',
  group_activity: 'group members',
  other: 'people',
};

export interface VisibilityOption {
  value: ActivityVisibility;
  label: string;
  summary: string;
  /** Spelled out in full on the start-activity screen before anything is shared. */
  detail: string;
  sharesPreciseLocation: boolean;
}

export const VISIBILITY_OPTIONS: VisibilityOption[] = [
  {
    value: 'private',
    label: 'Private',
    summary: 'Nobody can see your location',
    detail:
      'Your location is recorded only for your own check-in timer and is deleted when the activity ends. Nobody else can see it — not other members, not Mwhite SafeCircle administrators.',
    sharesPreciseLocation: false,
  },
  {
    value: 'trusted_contacts',
    label: 'Trusted contacts',
    summary: 'Chosen contacts see where you are',
    detail:
      'Only the trusted contacts you pick can see your precise location, and only until this activity ends or you turn sharing off. You can revoke access at any time.',
    sharesPreciseLocation: true,
  },
  {
    value: 'group',
    label: 'Group',
    summary: 'Approved group members see where you are',
    detail:
      'Approved members of the group you choose can see your precise location while this activity is running. People with a pending request cannot, and access ends when the activity does.',
    sharesPreciseLocation: true,
  },
  {
    value: 'nearby',
    label: 'Community count',
    summary: 'Adds +1 to a nearby count — no location shared',
    detail:
      'You are added to an approximate area count, like "14 runners nearby". Your position is rounded to about a 1km square and grouped with others. No one receives your coordinates, and areas with fewer than three people are hidden entirely.',
    sharesPreciseLocation: false,
  },
];

export const CONTACT_PERMISSION_OPTIONS: Array<{
  value: ContactPermissionLevel;
  label: string;
  detail: string;
}> = [
  {
    value: 'emergency_only',
    label: 'Emergency only',
    detail: 'They receive your location only if you activate emergency mode or miss a check-in.',
  },
  {
    value: 'activity_only',
    label: 'Activities you share',
    detail: 'They receive your location during activities where you select them.',
  },
  {
    value: 'always_when_enabled',
    label: 'Activities and emergencies',
    detail: 'Both of the above. They still only see your location during an active session.',
  },
];

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  harassment: 'Harassment',
  threatening_behaviour: 'Threatening behaviour',
  fake_profile: 'Fake profile',
  abuse: 'Abuse',
  spam: 'Spam',
  suspicious_behaviour: 'Suspicious behaviour',
  other: 'Something else',
};

export const CHECK_IN_PRESETS = [15, 30, 60] as const;

export const ACTIVITY_DURATION_PRESETS = [30, 60, 90, 120] as const;

/** How often the browser pushes a new point while an activity runs. */
export const LOCATION_UPDATE_INTERVAL_MS = 30_000;

/** How long after the last update a community map cell goes stale. Matches SQL. */
export const DENSITY_STALE_AFTER_MINUTES = 30;
