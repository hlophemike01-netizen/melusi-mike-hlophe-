import { AppError, handleServiceError } from '@/lib/errors';
import type { Db } from '@/services/types';
import type { CheckInRow } from '@/types/database';

/** The outstanding "Are you safe?" prompt for an activity, if any. */
export async function getScheduledCheckIn(db: Db, activityId: string): Promise<CheckInRow | null> {
  const { data, error } = await db
    .from('check_ins')
    .select('*')
    .eq('activity_id', activityId)
    .eq('status', 'scheduled')
    .maybeSingle();

  if (error) throw handleServiceError('getScheduledCheckIn', error);
  return (data as CheckInRow | null) ?? null;
}

export async function scheduleCheckIn(
  db: Db,
  activityId: string,
  intervalMinutes: number,
): Promise<CheckInRow> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new AppError('unauthenticated', 'Please sign in to continue.', 401);

  // Only one prompt may be outstanding per activity (unique index), so replace
  // rather than stack.
  await db
    .from('check_ins')
    .update({ status: 'cancelled' })
    .eq('activity_id', activityId)
    .eq('status', 'scheduled');

  const { data, error } = await db
    .from('check_ins')
    .insert({
      activity_id: activityId,
      user_id: auth.user.id,
      interval_minutes: intervalMinutes,
      due_at: new Date(Date.now() + intervalMinutes * 60_000).toISOString(),
    })
    .select('*')
    .single();

  if (error) throw handleServiceError('scheduleCheckIn', error);
  return data as CheckInRow;
}

/**
 * "I'm safe" — clears the prompt, and returns the activity to `active` if a
 * missed check-in had already flipped it to `overdue`.
 */
export async function respondSafe(
  db: Db,
  checkInId: string,
  nextIntervalMinutes?: number,
): Promise<CheckInRow | null> {
  const { data: updated, error } = await db
    .from('check_ins')
    .update({ status: 'responded_safe', responded_at: new Date().toISOString() })
    .eq('id', checkInId)
    .select('*')
    .single();

  if (error) throw handleServiceError('respondSafe', error);
  const checkIn = updated as CheckInRow;

  await db
    .from('activities')
    .update({ status: 'active' })
    .eq('id', checkIn.activity_id)
    .eq('status', 'overdue');

  if (nextIntervalMinutes) {
    return scheduleCheckIn(db, checkIn.activity_id, nextIntervalMinutes);
  }
  return null;
}

/**
 * "I need help" — records the response and hands control to the emergency
 * flow. This function does not itself notify anyone; `emergency.service`
 * does, so there is exactly one place where an alert is raised.
 */
export async function respondNeedHelp(db: Db, checkInId: string): Promise<CheckInRow> {
  const { data, error } = await db
    .from('check_ins')
    .update({ status: 'responded_help', responded_at: new Date().toISOString() })
    .eq('id', checkInId)
    .select('*')
    .single();

  if (error) throw handleServiceError('respondNeedHelp', error);
  return data as CheckInRow;
}

export async function cancelCheckIn(db: Db, checkInId: string): Promise<void> {
  const { error } = await db.from('check_ins').update({ status: 'cancelled' }).eq('id', checkInId);
  if (error) throw handleServiceError('cancelCheckIn', error);
}

export async function listRecentCheckIns(db: Db, limit = 10): Promise<CheckInRow[]> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await db
    .from('check_ins')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('due_at', { ascending: false })
    .limit(Math.min(limit, 50));

  if (error) throw handleServiceError('listRecentCheckIns', error);
  return (data ?? []) as CheckInRow[];
}
