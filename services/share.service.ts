import { handleServiceError } from '@/lib/errors';
import type { Db } from '@/services/types';
import type { SharedLocationRow } from '@/types/database';

/**
 * Token-based share links, for trusted contacts who do not have a Mwhite SafeCircle
 * account.
 *
 * The token IS the credential, so it is treated like one: it is generated
 * server-side, only its SHA-256 is stored, it is shown to the owner exactly
 * once, and it expires with the share window. The RPC returns a single point
 * and nothing enumerable.
 */
export async function getLocationByToken(db: Db, token: string): Promise<SharedLocationRow | null> {
  const { data, error } = await db.rpc('location_by_share_token', { p_token: token });
  if (error) throw handleServiceError('getLocationByToken', error);

  const rows = (data ?? []) as SharedLocationRow[];
  return rows[0] ?? null;
}

/** Builds the URL to hand to a contact. */
export function buildShareUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/$/, '')}/shared/${token}`;
}
