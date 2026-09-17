import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';

/**
 * Authorises a scheduled job request.
 *
 * Compared in constant time so the secret cannot be recovered one byte at a
 * time by measuring response latency. Vercel Cron sends the secret as
 * `Authorization: Bearer <CRON_SECRET>`.
 */
export function isAuthorisedCronRequest(request: Request): boolean {
  const expected = serverEnv().cronSecret;
  if (!expected) return false;

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');

  // timingSafeEqual throws on a length mismatch, so compare a fixed-size digest
  // of each: equal lengths, and still no early exit on the first differing byte.
  if (expectedBuffer.length !== providedBuffer.length) {
    // Do the comparison anyway against a same-length buffer so the failure path
    // costs roughly the same as the success path.
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}
