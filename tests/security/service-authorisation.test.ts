/**
 * Service-layer authorisation tests.
 *
 * These check the queries the application actually sends. RLS is the real
 * boundary — proven against PostgreSQL in tests/db — but a service that forgets
 * an owner filter, reads `profiles` where it should read `public_profiles`, or
 * sends a client-supplied user_id still causes real harm, and none of that is
 * visible from the SQL side.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createMockDb, findCall, hasFilter, type MockDb } from '@/tests/setup/supabase-mock';
import {
  endActivity,
  eraseMyLocationHistory,
  getLatestLocation,
  recordLocation,
  startActivity,
} from '@/services/activity.service';
import { listContacts, revokeAllShares, revokeShare } from '@/services/contacts.service';
import { getDensityCells, getNearbySummary } from '@/services/community.service';
import { getMyProfile, getPublicProfile, updatePrivacySettings } from '@/services/profile.service';
import { blockUser, submitReport } from '@/services/report.service';
import { getDashboardMetrics, listEmergencyOverview } from '@/services/admin.service';
import { activateEmergency } from '@/services/emergency.service';

let mock: MockDb;

beforeEach(() => {
  mock = createMockDb({ id: 'user-1' });
});

describe('profile reads', () => {
  it('scopes the private profile read to the signed-in user', async () => {
    mock.setTableResult('profiles', { data: null, error: null });
    await getMyProfile(mock.db);

    const call = findCall(mock.calls, 'profiles', 'select');
    expect(hasFilter(call, 'eq', 'id', 'user-1')).toBe(true);
  });

  it('returns null rather than querying when nobody is signed in', async () => {
    mock.setUser(null);
    await expect(getMyProfile(mock.db)).resolves.toBeNull();
    expect(mock.calls).toHaveLength(0);
  });

  it("reads another user through public_profiles, never the profiles table", async () => {
    mock.setTableResult('public_profiles', { data: null, error: null });
    await getPublicProfile(mock.db, 'user-2');

    expect(findCall(mock.calls, 'public_profiles', 'select')).toBeDefined();
    // profiles carries email, phone and role. Reading it for someone else
    // would be a leak even if RLS happened to allow it.
    expect(findCall(mock.calls, 'profiles', 'select')).toBeUndefined();
  });
});

describe('location writes', () => {
  it('derives the owner from the session, never from an argument', async () => {
    await recordLocation(mock.db, 'activity-1', { latitude: -33.9, longitude: 18.4, accuracy: 10 });

    const call = findCall(mock.calls, 'activity_locations', 'insert');
    const payload = call?.payload as Record<string, unknown>;
    expect(payload.user_id).toBe('user-1');
    expect(payload.activity_id).toBe('activity-1');
    expect(payload.location).toBe('SRID=4326;POINT(18.4 -33.9)');
  });

  it('never sends an expires_at, so the database sets retention', async () => {
    await recordLocation(mock.db, 'activity-1', { latitude: -33.9, longitude: 18.4 });

    const payload = findCall(mock.calls, 'activity_locations', 'insert')?.payload as Record<
      string,
      unknown
    >;
    // A client-supplied expiry would let a tampered request extend retention.
    expect(payload).not.toHaveProperty('expires_at');
  });

  it('refuses to write an invalid coordinate', async () => {
    await expect(
      recordLocation(mock.db, 'activity-1', { latitude: 999, longitude: 18.4 }),
    ).rejects.toThrow();
    expect(findCall(mock.calls, 'activity_locations', 'insert')).toBeUndefined();
  });

  it('requires a session before writing', async () => {
    mock.setUser(null);
    await expect(
      recordLocation(mock.db, 'activity-1', { latitude: -33.9, longitude: 18.4 }),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

describe('location reads', () => {
  it('goes through the RPC, which re-checks authorisation server-side', async () => {
    mock.setRpcResult('latest_activity_location', { data: [], error: null });
    await getLatestLocation(mock.db, 'activity-9');

    expect(mock.rpcCalls[0]?.fn).toBe('latest_activity_location');
    // A direct table read would bypass the single authorisation predicate.
    expect(findCall(mock.calls, 'activity_locations', 'select')).toBeUndefined();
  });

  it('returns one point, not a trail', async () => {
    mock.setRpcResult('latest_activity_location', {
      data: [
        { activity_id: 'a', lng: 18.4, lat: -33.9, accuracy: 10, recorded_at: '2026-01-01T00:00:00Z' },
      ],
      error: null,
    });

    const result = await getLatestLocation(mock.db, 'a');
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(false);
  });

  it('scopes history deletion to the signed-in user', async () => {
    mock.setTableResult('activity_locations', { data: [], error: null });
    await eraseMyLocationHistory(mock.db);

    const call = findCall(mock.calls, 'activity_locations', 'delete');
    expect(hasFilter(call, 'eq', 'user_id', 'user-1')).toBe(true);
  });
});

describe('ending an activity', () => {
  it('uses the transactional RPC rather than a sequence of client updates', async () => {
    await endActivity(mock.db, 'activity-1', 'completed');

    expect(mock.rpcCalls).toEqual([
      { fn: 'end_activity', args: { act_id: 'activity-1', new_status: 'completed' } },
    ]);
    // Doing this client-side could leave shares live if the tab closed midway.
    expect(mock.calls).toHaveLength(0);
  });
});

describe('starting an activity', () => {
  it('cancels the activity when share setup fails, rather than leaving it live', async () => {
    mock.setTableResult('activities', {
      data: { id: 'activity-1', user_id: 'user-1', visibility: 'trusted_contacts' },
      error: null,
    });
    mock.setRpcResult('open_trusted_shares', { data: null, error: { message: 'boom' } });

    await expect(
      startActivity(mock.db, {
        activityType: 'running',
        visibility: 'trusted_contacts',
        durationMinutes: 60,
        contactIds: ['contact-1'],
        contributeToDensity: false,
      }),
    ).rejects.toBeTruthy();

    expect(mock.rpcCalls).toContainEqual({
      fn: 'end_activity',
      args: { act_id: 'activity-1', new_status: 'cancelled' },
    });
  });

  it('sets the owner from the session', async () => {
    mock.setTableResult('activities', { data: { id: 'a', user_id: 'user-1' }, error: null });

    await startActivity(mock.db, {
      activityType: 'walking',
      visibility: 'private',
      durationMinutes: 30,
      contributeToDensity: false,
    });

    const payload = findCall(mock.calls, 'activities', 'insert')?.payload as Record<string, unknown>;
    expect(payload.user_id).toBe('user-1');
    // A private activity must never be put on the community map.
    expect(payload.contributes_to_density).toBe(false);
  });
});

describe('privacy master switch', () => {
  it('ends any running activity when location sharing is turned off', async () => {
    mock.setTableResult('activities', { data: [{ id: 'activity-live' }], error: null });
    mock.setTableResult('profiles', { data: { id: 'user-1' }, error: null });

    await updatePrivacySettings(mock.db, {
      locationSharingEnabled: false,
      discoverableInGroups: true,
      defaultActivityVisibility: 'private',
    });

    // A switch that leaves a live broadcast running would be a lie.
    expect(mock.rpcCalls).toContainEqual({
      fn: 'end_activity',
      args: { act_id: 'activity-live', new_status: 'cancelled' },
    });
  });

  it('does not touch running activities when sharing stays on', async () => {
    mock.setTableResult('profiles', { data: { id: 'user-1' }, error: null });

    await updatePrivacySettings(mock.db, {
      locationSharingEnabled: true,
      discoverableInGroups: true,
      defaultActivityVisibility: 'trusted_contacts',
    });

    expect(mock.rpcCalls.filter((call) => call.fn === 'end_activity')).toHaveLength(0);
  });
});

describe('trusted contacts and shares', () => {
  it('scopes the contact list to the owner', async () => {
    mock.setTableResult('emergency_contacts', { data: [], error: null });
    await listContacts(mock.db);

    expect(hasFilter(findCall(mock.calls, 'emergency_contacts', 'select'), 'eq', 'owner_id', 'user-1')).toBe(
      true,
    );
  });

  it('revokes rather than deletes, so expiry history survives', async () => {
    mock.setTableResult('trusted_location_shares', { data: [], error: null });
    await revokeShare(mock.db, 'share-1');

    const call = findCall(mock.calls, 'trusted_location_shares', 'update');
    expect(call).toBeDefined();
    expect((call?.payload as Record<string, unknown>).revoked_at).toBeTruthy();
    expect(findCall(mock.calls, 'trusted_location_shares', 'delete')).toBeUndefined();
  });

  it('revoke-all only touches the caller’s own live shares', async () => {
    mock.setTableResult('trusted_location_shares', { data: [], error: null });
    await revokeAllShares(mock.db);

    const call = findCall(mock.calls, 'trusted_location_shares', 'update');
    expect(hasFilter(call, 'eq', 'owner_id', 'user-1')).toBe(true);
    expect(hasFilter(call, 'is', 'revoked_at', null)).toBe(true);
  });
});

describe('community map', () => {
  it('reads aggregates through the RPC and never the location table', async () => {
    mock.setRpcResult('community_activity_density', { data: [], error: null });
    await getDensityCells(mock.db, { minLng: 18.3, minLat: -34, maxLng: 18.5, maxLat: -33.8 });

    expect(mock.rpcCalls[0]?.fn).toBe('community_activity_density');
    expect(findCall(mock.calls, 'activity_locations', 'select')).toBeUndefined();
    expect(findCall(mock.calls, 'activities', 'select')).toBeUndefined();
  });

  it('clamps an oversized viewport before it reaches the server', async () => {
    mock.setRpcResult('community_activity_density', { data: [], error: null });
    await getDensityCells(mock.db, { minLng: -180, minLat: -90, maxLng: 180, maxLat: 90 });

    const args = mock.rpcCalls[0]?.args as {
      min_lng: number;
      min_lat: number;
      max_lng: number;
      max_lat: number;
    };
    expect(args.max_lng - args.min_lng).toBeLessThan(1.5);
    expect(args.max_lat - args.min_lat).toBeLessThan(1.5);
  });

  it('summary reads counts only', async () => {
    mock.setRpcResult('community_activity_summary', { data: [], error: null });
    await getNearbySummary(mock.db, { latitude: -33.9, longitude: 18.4 });

    expect(mock.rpcCalls[0]?.fn).toBe('community_activity_summary');
    expect(mock.calls).toHaveLength(0);
  });
});

describe('admin services', () => {
  it('read through role-checking RPCs, not tables', async () => {
    mock.setRpcResult('admin_dashboard_metrics', { data: [], error: null });
    mock.setRpcResult('admin_emergency_overview', { data: [], error: null });

    await getDashboardMetrics(mock.db);
    await listEmergencyOverview(mock.db);

    expect(mock.rpcCalls.map((call) => call.fn)).toEqual([
      'admin_dashboard_metrics',
      'admin_emergency_overview',
    ]);
    // No admin path may read these directly.
    expect(findCall(mock.calls, 'activity_locations', 'select')).toBeUndefined();
    expect(findCall(mock.calls, 'emergency_contacts', 'select')).toBeUndefined();
  });
});

describe('reporting and blocking', () => {
  it('sets the reporter from the session and does not set moderation fields', async () => {
    mock.setTableResult('reports', { data: { id: 'report-1' }, error: null });

    await submitReport(mock.db, {
      subjectType: 'user',
      reportedUserId: 'user-2',
      category: 'harassment',
      description: 'Repeated unwanted contact after I left the group.',
    });

    const payload = findCall(mock.calls, 'reports', 'insert')?.payload as Record<string, unknown>;
    expect(payload.reporter_id).toBe('user-1');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('reviewed_by');
  });

  it('refuses a self-block before it reaches the database', async () => {
    await expect(blockUser(mock.db, 'user-1')).rejects.toMatchObject({ code: 'validation_failed' });
    expect(mock.calls).toHaveLength(0);
  });
});

describe('emergency activation', () => {
  it('never claims that emergency services were contacted', async () => {
    // No emergency is already running, so activation takes the insert path.
    mock.setTableResult('emergency_events', { data: null, error: null }, 'select');
    mock.setTableResult(
      'emergency_events',
      {
        data: { id: 'event-1', user_id: 'user-1', contacts_notified_count: 0, location_available: false },
        error: null,
      },
      'insert',
    );
    mock.setTableResult(
      'emergency_events',
      {
        data: { id: 'event-1', user_id: 'user-1', contacts_notified_count: 0, location_available: false },
        error: null,
      },
      'update',
    );
    mock.setRpcResult('open_trusted_shares', { data: [], error: null });

    const result = await activateEmergency(mock.db, {
      location: { latitude: -33.9, longitude: 18.4, accuracy: 20 },
    });

    expect(result.emergencyServicesContacted).toBe(false);

    const payload = findCall(mock.calls, 'emergency_events', 'insert')?.payload as Record<
      string,
      unknown
    >;
    // Even sending this field would be wrong; the database ignores it anyway.
    expect(payload).not.toHaveProperty('emergency_services_contacted');
  });
});
