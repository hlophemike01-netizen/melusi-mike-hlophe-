import type { Config } from '@netlify/functions';

/**
 * Drains the alert outbox every five minutes.
 *
 * Netlify has no equivalent of Vercel Cron, so `vercel.json` does nothing here
 * and this replaces it. It calls the app's own endpoint rather than importing
 * the dispatch code, because the sending path needs the service-role key and
 * the Node runtime the Next.js route already has — one implementation, one
 * place where a push is actually sent.
 *
 * The other two jobs are deliberately NOT here. They are single SQL calls, so
 * they run in Postgres via pg_cron where they cannot be broken by a bad deploy
 * or a cold start. See docs/DEPLOYMENT.md.
 */
export default async function handler(): Promise<Response> {
  const base = process.env.URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.CRON_SECRET;

  // Fail loudly. A scheduled job that quietly does nothing is worse than one
  // that errors, because the alerts it was meant to send just never arrive.
  if (!base) {
    console.error('[mwhite-safecircle] push dispatch: no site URL in the environment');
    return new Response('missing site url', { status: 500 });
  }
  if (!secret) {
    console.error('[mwhite-safecircle] push dispatch: CRON_SECRET is not set');
    return new Response('missing cron secret', { status: 500 });
  }

  const response = await fetch(`${base}/api/push/dispatch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });

  const body = await response.text();
  if (!response.ok) {
    console.error(`[mwhite-safecircle] push dispatch failed: ${response.status} ${body}`);
    return new Response(body, { status: response.status });
  }

  // On success the counts go back in the response body, which Netlify records
  // in the function log — no console.log needed, and the repo forbids it.
  return new Response(body, { status: 200 });
}

export const config: Config = {
  schedule: '*/5 * * * *',
};
