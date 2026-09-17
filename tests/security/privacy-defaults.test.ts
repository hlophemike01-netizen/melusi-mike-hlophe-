/**
 * Privacy-by-default checks.
 *
 * These assert the shipped defaults directly in the migration SQL, because a
 * default that drifts from "off" is a silent, product-wide change that no
 * runtime test would necessarily catch.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function readMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
    .join('\n');
}

const sql = readMigrations();

describe('database defaults are private', () => {
  it('starts every account with location sharing off', () => {
    expect(sql).toMatch(/location_sharing_enabled boolean not null default false/);
  });

  it('defaults a new activity to private visibility', () => {
    expect(sql).toMatch(/default_activity_visibility public\.activity_visibility not null default 'private'/);
    expect(sql).toMatch(/visibility public\.activity_visibility not null default 'private'/);
  });

  it('keeps a new activity off the community map unless opted in', () => {
    expect(sql).toMatch(/contributes_to_density boolean not null default false/);
  });

  it('defaults a trusted contact to the narrowest permission', () => {
    expect(sql).toMatch(
      /permission_level public\.contact_permission_level not null default 'emergency_only'/,
    );
  });

  it('defaults groups to private and approval-required', () => {
    expect(sql).toMatch(/visibility public\.group_visibility not null default 'private'/);
    expect(sql).toMatch(/requires_approval boolean not null default true/);
    expect(sql).toMatch(/status public\.group_member_status not null default 'pending'/);
  });

  it('never defaults an account to an elevated role', () => {
    expect(sql).toMatch(/role public\.app_role not null default 'user'/);
    expect(sql).not.toMatch(/default 'admin'/);
  });
});

describe('location retention is bounded in the schema', () => {
  it('requires an expiry on every location row', () => {
    expect(sql).toMatch(/expires_at timestamptz not null/);
    expect(sql).toMatch(/constraint activity_locations_expiry_after_record/);
  });

  it('caps a single activity at 24 hours', () => {
    expect(sql).toMatch(/constraint activities_max_duration[\s\S]*?interval '24 hours'/);
  });

  it('caps a single share window at 24 hours', () => {
    expect(sql).toMatch(/constraint trusted_shares_max_window[\s\S]*?interval '24 hours'/);
  });

  it('makes location rows append-only', () => {
    expect(sql).toMatch(/activity_locations_are_append_only/);
    expect(sql).toMatch(/create trigger activity_locations_no_update/);
  });
});

describe('RLS is enabled on every table that holds user data', () => {
  const tables = [
    'profiles',
    'user_blocks',
    'groups',
    'group_members',
    'activities',
    'activity_locations',
    'emergency_contacts',
    'trusted_location_shares',
    'check_ins',
    'emergency_events',
    'reports',
    'audit_logs',
  ];

  it.each(tables)('enables row level security on %s', (table) => {
    expect(sql).toMatch(new RegExp(`alter table public\\.${table}\\s+enable row level security`));
  });

  it('strips the anon role of table access entirely', () => {
    expect(sql).toMatch(/revoke all on public\.profiles[\s\S]*?from anon/);
  });
});

describe('the precise-location policy has no admin escape hatch', () => {
  it('gates reads on both authorisation and expiry', () => {
    const policy = sql.match(
      /create policy activity_locations_select_authorised[\s\S]*?\);/,
    )?.[0];

    expect(policy).toBeTruthy();
    expect(policy).toMatch(/expires_at > now\(\)/);
    expect(policy).toMatch(/can_view_activity_location/);
    // If `is_admin` appeared here, an administrator could read anyone's
    // coordinates — the exact thing this product refuses to allow.
    expect(policy).not.toMatch(/is_admin|is_moderator_or_admin/);
  });

  it('has no UPDATE policy on the location table at all', () => {
    expect(sql).not.toMatch(/create policy \w+ on public\.activity_locations\s+for update/);
  });

  it('gives activity_locations no admin SELECT policy', () => {
    const policies = sql.match(/create policy \w+ on public\.activity_locations[\s\S]*?\);/g) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).not.toMatch(/is_admin\(|is_moderator_or_admin\(/);
    }
  });
});

describe('the community map cannot expose an individual', () => {
  it('suppresses cells below the k-anonymity threshold', () => {
    expect(sql).toMatch(/having count\(\*\) >= public\.community_min_cell_count\(\)/);
  });

  it('uses a threshold greater than one', () => {
    const threshold = sql.match(/community_min_cell_count\(\)[\s\S]*?select (\d+)/)?.[1];
    expect(Number(threshold)).toBeGreaterThan(1);
  });

  it('refuses an oversized bounding box', () => {
    expect(sql).toMatch(/bounds_too_large/);
  });

  it('reads the coarse column, never the precise table', () => {
    const density = sql.match(
      /create or replace function public\.community_activity_density[\s\S]*?\$\$;/,
    )?.[0];

    expect(density).toBeTruthy();
    expect(density).toMatch(/a\.approx_location/);
    expect(density).not.toMatch(/activity_locations/);
  });
});

describe('the audit log cannot be rewritten or used to store secrets', () => {
  it('is append-only for every role', () => {
    expect(sql).toMatch(/audit_logs_are_append_only/);
    expect(sql).not.toMatch(/create policy \w+ on public\.audit_logs\s+for (insert|update|delete)/);
  });

  it('rejects metadata keys that would hold sensitive values', () => {
    const constraint = sql.match(/constraint audit_logs_metadata_no_secrets[\s\S]*?\)\n/)?.[0];
    expect(constraint).toBeTruthy();
    for (const key of ['password', 'token', 'latitude', 'longitude', 'email', 'phone']) {
      expect(constraint).toContain(key);
    }
  });
});

describe('emergency honesty is enforced by the schema', () => {
  it('defaults emergency_services_contacted to false', () => {
    expect(sql).toMatch(/emergency_services_contacted boolean not null default false/);
  });

  it('strips a client-supplied value in the guard trigger', () => {
    const guard = sql.match(
      /create or replace function public\.tg_emergency_events_guard[\s\S]*?\$\$;/,
    )?.[0];
    expect(guard).toMatch(/new\.emergency_services_contacted := false/);
  });
});

describe('scheduled jobs are unreachable from a browser session', () => {
  it('revokes the purge and sweep functions from authenticated users', () => {
    expect(sql).toMatch(
      /revoke all on function public\.purge_expired_location_data\(\) from public, anon, authenticated/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.sweep_missed_check_ins\(integer\) from public, anon, authenticated/,
    );
  });

  it('grants them to service_role only', () => {
    expect(sql).toMatch(
      /grant execute on function public\.purge_expired_location_data\(\) to service_role/,
    );
  });
});
