'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

/**
 * Browser Supabase client.
 *
 * Uses the anon key, which is public. Every table this client can reach is
 * protected by RLS — that, not key secrecy, is what stops one user reading
 * another's data. Never swap this for the service-role key to "make something
 * work"; that would remove the only protection there is.
 */
let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  }
  return browserClient;
}
