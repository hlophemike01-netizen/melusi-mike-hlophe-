import { NextResponse } from 'next/server';
import { isAuthorisedCronRequest } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Missed check-in sweep.
 *
 * Marks overdue prompts as missed, flips the activity to `overdue`, and opens
 * share grants for contacts whose permission level covers an escalation.
 *
 * It alerts TRUSTED CONTACTS. It does not, and must never be extended to,
 * contact emergency services. The response carries counts only — never a
 * user id, a name or a location.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCronRequest(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('sweep_missed_check_ins', { p_grace_minutes: 5 });

    if (error) {
      console.error('[mwhite-safecircle] check-in sweep failed:', error);
      return NextResponse.json({ error: 'sweep_failed' }, { status: 500 });
    }

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ ok: true, ...result });
  } catch (cause) {
    console.error('[mwhite-safecircle] check-in sweep error:', cause);
    return NextResponse.json({ error: 'sweep_failed' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
