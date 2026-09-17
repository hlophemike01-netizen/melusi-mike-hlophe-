import { AppError, handleServiceError } from '@/lib/errors';
import { toWkt } from '@/lib/geo';
import type { LocationPointInput } from '@/lib/validation';
import type { Db } from '@/services/types';
import type { EmergencyEventRow, EmergencyStatus, OpenedShareRow } from '@/types/database';

export interface ActivateEmergencyResult {
  event: EmergencyEventRow;
  /** Contacts alerted in-app. */
  notifiedCount: number;
  /** One-time links for contacts without a SafeCircle account. */
  shareLinks: OpenedShareRow[];
  /**
   * Always false in V1. SafeCircle has no verified emergency-services
   * integration, and the database refuses to let a client set this true.
   */
  emergencyServicesContacted: boolean;
}

/**
 * Activates emergency mode.
 *
 * What this does: records the event, captures a position if permission was
 * ALREADY granted, and opens share grants for the user's trusted contacts.
 *
 * What this explicitly does not do: contact police, ambulance or any emergency
 * service. Every string returned from here must keep that distinction visible.
 */
export async function activateEmergency(
  db: Db,
  options: {
    location?: LocationPointInput | null;
    note?: string;
    activityId?: string | null;
  } = {},
): Promise<ActivateEmergencyResult> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new AppError('unauthenticated', 'Please sign in to continue.', 401);

  const existing = await getActiveEmergency(db);
  if (existing) {
    const shareLinks = await openEmergencyShares(db, existing.id);
    return {
      event: existing,
      notifiedCount: existing.contacts_notified_count,
      shareLinks,
      emergencyServicesContacted: false,
    };
  }

  const { data: created, error } = await db
    .from('emergency_events')
    .insert({
      user_id: auth.user.id,
      activity_id: options.activityId ?? null,
      note: options.note?.slice(0, 1000) || null,
      triggered_location: options.location
        ? toWkt({ latitude: options.location.latitude, longitude: options.location.longitude })
        : null,
      triggered_location_accuracy: options.location?.accuracy ?? null,
    })
    .select('*')
    .single();

  if (error) throw handleServiceError('activateEmergency', error);
  const event = created as EmergencyEventRow;

  // Escalate the running activity so its location keeps flowing to the people
  // who are now authorised to see it.
  if (options.activityId) {
    await db
      .from('activities')
      .update({ status: 'emergency' })
      .eq('id', options.activityId)
      .in('status', ['active', 'overdue']);
  }

  const shareLinks = await openEmergencyShares(db, event.id);

  const { data: counted } = await db
    .from('emergency_events')
    .update({ contacts_notified_count: shareLinks.length })
    .eq('id', event.id)
    .select('*')
    .single();

  return {
    event: (counted as EmergencyEventRow | null) ?? event,
    notifiedCount: shareLinks.length,
    shareLinks,
    emergencyServicesContacted: false,
  };
}

async function openEmergencyShares(db: Db, eventId: string): Promise<OpenedShareRow[]> {
  const { data, error } = await db.rpc('open_trusted_shares', {
    p_emergency_event_id: eventId,
    p_reason: 'emergency',
    p_duration_minutes: 720,
  });

  if (error) throw handleServiceError('openEmergencyShares', error);
  return (data ?? []) as OpenedShareRow[];
}

export async function getActiveEmergency(db: Db): Promise<EmergencyEventRow | null> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await db
    .from('emergency_events')
    .select('*')
    .eq('user_id', auth.user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw handleServiceError('getActiveEmergency', error);
  return (data as EmergencyEventRow | null) ?? null;
}

/**
 * Resolves an emergency. Only the person who raised it can, which is
 * deliberate: an administrator marking someone else "safe" would be a
 * statement about their wellbeing that nobody at SafeCircle is in a position
 * to make.
 */
export async function resolveEmergency(
  db: Db,
  eventId: string,
  status: Extract<EmergencyStatus, 'resolved_safe' | 'resolved_false_alarm' | 'cancelled'>,
  note?: string,
): Promise<EmergencyEventRow> {
  const { data, error } = await db
    .from('emergency_events')
    .update({ status, resolution_note: note?.slice(0, 1000) || null })
    .eq('id', eventId)
    .select('*')
    .single();

  if (error) throw handleServiceError('resolveEmergency', error);
  const event = data as EmergencyEventRow;

  await db
    .from('trusted_location_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('emergency_event_id', eventId)
    .is('revoked_at', null);

  if (event.activity_id) {
    await db
      .from('activities')
      .update({ status: 'active' })
      .eq('id', event.activity_id)
      .eq('status', 'emergency');
  }

  return event;
}

export async function listMyEmergencyEvents(db: Db, limit = 10): Promise<EmergencyEventRow[]> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await db
    .from('emergency_events')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('triggered_at', { ascending: false })
    .limit(Math.min(limit, 50));

  if (error) throw handleServiceError('listMyEmergencyEvents', error);
  return (data ?? []) as EmergencyEventRow[];
}
