import { AppError, handleServiceError } from '@/lib/errors';
import type { TrustedContactInput } from '@/lib/validation';
import type { Db } from '@/services/types';
import type {
  EmergencyContactRow,
  OpenedShareRow,
  TrustedLocationShareRow,
} from '@/types/database';

/**
 * Trusted contacts.
 *
 * A contact row belongs to its owner and nobody else — not the contact, not an
 * administrator. The contact is never told they were added, which matters when
 * the relationship is the thing someone is trying to keep private.
 */
export async function listContacts(db: Db): Promise<EmergencyContactRow[]> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await db
    .from('emergency_contacts')
    .select('*')
    .eq('owner_id', auth.user.id)
    .order('created_at');

  if (error) throw handleServiceError('listContacts', error);
  return (data ?? []) as EmergencyContactRow[];
}

export async function addContact(
  db: Db,
  input: TrustedContactInput,
): Promise<EmergencyContactRow> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new AppError('unauthenticated', 'Please sign in to continue.', 401);

  const { data, error } = await db
    .from('emergency_contacts')
    .insert({
      owner_id: auth.user.id,
      name: input.name,
      phone: input.phone,
      relationship: input.relationship || null,
      permission_level: input.permissionLevel,
    })
    .select('*')
    .single();

  if (error) throw handleServiceError('addContact', error);
  return data as EmergencyContactRow;
}

export async function updateContact(
  db: Db,
  contactId: string,
  input: TrustedContactInput,
): Promise<EmergencyContactRow> {
  const { data, error } = await db
    .from('emergency_contacts')
    .update({
      name: input.name,
      phone: input.phone,
      relationship: input.relationship || null,
      permission_level: input.permissionLevel,
    })
    .eq('id', contactId)
    .select('*')
    .single();

  if (error) throw handleServiceError('updateContact', error);
  return data as EmergencyContactRow;
}

export async function removeContact(db: Db, contactId: string): Promise<void> {
  const { error } = await db.from('emergency_contacts').delete().eq('id', contactId);
  if (error) throw handleServiceError('removeContact', error);
}

/**
 * Revokes every live share pointed at one contact, without deleting the
 * contact. This is the "stop sharing with them right now" control, and it must
 * take effect on the next read — which it does, because
 * `has_active_trusted_share()` checks `revoked_at` on every call.
 */
export async function revokeContactAccess(db: Db, contactId: string): Promise<number> {
  const { data, error } = await db
    .from('trusted_location_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('contact_id', contactId)
    .is('revoked_at', null)
    .select('id');

  if (error) throw handleServiceError('revokeContactAccess', error);
  return (data ?? []).length;
}

/** Shares the caller has granted that are still live. */
export async function listActiveShares(db: Db): Promise<TrustedLocationShareRow[]> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await db
    .from('trusted_location_shares')
    .select('*')
    .eq('owner_id', auth.user.id)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('granted_at', { ascending: false });

  if (error) throw handleServiceError('listActiveShares', error);
  return (data ?? []) as TrustedLocationShareRow[];
}

export async function revokeShare(db: Db, shareId: string): Promise<void> {
  const { error } = await db
    .from('trusted_location_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareId);

  if (error) throw handleServiceError('revokeShare', error);
}

/** Revokes every live share the caller has granted, in one action. */
export async function revokeAllShares(db: Db): Promise<number> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new AppError('unauthenticated', 'Please sign in to continue.', 401);

  const { data, error } = await db
    .from('trusted_location_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('owner_id', auth.user.id)
    .is('revoked_at', null)
    .select('id');

  if (error) throw handleServiceError('revokeAllShares', error);
  return (data ?? []).length;
}

/**
 * Mints fresh share grants for an activity that is already running.
 *
 * Needed because a link token is shown exactly once — if the owner loses it
 * before sending, there is no way to recover it from the database (only the
 * hash is stored). Re-issuing is safe: the owner is authorising it, the new
 * grant expires with the activity, and the old one can be revoked separately.
 */
export async function reissueActivityShares(
  db: Db,
  activityId: string,
  contactIds?: string[],
  durationMinutes = 120,
): Promise<OpenedShareRow[]> {
  const { data, error } = await db.rpc('open_trusted_shares', {
    p_activity_id: activityId,
    p_reason: 'activity',
    p_contact_ids: contactIds && contactIds.length > 0 ? contactIds : null,
    p_duration_minutes: durationMinutes,
  });

  if (error) throw handleServiceError('reissueActivityShares', error);
  return (data ?? []) as OpenedShareRow[];
}
