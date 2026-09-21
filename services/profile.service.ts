import { handleServiceError, AppError } from '@/lib/errors';
import type { Db } from '@/services/types';
import type { ProfileRow, PublicProfileRow } from '@/types/database';
import type { PrivacySettingsInput, ProfileUpdateInput } from '@/lib/validation';

/** The signed-in user's own profile, including private fields. */
export async function getMyProfile(db: Db): Promise<ProfileRow | null> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (error) throw handleServiceError('getMyProfile', error);
  return (data as ProfileRow | null) ?? null;
}

export async function requireMyProfile(db: Db): Promise<ProfileRow> {
  const profile = await getMyProfile(db);
  if (!profile) {
    throw new AppError('unauthenticated', 'Please sign in to continue.', 401);
  }
  if (profile.account_status === 'suspended') {
    throw new AppError(
      'not_authorised',
      'This account is suspended. Contact support if you think this is a mistake.',
      403,
    );
  }
  return profile;
}

export async function updateMyProfile(db: Db, input: ProfileUpdateInput): Promise<ProfileRow> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new AppError('unauthenticated', 'Please sign in to continue.', 401);

  const { data, error } = await db
    .from('profiles')
    .update({
      display_name: input.displayName,
      phone: input.phone ? input.phone : null,
      approximate_area: input.approximateArea ? input.approximateArea : null,
    })
    .eq('id', auth.user.id)
    .select('*')
    .single();

  if (error) throw handleServiceError('updateMyProfile', error);
  return data as ProfileRow;
}

/**
 * Privacy settings.
 *
 * Turning the master switch OFF is a safety-critical action: it must also stop
 * anything already in flight. The database refuses new writes once the flag is
 * false, and this function ends the live activity so nothing keeps streaming.
 */
export async function updatePrivacySettings(
  db: Db,
  input: PrivacySettingsInput,
): Promise<ProfileRow> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new AppError('unauthenticated', 'Please sign in to continue.', 401);

  if (!input.locationSharingEnabled) {
    const { data: live } = await db
      .from('activities')
      .select('id')
      .eq('user_id', auth.user.id)
      .in('status', ['active', 'overdue'])
      .limit(1);

    for (const activity of (live ?? []) as Array<{ id: string }>) {
      await db.rpc('end_activity', { act_id: activity.id, new_status: 'cancelled' });
    }
  }

  const { data, error } = await db
    .from('profiles')
    .update({
      location_sharing_enabled: input.locationSharingEnabled,
      discoverable_in_groups: input.discoverableInGroups,
      default_activity_visibility: input.defaultActivityVisibility,
    })
    .eq('id', auth.user.id)
    .select('*')
    .single();

  if (error) throw handleServiceError('updatePrivacySettings', error);
  return data as ProfileRow;
}

/**
 * Another user's limited profile. Reads the `public_profiles` view, which has
 * no email, phone or role column at all — so a mistake here cannot leak them.
 */
export async function getPublicProfile(db: Db, userId: string): Promise<PublicProfileRow | null> {
  const { data, error } = await db
    .from('public_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw handleServiceError('getPublicProfile', error);
  return (data as PublicProfileRow | null) ?? null;
}

export async function getPublicProfiles(db: Db, userIds: string[]): Promise<PublicProfileRow[]> {
  if (userIds.length === 0) return [];

  const { data, error } = await db
    .from('public_profiles')
    .select('*')
    .in('id', userIds.slice(0, 200));

  if (error) throw handleServiceError('getPublicProfiles', error);
  return (data ?? []) as PublicProfileRow[];
}

export function isAdmin(profile: Pick<ProfileRow, 'role' | 'account_status'> | null): boolean {
  return profile?.role === 'admin' && profile.account_status === 'active';
}

export function isModerator(profile: Pick<ProfileRow, 'role' | 'account_status'> | null): boolean {
  return (
    (profile?.role === 'admin' || profile?.role === 'moderator') &&
    profile.account_status === 'active'
  );
}
