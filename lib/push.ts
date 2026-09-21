import 'server-only';

import webpush, { type PushSubscription, WebPushError } from 'web-push';
import { requireVapid } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Delivery for queued alerts.
 *
 * Runs only on the server with the service-role client, because sending an
 * alert means reading the *recipient's* push subscription — which the sender
 * has no business being able to do. That read is the reason this file exists
 * rather than the client sending its own notifications.
 *
 * Payloads carry a name and a kind. Never a coordinate, never a token: the
 * database refuses those (see notification_outbox's CHECK constraint), and
 * this keeps the promise on the wire too.
 */

interface OutboxRow {
  id: number;
  recipient_user_id: string;
  kind: string;
  payload: { name?: string } | null;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface DispatchResult {
  pending: number;
  sent: number;
  failed: number;
  prunedSubscriptions: number;
}

/** A push service reporting the subscription no longer exists. */
function isGone(error: unknown): boolean {
  return error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410);
}

/**
 * Sends every unsent alert, marks the outbox, and prunes subscriptions the
 * push services have told us are dead.
 *
 * `limit` bounds one run so a backlog cannot stall the scheduled job.
 */
export async function dispatchPending(limit = 100): Promise<DispatchResult> {
  const vapid = requireVapid();
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const admin = createAdminClient();

  const { data: queued, error } = await admin
    .from('notification_outbox')
    .select('id, recipient_user_id, kind, payload')
    .is('sent_at', null)
    .order('created_at')
    .limit(limit);

  if (error) throw error;

  const rows = (queued ?? []) as OutboxRow[];
  if (rows.length === 0) {
    return { pending: 0, sent: 0, failed: 0, prunedSubscriptions: 0 };
  }

  const recipients = [...new Set(rows.map((row) => row.recipient_user_id))];
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', recipients)
    .eq('is_active', true);

  const byUser = new Map<string, SubscriptionRow[]>();
  for (const sub of (subs ?? []) as SubscriptionRow[]) {
    const list = byUser.get(sub.user_id) ?? [];
    list.push(sub);
    byUser.set(sub.user_id, list);
  }

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];

  for (const row of rows) {
    const targets = byUser.get(row.recipient_user_id) ?? [];

    // No registered browser is not a failure: the alert is still visible
    // in-app, and marking it sent stops it being retried forever.
    if (targets.length === 0) {
      await admin
        .from('notification_outbox')
        .update({ sent_at: new Date().toISOString(), last_error: 'no_active_subscription' })
        .eq('id', row.id);
      continue;
    }

    const body = JSON.stringify({ kind: row.kind, name: row.payload?.name ?? 'Someone' });
    let delivered = false;
    let lastError: string | null = null;

    for (const target of targets) {
      const subscription: PushSubscription = {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      };

      try {
        await webpush.sendNotification(subscription, body, { TTL: 60 * 60 });
        delivered = true;
      } catch (cause) {
        if (isGone(cause)) {
          dead.push(target.id);
        } else {
          lastError = cause instanceof WebPushError ? `status_${cause.statusCode}` : 'send_failed';
          console.error('[mwhite-safecircle] push send failed:', lastError);
        }
      }
    }

    await admin
      .from('notification_outbox')
      .update({
        sent_at: delivered ? new Date().toISOString() : null,
        attempts: 1,
        last_error: delivered ? null : (lastError ?? 'all_subscriptions_gone'),
      })
      .eq('id', row.id);

    if (delivered) sent += 1;
    else failed += 1;
  }

  if (dead.length > 0) {
    await admin.from('push_subscriptions').update({ is_active: false }).in('id', dead);
  }

  return { pending: rows.length, sent, failed, prunedSubscriptions: dead.length };
}
