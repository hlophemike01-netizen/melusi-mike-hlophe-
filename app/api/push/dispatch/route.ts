import { NextResponse } from 'next/server';
import { isAuthorisedCronRequest } from '@/lib/cron-auth';
import { dispatchPending } from '@/lib/push';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Drains the alert outbox.
 *
 * Two callers, on purpose:
 *
 *   the scheduled job   every 5 minutes, which covers missed check-ins —
 *                       a feature that is 5-minute granular anyway
 *   a signed-in client  immediately after raising an emergency, because
 *                       waiting up to five minutes to tell someone you are in
 *                       trouble is not acceptable
 *
 * A signed-in caller can only cause already-queued alerts to be sent sooner.
 * They cannot choose a recipient or a message: both are fixed when the
 * database queues the row, and only queue_contact_notifications can do that.
 */
async function dispatch() {
  try {
    const result = await dispatchPending();
    return NextResponse.json({ ok: true, ...result });
  } catch (cause) {
    console.error('[mwhite-safecircle] push dispatch failed:', cause);
    return NextResponse.json({ error: 'dispatch_failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (isAuthorisedCronRequest(request)) return dispatch();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  return dispatch();
}

// Vercel Cron issues GET.
export async function GET(request: Request) {
  if (!isAuthorisedCronRequest(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  return dispatch();
}
