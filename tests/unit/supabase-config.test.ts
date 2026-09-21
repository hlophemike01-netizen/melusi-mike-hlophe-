/**
 * A misconfigured deployment must say what is wrong.
 *
 * These cases are not hypothetical. A real deploy of this app served a blank
 * "Something went wrong" page because the project URL had a single character
 * missing, and nothing on the page or in the console said so.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const REAL_REF = 'kzuvegwktrfsdnectstj'; // 20 characters, as every Supabase ref is
const URL_FOR = (ref: string) => `https://${ref}.supabase.co`;

/** Reloads lib/env with a given environment, since publicEnv is read at import. */
async function withEnv(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [name, value] of Object.entries(vars)) {
    if (value === undefined) vi.stubEnv(name, '');
    else vi.stubEnv(name, value);
  }
  return import('@/lib/env');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('accepting both generations of key', () => {
  it('takes the new publishable key', async () => {
    const env = await withEnv({
      NEXT_PUBLIC_SUPABASE_URL: URL_FOR(REAL_REF),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc123',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    });
    expect(env.publicEnv.supabaseKey).toBe('sb_publishable_abc123');
    expect(env.supabaseConfigProblem()).toBeNull();
  });

  it('still takes a legacy anon key, so an existing deployment keeps working', async () => {
    const env = await withEnv({
      NEXT_PUBLIC_SUPABASE_URL: URL_FOR(REAL_REF),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJlegacy',
    });
    expect(env.publicEnv.supabaseKey).toBe('eyJlegacy');
  });

  it('prefers the new name when both are present', async () => {
    const env = await withEnv({
      NEXT_PUBLIC_SUPABASE_URL: URL_FOR(REAL_REF),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_new',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJold',
    });
    expect(env.publicEnv.supabaseKey).toBe('sb_publishable_new');
  });
});

describe('naming the problem', () => {
  it('says so when nothing is configured, and why a rebuild is needed', async () => {
    const env = await withEnv({
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    });
    const problem = env.supabaseConfigProblem();
    expect(problem).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(problem).toContain('build time');
  });

  it('catches the typo that actually happened: a 19-character reference', async () => {
    const env = await withEnv({
      NEXT_PUBLIC_SUPABASE_URL: URL_FOR('kzuvegwkrfdsdnectsj'),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc123',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    });
    const problem = env.supabaseConfigProblem();
    expect(problem).toContain('19 characters');
    expect(problem).toContain('typo');
  });

  it('catches a URL and key from two different projects', async () => {
    // A real anon key for REAL_REF, against a URL for a different project.
    const payload = Buffer.from(JSON.stringify({ ref: REAL_REF, role: 'anon' })).toString('base64');
    const env = await withEnv({
      NEXT_PUBLIC_SUPABASE_URL: URL_FOR('aaaaaaaaaaaaaaaaaaaa'),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    });
    const problem = env.supabaseConfigProblem();
    expect(problem).toContain(REAL_REF);
    expect(problem).toContain('different project');
  });

  it('rejects a URL that is not a URL', async () => {
    const env = await withEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'kzuvegwktrfsdnectstj.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc123',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    });
    expect(env.supabaseConfigProblem()).toContain('not a valid URL');
  });

  it('never puts the key itself in a message shown to a visitor', async () => {
    const env = await withEnv({
      NEXT_PUBLIC_SUPABASE_URL: URL_FOR('tooshort'),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_SENTINEL',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    });
    expect(env.supabaseConfigProblem()).not.toContain('SENTINEL');
  });

  it('leaves a self-hosted URL alone rather than guessing', async () => {
    const env = await withEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.mwhite.co.za',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc123',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    });
    expect(env.supabaseConfigProblem()).toBeNull();
  });
});
