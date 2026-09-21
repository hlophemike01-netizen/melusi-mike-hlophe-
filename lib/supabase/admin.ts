import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { publicEnv, requireServiceRoleKey } from '@/lib/env';

/**
 * Service-role Supabase client. BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * Rules for using this:
 *   1. Server-side only. The `server-only` import makes a client bundle fail
 *      to build rather than shipping the key.
 *   2. Only for work that has no user session: the scheduled location purge
 *      and the missed check-in sweep.
 *   3. NEVER to answer a user request. If a user needs data, they must be able
 *      to read it under their own policies — otherwise they are not meant to
 *      have it.
 *   4. Never to read `activity_locations`. No scheduled job needs coordinates;
 *      the purge deletes by expiry alone.
 */
export function createAdminClient() {
  return createSupabaseClient(publicEnv.supabaseUrl, requireServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
