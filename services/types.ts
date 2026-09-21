import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The client every service takes.
 *
 * Services are deliberately client-agnostic: the same function is called from a
 * Server Component (cookie-scoped client) and from the browser. Because both
 * carry the same user identity and both hit RLS, there is no privileged path
 * hiding in the service layer.
 *
 * Nothing here ever accepts the service-role client.
 */
export type Db = SupabaseClient;

export interface Paginated<T> {
  items: T[];
  hasMore: boolean;
}
