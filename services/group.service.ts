import { AppError, handleServiceError } from '@/lib/errors';
import type { CreateGroupInput } from '@/lib/validation';
import type { Db } from '@/services/types';
import type { GroupMemberRow, GroupRow, PublicProfileRow } from '@/types/database';

export interface GroupWithMembership extends GroupRow {
  myMembership: GroupMemberRow | null;
}

export interface GroupMemberWithProfile extends GroupMemberRow {
  profile: PublicProfileRow | null;
}

export async function createGroup(db: Db, input: CreateGroupInput): Promise<GroupRow> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new AppError('unauthenticated', 'Please sign in to continue.', 401);

  const { data, error } = await db
    .from('groups')
    .insert({
      name: input.name,
      description: input.description || null,
      activity_type: input.activityType,
      approximate_area: input.approximateArea || null,
      owner_id: auth.user.id,
      visibility: input.visibility,
      requires_approval: input.requiresApproval,
    })
    .select('*')
    .single();

  if (error) throw handleServiceError('createGroup', error);
  return data as GroupRow;
}

/** Groups the caller belongs to (approved or pending). */
export async function listMyGroups(db: Db): Promise<GroupWithMembership[]> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];

  const { data: memberships, error: membershipError } = await db
    .from('group_members')
    .select('*')
    .eq('user_id', auth.user.id)
    .in('status', ['approved', 'pending']);

  if (membershipError) throw handleServiceError('listMyGroups.memberships', membershipError);

  const rows = (memberships ?? []) as GroupMemberRow[];
  if (rows.length === 0) return [];

  const { data: groups, error: groupError } = await db
    .from('groups')
    .select('*')
    .in('id', rows.map((m) => m.group_id))
    .order('name');

  if (groupError) throw handleServiceError('listMyGroups.groups', groupError);

  return ((groups ?? []) as GroupRow[]).map((group) => ({
    ...group,
    myMembership: rows.find((m) => m.group_id === group.id) ?? null,
  }));
}

/**
 * Public groups the caller could join. RLS already hides private groups and
 * groups whose owner is blocked, so this is a plain query.
 */
export async function discoverGroups(db: Db, search?: string, limit = 25): Promise<GroupRow[]> {
  let query = db
    .from('groups')
    .select('*')
    .eq('status', 'active')
    .eq('visibility', 'public')
    .order('member_count', { ascending: false })
    .limit(Math.min(limit, 50));

  if (search && search.trim().length >= 2) {
    // `.ilike` on a parameterised value — PostgREST sends this as a bound
    // parameter, so the wildcards cannot break out of the pattern.
    query = query.ilike('name', `%${search.trim().replace(/[%_]/g, '')}%`);
  }

  const { data, error } = await query;
  if (error) throw handleServiceError('discoverGroups', error);
  return (data ?? []) as GroupRow[];
}

export async function getGroup(db: Db, groupId: string): Promise<GroupRow | null> {
  const { data, error } = await db.from('groups').select('*').eq('id', groupId).maybeSingle();
  if (error) throw handleServiceError('getGroup', error);
  return (data as GroupRow | null) ?? null;
}

export async function getMyMembership(db: Db, groupId: string): Promise<GroupMemberRow | null> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await db
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) throw handleServiceError('getMyMembership', error);
  return (data as GroupMemberRow | null) ?? null;
}

/**
 * Member list with display names. Two queries rather than a join, because the
 * profile side must come from `public_profiles` — joining `profiles` would
 * pull columns that view exists to withhold.
 */
export async function listGroupMembers(
  db: Db,
  groupId: string,
): Promise<GroupMemberWithProfile[]> {
  const { data: members, error } = await db
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .in('status', ['approved', 'pending'])
    .order('role')
    .order('joined_at', { nullsFirst: false });

  if (error) throw handleServiceError('listGroupMembers', error);

  const rows = (members ?? []) as GroupMemberRow[];
  if (rows.length === 0) return [];

  const { data: profiles } = await db
    .from('public_profiles')
    .select('*')
    .in('id', rows.map((m) => m.user_id));

  const byId = new Map(((profiles ?? []) as PublicProfileRow[]).map((p) => [p.id, p]));

  return rows.map((member) => ({ ...member, profile: byId.get(member.user_id) ?? null }));
}

/**
 * Requests to join. The resulting status is decided by the database trigger —
 * `pending` for groups that require approval — not by anything sent from here.
 */
export async function joinGroup(db: Db, groupId: string): Promise<GroupMemberRow> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new AppError('unauthenticated', 'Please sign in to continue.', 401);

  const { data, error } = await db
    .from('group_members')
    .insert({ group_id: groupId, user_id: auth.user.id })
    .select('*')
    .single();

  if (error) throw handleServiceError('joinGroup', error);
  return data as GroupMemberRow;
}

export async function leaveGroup(db: Db, groupId: string): Promise<void> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new AppError('unauthenticated', 'Please sign in to continue.', 401);

  const { error } = await db
    .from('group_members')
    .update({ status: 'left' })
    .eq('group_id', groupId)
    .eq('user_id', auth.user.id);

  if (error) throw handleServiceError('leaveGroup', error);
}

export async function reviewJoinRequest(
  db: Db,
  memberId: string,
  decision: 'approved' | 'rejected',
): Promise<void> {
  const { error } = await db.from('group_members').update({ status: decision }).eq('id', memberId);
  if (error) throw handleServiceError('reviewJoinRequest', error);
}

export async function removeMember(db: Db, memberId: string): Promise<void> {
  const { error } = await db.from('group_members').update({ status: 'removed' }).eq('id', memberId);
  if (error) throw handleServiceError('removeMember', error);
}

export async function setMemberRole(
  db: Db,
  memberId: string,
  role: 'admin' | 'member',
): Promise<void> {
  const { error } = await db.from('group_members').update({ role }).eq('id', memberId);
  if (error) throw handleServiceError('setMemberRole', error);
}
