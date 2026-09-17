import { handleServiceError } from '@/lib/errors';
import type { Db } from '@/services/types';
import type {
  AdminEmergencyRow,
  AdminMetricsRow,
  AdminReportRow,
  AuditLogRow,
  GroupRow,
  GroupStatus,
  ReportStatus,
} from '@/types/database';

/**
 * Administrative reads and moderation actions.
 *
 * Every function here calls an RPC that re-checks the admin role server-side.
 * The UI's role check is a convenience; it is not the control. Note what is
 * absent: there is no "list all activities" or "show user location" function,
 * because an administrator is not authorised to see either.
 */
export async function getDashboardMetrics(db: Db): Promise<AdminMetricsRow | null> {
  const { data, error } = await db.rpc('admin_dashboard_metrics');
  if (error) throw handleServiceError('getDashboardMetrics', error);

  const rows = (data ?? []) as AdminMetricsRow[];
  return rows[0] ?? null;
}

/** Emergency oversight without coordinates — the RPC returns no geography. */
export async function listEmergencyOverview(db: Db, limit = 50): Promise<AdminEmergencyRow[]> {
  const { data, error } = await db.rpc('admin_emergency_overview', { p_limit: limit });
  if (error) throw handleServiceError('listEmergencyOverview', error);
  return (data ?? []) as AdminEmergencyRow[];
}

export async function listReportQueue(
  db: Db,
  status?: ReportStatus,
  limit = 50,
): Promise<AdminReportRow[]> {
  const { data, error } = await db.rpc('admin_report_queue', {
    p_status: status ?? null,
    p_limit: limit,
  });

  if (error) throw handleServiceError('listReportQueue', error);
  return (data ?? []) as AdminReportRow[];
}

export async function reviewReport(
  db: Db,
  reportId: string,
  status: Extract<ReportStatus, 'under_review' | 'actioned' | 'dismissed'>,
  note?: string,
): Promise<void> {
  const { error } = await db.rpc('admin_review_report', {
    p_report_id: reportId,
    p_status: status,
    p_note: note ?? null,
  });

  if (error) throw handleServiceError('reviewReport', error);
}

export async function suspendUser(db: Db, userId: string, reason: string): Promise<void> {
  const { error } = await db.rpc('admin_suspend_user', { p_user_id: userId, p_reason: reason });
  if (error) throw handleServiceError('suspendUser', error);
}

export async function restoreUser(db: Db, userId: string): Promise<void> {
  const { error } = await db.rpc('admin_restore_user', { p_user_id: userId });
  if (error) throw handleServiceError('restoreUser', error);
}

export async function setGroupStatus(
  db: Db,
  groupId: string,
  status: GroupStatus,
  reason?: string,
): Promise<void> {
  const { error } = await db.rpc('admin_set_group_status', {
    p_group_id: groupId,
    p_status: status,
    p_reason: reason ?? null,
  });

  if (error) throw handleServiceError('setGroupStatus', error);
}

export async function listGroupsForReview(db: Db, limit = 50): Promise<GroupRow[]> {
  const { data, error } = await db
    .from('groups')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 200));

  if (error) throw handleServiceError('listGroupsForReview', error);
  return (data ?? []) as GroupRow[];
}

export async function listAuditLog(db: Db, limit = 100): Promise<AuditLogRow[]> {
  const { data, error } = await db
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 500));

  if (error) throw handleServiceError('listAuditLog', error);
  return (data ?? []) as AuditLogRow[];
}

/**
 * Writes an audit entry through the SECURITY DEFINER function, which takes the
 * actor from the session rather than the arguments — so it cannot be forged.
 * Metadata must never contain coordinates, tokens or contact details; the
 * database has a CHECK constraint that rejects those keys.
 */
export async function recordAuditEvent(
  db: Db,
  action: string,
  entityType: string,
  entityId?: string | null,
  targetUserId?: string | null,
  metadata: Record<string, string | number | boolean> = {},
): Promise<void> {
  const { error } = await db.rpc('record_audit_event', {
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId ?? null,
    p_target_user_id: targetUserId ?? null,
    p_metadata: metadata,
  });

  if (error) {
    // An audit write failing must not break the user's action, but it must be
    // visible to operators.
    console.error('[safecircle] audit write failed:', error);
  }
}
