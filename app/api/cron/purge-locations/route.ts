import { NextResponse } from 'next/server';
import { isAuthorisedCronRequest } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Scheduled retention job.
 *
 * Deletes expired precise location points, closes activities that ran long
 * past their expected end, and removes dead share grants.
 *
 * This is the one place the service-role key is used, and even here it never
 * reads a coordinate — it deletes by expiry. The response contains counts only.
 *
 * Schedule: at least every 15 minutes (see vercel.json).
 */
export async function POST(request: Request) {
  if (!isAuthorisedCronRequest(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('purge_expired_location_data');

    if (error) {
      console.error('[safecircle] purge job failed:', error);
      return NextResponse.json({ error: 'purge_failed' }, { status: 500 });
    }

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ ok: true, ...result });
  } catch (cause) {
    console.error('[safecircle] purge job error:', cause);
    return NextResponse.json({ error: 'purge_failed' }, { status: 500 });
  }
}

// Vercel Cron issues GET requests; delegate so one handler covers both.
export async function GET(request: Request) {
  return POST(request);
}
