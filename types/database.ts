/**
 * Database types.
 *
 * Hand-maintained to mirror `supabase/migrations`. Regenerate with:
 *   npx supabase gen types typescript --project-id <id> > types/database.ts
 * and re-apply the `Json` alias at the top if you do.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = 'user' | 'moderator' | 'admin';
export type AccountStatus = 'active' | 'suspended' | 'deleted';
export type VerificationStatus = 'unverified' | 'email_verified' | 'phone_verified' | 'fully_verified';

export type ActivityType = 'running' | 'walking' | 'cycling' | 'travelling' | 'group_activity' | 'other';
export type ActivityVisibility = 'private' | 'nearby' | 'group' | 'trusted_contacts';
export type ActivityStatus = 'active' | 'completed' | 'cancelled' | 'overdue' | 'emergency';

export type GroupVisibility = 'public' | 'private' | 'invite_only';
export type GroupStatus = 'active' | 'archived' | 'suspended';
export type GroupMemberRole = 'owner' | 'admin' | 'member';
export type GroupMemberStatus = 'pending' | 'approved' | 'rejected' | 'removed' | 'left';

export type ContactPermissionLevel = 'emergency_only' | 'activity_only' | 'always_when_enabled';
export type ShareReason = 'activity' | 'emergency' | 'check_in_missed';
export type CheckInStatus = 'scheduled' | 'responded_safe' | 'responded_help' | 'missed' | 'cancelled';
export type EmergencyStatus = 'active' | 'resolved_safe' | 'resolved_false_alarm' | 'cancelled';

export type ReportCategory =
  | 'harassment'
  | 'threatening_behaviour'
  | 'fake_profile'
  | 'abuse'
  | 'spam'
  | 'suspicious_behaviour'
  | 'other';
export type ReportStatus = 'open' | 'under_review' | 'actioned' | 'dismissed';
export type ReportSubjectType = 'user' | 'group' | 'activity';

export interface ProfileRow {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  approximate_area: string | null;
  verification_status: VerificationStatus;
  role: AppRole;
  account_status: AccountStatus;
  location_sharing_enabled: boolean;
  discoverable_in_groups: boolean;
  default_activity_visibility: ActivityVisibility;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** The safe projection other users may read. No email, phone or role. */
export interface PublicProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  verification_status: VerificationStatus;
  approximate_area: string | null;
  created_at: string;
}

export interface ActivityRow {
  id: string;
  user_id: string;
  activity_type: ActivityType;
  visibility: ActivityVisibility;
  status: ActivityStatus;
  group_id: string | null;
  title: string | null;
  destination: string | null;
  start_time: string;
  expected_end_time: string;
  ended_at: string | null;
  contributes_to_density: boolean;
  approx_location_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  activity_type: ActivityType;
  approximate_area: string | null;
  owner_id: string;
  visibility: GroupVisibility;
  status: GroupStatus;
  requires_approval: boolean;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface GroupMemberRow {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupMemberRole;
  status: GroupMemberStatus;
  invited_by: string | null;
  approved_by: string | null;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmergencyContactRow {
  id: string;
  owner_id: string;
  name: string;
  phone: string;
  relationship: string | null;
  permission_level: ContactPermissionLevel;
  contact_user_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TrustedLocationShareRow {
  id: string;
  owner_id: string;
  contact_id: string | null;
  activity_id: string | null;
  emergency_event_id: string | null;
  recipient_user_id: string | null;
  reason: ShareReason;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
  created_at: string;
}

export interface CheckInRow {
  id: string;
  activity_id: string;
  user_id: string;
  interval_minutes: number;
  due_at: string;
  responded_at: string | null;
  status: CheckInStatus;
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmergencyEventRow {
  id: string;
  user_id: string;
  activity_id: string | null;
  status: EmergencyStatus;
  triggered_location_accuracy: number | null;
  location_available: boolean;
  note: string | null;
  contacts_notified_count: number;
  emergency_services_contacted: boolean;
  triggered_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportRow {
  id: string;
  reporter_id: string;
  subject_type: ReportSubjectType;
  reported_user_id: string | null;
  reported_group_id: string | null;
  reported_activity_id: string | null;
  category: ReportCategory;
  description: string;
  status: ReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserBlockRow {
  id: string;
  blocker_id: string;
  blocked_id: string;
  reason: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: number;
  actor_id: string | null;
  actor_role: AppRole | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  target_user_id: string | null;
  metadata: Json;
  created_at: string;
}

/* -------------------------------------------------------------------------
 * RPC return shapes
 * ---------------------------------------------------------------------- */

export interface DensityCell {
  cell_lng: number;
  cell_lat: number;
  activity_type: ActivityType;
  activity_count: number;
}

export interface ActivitySummaryRow {
  activity_type: ActivityType;
  activity_count: number;
}

export interface LatestLocationRow {
  activity_id: string;
  lng: number;
  lat: number;
  accuracy: number | null;
  recorded_at: string;
}

export interface OpenedShareRow {
  share_id: string;
  contact_id: string;
  contact_name: string;
  recipient_user_id: string | null;
  /** Present only for contacts without a Mwhite SafeCircle account. Shown once. */
  share_token: string | null;
  expires_at: string;
}

export interface SharedLocationRow {
  sharer_name: string;
  reason: ShareReason;
  lng: number | null;
  lat: number | null;
  accuracy: number | null;
  recorded_at: string | null;
  expires_at: string;
  emergency_active: boolean;
}

export interface AdminMetricsRow {
  total_users: number;
  active_users: number;
  suspended_users: number;
  active_activities: number;
  total_groups: number;
  active_groups: number;
  open_reports: number;
  total_reports: number;
  active_emergencies: number;
  emergencies_last_7d: number;
}

export interface AdminEmergencyRow {
  id: string;
  user_id: string;
  display_name: string;
  status: EmergencyStatus;
  location_available: boolean;
  contacts_notified_count: number;
  triggered_at: string;
  resolved_at: string | null;
}

export interface AdminReportRow {
  id: string;
  category: ReportCategory;
  subject_type: ReportSubjectType;
  status: ReportStatus;
  description: string;
  reporter_name: string;
  reported_name: string | null;
  reported_user_id: string | null;
  reported_group_id: string | null;
  created_at: string;
  reviewed_at: string | null;
}
