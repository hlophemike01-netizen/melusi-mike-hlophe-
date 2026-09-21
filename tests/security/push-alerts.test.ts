/**
 * Web Push carries a person's name and the fact that they are in trouble
 * through a third party's servers. These tests hold the same line the rest of
 * the product does: nothing is requested without a user action, nothing leaves
 * with a location in it, and no client can address an alert to a stranger.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Strips comments before counting API calls. Without this, a doc comment that
 * merely *names* Notification.requestPermission() counts as a call site — the
 * assertion is about what the code does, not what it says about itself.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const sql = readdirSync(join(process.cwd(), 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(process.cwd(), 'supabase', 'migrations', f), 'utf8'))
  .join('\n');

describe('permission is never requested without a user action', () => {
  const hook = code('hooks/usePushAlerts.ts');

  it('only requests permission inside enable()', () => {
    const calls = hook.match(/Notification\.requestPermission\(\)/g) ?? [];
    expect(calls).toHaveLength(1);
    // The one call must sit after `const enable`, not in the mount effect.
    expect(hook.indexOf('Notification.requestPermission()')).toBeGreaterThan(
      hook.indexOf('const enable'),
    );
  });

  it('subscribes only from enable(), never on mount', () => {
    expect((hook.match(/pushManager\.subscribe\(/g) ?? [])).toHaveLength(1);
    const effectBody = hook.slice(hook.indexOf('useEffect('), hook.indexOf('const enable'));
    expect(effectBody).not.toContain('requestPermission');
    expect(effectBody).not.toContain('pushManager.subscribe');
  });

  it('reads existing state with getSubscription, which does not prompt', () => {
    expect(hook).toContain('getSubscription()');
  });
});

describe('a client cannot address an alert to anyone it likes', () => {
  it('the queue function is revoked from authenticated users', () => {
    expect(sql).toMatch(
      /revoke all on function public\.queue_contact_notifications[\s\S]*?from public, anon, authenticated/,
    );
    expect(sql).toMatch(/grant execute on function public\.queue_contact_notifications[\s\S]*?to service_role/);
  });

  it('the caller-facing wrapper can only raise alerts about the caller', () => {
    const fn = sql.match(/create or replace function public\.notify_my_contacts[\s\S]*?\$\$;/)?.[0];
    expect(fn).toBeTruthy();
    expect(fn).toContain('actor uuid := auth.uid()');
    // It passes auth.uid() as the subject — never an argument.
    expect(fn).toMatch(/queue_contact_notifications\(\s*actor,/);
    expect(fn).toMatch(/p_kind not in \('emergency_raised', 'emergency_resolved'\)/);
  });

  it('recipients must be the subject’s own active contacts, and not blocked', () => {
    const fn = sql.match(/create or replace function public\.queue_contact_notifications[\s\S]*?\$\$;/)?.[0];
    expect(fn).toContain('c.owner_id = p_subject_id');
    expect(fn).toContain('c.is_active');
    expect(fn).toContain('is_blocked_between');
  });

  it('the client never sends its own user_id when subscribing', () => {
    const hook = read('hooks/usePushAlerts.ts');
    const upsert = hook.slice(hook.indexOf('.upsert('), hook.indexOf('onConflict'));
    expect(upsert).not.toContain('user_id');
    // The database derives it instead.
    expect(sql).toContain('tg_push_subscriptions_owner');
  });
});

describe('no alert can carry a location', () => {
  it('the outbox rejects location keys at the schema level', () => {
    const constraint = sql.match(/constraint notification_outbox_no_location[\s\S]*?\)\n/)?.[0];
    expect(constraint).toBeTruthy();
    for (const key of ['latitude', 'longitude', 'location', 'coordinates', 'token']) {
      expect(constraint).toContain(key);
    }
  });

  it('the sender puts only a kind and a name on the wire', () => {
    const push = read('lib/push.ts');
    const body = push.match(/const body = JSON\.stringify\(\{[^}]*\}\)/)?.[0];
    expect(body).toBeTruthy();
    expect(body).toContain('kind');
    expect(body).toContain('name');
    expect(body).not.toMatch(/lat|lng|location|token/);
  });

  it('the service worker reads only name and kind from the payload', () => {
    const sw = read('public/sw.js');
    const handler = sw.slice(sw.indexOf("addEventListener('push'"), sw.indexOf("addEventListener('notificationclick'"));
    expect(handler).not.toMatch(/data\.(lat|lng|location|token|coordinates)/);
  });
});

describe('the notification wording stays honest', () => {
  it('an emergency alert says emergency services were not contacted', () => {
    const sw = read('public/sw.js');
    expect(sw).toMatch(/Emergency services have NOT been contacted/i);
  });

  it('no notification claims help is on the way', () => {
    const sw = read('public/sw.js');
    for (const overclaim of ['help is on the way', 'police have been', 'ambulance']) {
      expect(sw.toLowerCase()).not.toContain(overclaim);
    }
  });
});

describe('the send path stays server-only', () => {
  it('lib/push.ts is server-only and uses the admin client', () => {
    const push = read('lib/push.ts');
    expect(push.startsWith("import 'server-only';")).toBe(true);
    expect(push).toContain('createAdminClient');
  });

  it('no client component imports the sender', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name)) {
          const body = read(rel);
          if (body.includes("'use client'") && /from '@\/lib\/push'/.test(body)) offenders.push(rel);
        }
      }
    };
    for (const root of ['app', 'features', 'hooks', 'components']) walk(root);
    expect(offenders).toEqual([]);
  });

  it('the VAPID private key is never exposed to the browser', () => {
    const env = read('lib/env.ts');
    expect(env).not.toMatch(/NEXT_PUBLIC_VAPID_PRIVATE/);
    // The private key is only reachable through the server-guarded accessor.
    const publicBlock = env.slice(env.indexOf('export const publicEnv'), env.indexOf('export function assertPublicEnv'));
    expect(publicBlock).not.toContain('VAPID_PRIVATE_KEY');
  });
});
