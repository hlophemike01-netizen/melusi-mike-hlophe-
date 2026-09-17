import { AppError, handleServiceError } from '@/lib/errors';
import type { ReportInput } from '@/lib/validation';
import type { Db } from '@/services/types';
import type { ReportRow, UserBlockRow } from '@/types/database';

/**
 * Reporting and blocking.
 *
 * Blocking takes effect immediately and bidirectionally: the database trigger
 * revokes any live location share between the two parties the moment the block
 * row lands, so there is no window where a blocked person still has a feed.
 */
export async function submitReport(db: Db, input: ReportInput): Promise<ReportRow> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new AppError('unauthenticated', 'Please sign in to continue.', 401);

  const { data, error } = await db
    .from('reports')
    .insert({
      reporter_id: auth.user.id,
      subject_type: input.subjectType,
      reported_user_id: input.reportedUserId ?? null,
      reported_group_id: input.reportedGroupId ?? null,
      category: input.category,
      description: input.description,
    })
    .select('*')
    .single();

  if (error) throw handleServiceError('submitReport', error);
  return data as ReportRow;
}

export async function listMyReports(db: Db): Promise<ReportRow[]> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await db
    .from('reports')
    .select('*')
    .eq('reporter_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw handleServiceError('listMyReports', error);
  return (data ?? []) as ReportRow[];
}

export async function blockUser(db: Db, userId: string, reason?: string): Promise<UserBlockRow> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new AppError('unauthenticated', 'Please sign in to continue.', 401);

  if (userId === auth.user.id) {
    throw new AppError('validation_failed', 'You cannot block your own account.', 400);
  }

  const { data, error } = await db
    .from('user_blocks')
    .insert({
      blocker_id: auth.user.id,
      blocked_id: userId,
      reason: reason?.slice(0, 500) || null,
    })
    .select('*')
    .single();

  if (error) throw handleServiceError('blockUser', error);
  return data as UserBlockRow;
}

export async function unblockUser(db: Db, userId: string): Promise<void> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new AppError('unauthenticated', 'Please sign in to continue.', 401);

  const { error } = await db
    .from('user_blocks')
    .delete()
    .eq('blocker_id', auth.user.id)
    .eq('blocked_id', userId);

  if (error) throw handleServiceError('unblockUser', error);
}

/** The caller's own block list. Only the blocker ever sees these rows. */
export async function listMyBlocks(db: Db): Promise<UserBlockRow[]> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await db
    .from('user_blocks')
    .select('*')
    .eq('blocker_id', auth.user.id)
    .order('created_at', { ascending: false });

  if (error) throw handleServiceError('listMyBlocks', error);
  return (data ?? []) as UserBlockRow[];
}
