import { AppError, handleServiceError } from '@/lib/errors';
import { toWkt, type LatLng } from '@/lib/geo';
import type { StartActivityInput, LocationPointInput } from '@/lib/validation';
import type { Db } from '@/services/types';
import type {
  ActivityRow,
  ActivityStatus,
  CheckInRow,
  LatestLocationRow,
  OpenedShareRow,
} from '@/types/database';

export interface StartActivityResult {
  activity: ActivityRow;
  checkIn: CheckInRow | null;
  /** Link tokens for contacts without a Mwhite SafeCircle account. Shown once. */
  shareLinks: OpenedShareRow[];
}

/**
 * Starts an activity.
 *
 * Order matters: the activity row is created first so the database's consent
 * triggers can reject an unsupported combination BEFORE any share grant or
 * location point exists. If a later step fails, the activity is cancelled
 * rather than left half-configured with a visibility the user did not confirm.
 */
export async function startActivity(
  db: Db,
  input: StartActivityInput,
): Promise<StartActivityResult> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new AppError('unauthenticated', 'Please sign in to continue.', 401);

  const now = new Date();
  const expectedEnd = new Date(now.getTime() + input.durationMinutes * 60_000);

  const { data: created, error } = await db
    .from('activities')
    .insert({
      user_id: auth.user.id,
      activity_type: input.activityType,
      visibility: input.visibility,
      group_id: input.visibility === 'group' ? input.groupId : null,
      title: input.title || null,
      destination: input.destination || null,
      start_time: now.toISOString(),
      expected_end_time: expectedEnd.toISOString(),
      contributes_to_density: input.visibility === 'nearby' ? true : input.contributeToDensity,
    })
    .select('*')
    .single();

  if (error) throw handleServiceError('startActivity', error);
  const activity = created as ActivityRow;

  try {
    let checkIn: CheckInRow | null = null;
    if (input.checkInMinutes) {
      const { data: checkInRow, error: checkInError } = await db
        .from('check_ins')
        .insert({
          activity_id: activity.id,
          user_id: auth.user.id,
          interval_minutes: input.checkInMinutes,
          due_at: new Date(now.getTime() + input.checkInMinutes * 60_000).toISOString(),
        })
        .select('*')
        .single();

      if (checkInError) throw checkInError;
      checkIn = checkInRow as CheckInRow;
    }

    let shareLinks: OpenedShareRow[] = [];
    if (input.visibility === 'trusted_contacts' && input.contactIds?.length) {
      const { data: shares, error: shareError } = await db.rpc('open_trusted_shares', {
        p_activity_id: activity.id,
        p_reason: 'activity',
        p_contact_ids: input.contactIds,
        p_duration_minutes: input.durationMinutes,
      });
      if (shareError) throw shareError;
      shareLinks = (shares ?? []) as OpenedShareRow[];
    }

    return { activity, checkIn, shareLinks };
  } catch (cause) {
    // Roll the activity back so the user is never left "live" under a sharing
    // mode whose setup did not complete.
    await db.rpc('end_activity', { act_id: activity.id, new_status: 'cancelled' });
    throw handleServiceError('startActivity.configure', cause);
  }
}

/** The caller's currently running activity, if any. */
export async function getActiveActivity(db: Db): Promise<ActivityRow | null> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await db
    .from('activities')
    .select('*')
    .eq('user_id', auth.user.id)
    .in('status', ['active', 'overdue', 'emergency'])
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw handleServiceError('getActiveActivity', error);
  return (data as ActivityRow | null) ?? null;
}

export async function listMyActivities(db: Db, limit = 20): Promise<ActivityRow[]> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await db
    .from('activities')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('start_time', { ascending: false })
    .limit(Math.min(limit, 100));

  if (error) throw handleServiceError('listMyActivities', error);
  return (data ?? []) as ActivityRow[];
}

/**
 * Activities shared with the caller — group activities they can see and
 * trusted shares pointed at them. RLS decides what comes back; this function
 * does not filter, because a filter here would be a false sense of security.
 */
export async function listSharedWithMe(db: Db): Promise<ActivityRow[]> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await db
    .from('activities')
    .select('*')
    .neq('user_id', auth.user.id)
    .in('status', ['active', 'overdue', 'emergency'])
    .order('start_time', { ascending: false })
    .limit(50);

  if (error) throw handleServiceError('listSharedWithMe', error);
  return (data ?? []) as ActivityRow[];
}

/** Ends an activity, revoking shares and deleting points in one transaction. */
export async function endActivity(
  db: Db,
  activityId: string,
  status: Extract<ActivityStatus, 'completed' | 'cancelled'> = 'completed',
): Promise<void> {
  const { error } = await db.rpc('end_activity', { act_id: activityId, new_status: status });
  if (error) throw handleServiceError('endActivity', error);
}

/**
 * Appends a location point.
 *
 * The client supplies coordinates only. `user_id` and `expires_at` are derived
 * and clamped by the database trigger, so a tampered request cannot extend
 * retention or attribute a point to someone else.
 */
export async function recordLocation(
  db: Db,
  activityId: string,
  point: LocationPointInput,
): Promise<void> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new AppError('unauthenticated', 'Please sign in to continue.', 401);

  const coordinate: LatLng = { latitude: point.latitude, longitude: point.longitude };

  const { error } = await db.from('activity_locations').insert({
    activity_id: activityId,
    user_id: auth.user.id,
    location: toWkt(coordinate),
    accuracy: point.accuracy ?? null,
    heading: point.heading ?? null,
    speed: point.speed ?? null,
  });

  if (error) throw handleServiceError('recordLocation', error);
}

/**
 * The most recent authorised position for an activity — one point, never a
 * trail. The RPC re-checks authorisation server-side.
 */
export async function getLatestLocation(
  db: Db,
  activityId: string,
): Promise<LatestLocationRow | null> {
  const { data, error } = await db.rpc('latest_activity_location', { act_id: activityId });
  if (error) throw handleServiceError('getLatestLocation', error);

  const rows = (data ?? []) as LatestLocationRow[];
  return rows[0] ?? null;
}

/** Deletes every location point the caller has ever recorded. */
export async function eraseMyLocationHistory(db: Db): Promise<number> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new AppError('unauthenticated', 'Please sign in to continue.', 401);

  const { data, error } = await db
    .from('activity_locations')
    .delete()
    .eq('user_id', auth.user.id)
    .select('id');

  if (error) throw handleServiceError('eraseMyLocationHistory', error);
  return (data ?? []).length;
}
