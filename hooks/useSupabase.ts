'use client';

import { useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

/** The browser Supabase client, memoised. Always RLS-scoped to the signed-in user. */
export function useSupabase() {
  return useMemo(() => createClient(), []);
}
