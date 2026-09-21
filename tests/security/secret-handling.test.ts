/**
 * Secret-handling checks.
 *
 * Source-level, because the failure mode is a single bad import that would be
 * invisible until the bundle shipped.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'coverage', 'tests']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const sourceFiles = walk(ROOT).map((file) => ({
  path: relative(ROOT, file),
  content: readFileSync(file, 'utf8'),
}));

const clientFiles = sourceFiles.filter((file) => file.content.includes("'use client'"));

describe('the service-role key never reaches the browser', () => {
  it('is read in exactly one module', () => {
    const readers = sourceFiles.filter(
      (file) =>
        file.content.includes('SUPABASE_SERVICE_ROLE_KEY') && !file.path.startsWith('lib/env.ts'),
    );

    expect(readers.map((file) => file.path)).toEqual([]);
  });

  it("is only exposed through lib/env's server-guarded accessor", () => {
    const env = sourceFiles.find((file) => file.path === 'lib/env.ts');
    expect(env?.content).toMatch(/serverEnv\(\) was called in the browser/);
    expect(env?.content).not.toMatch(/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('is never prefixed NEXT_PUBLIC_, which would inline it into the bundle', () => {
    for (const file of sourceFiles) {
      expect(file.content).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/);
      expect(file.content).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SECRET/);
    }
  });

  it('lives behind a server-only import in every module that can create it', () => {
    const admin = sourceFiles.find((file) => file.path === 'lib/supabase/admin.ts');
    expect(admin?.content.startsWith("import 'server-only';")).toBe(true);

    const cronAuth = sourceFiles.find((file) => file.path === 'lib/cron-auth.ts');
    expect(cronAuth?.content.startsWith("import 'server-only';")).toBe(true);
  });
});

describe('client components never reach a privileged module', () => {
  it('no client component imports the admin Supabase client', () => {
    const offenders = clientFiles.filter((file) =>
      /from '@\/lib\/supabase\/(admin|server)'/.test(file.content),
    );
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it('no client component imports serverEnv or the cron auth helper', () => {
    const offenders = clientFiles.filter(
      (file) => /serverEnv|requireServiceRoleKey|requireCronSecret/.test(file.content) ||
        /from '@\/lib\/cron-auth'/.test(file.content),
    );
    expect(offenders.map((file) => file.path)).toEqual([]);
  });
});

describe('no credentials are committed', () => {
  it('has an .env.example with no filled-in values', () => {
    const example = readFileSync(join(ROOT, '.env.example'), 'utf8');

    for (const line of example.split('\n')) {
      if (!line.includes('=') || line.trim().startsWith('#')) continue;
      const [key, ...rest] = line.split('=');
      const value = rest.join('=').trim();

      // Only non-secret local defaults may carry a value.
      if (key && ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_MAPBOX_STYLE'].includes(key.trim())) continue;
      expect(value).toBe('');
    }
  });

  it('gitignores every .env variant', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^\.env\.local$/m);
  });

  it('contains no key-shaped literals in source', () => {
    for (const file of sourceFiles) {
      // Supabase service keys are JWTs beginning eyJ; Mapbox secret tokens sk.
      expect(file.content, `${file.path} contains a JWT-shaped literal`).not.toMatch(
        /['"]eyJ[A-Za-z0-9_-]{20,}/,
      );
      expect(file.content, `${file.path} contains a Mapbox secret token`).not.toMatch(
        /['"]sk\.[A-Za-z0-9_-]{20,}/,
      );
    }
  });
});

describe('the cron secret is compared in constant time', () => {
  it('uses timingSafeEqual rather than ===', () => {
    const cronAuth = sourceFiles.find((file) => file.path === 'lib/cron-auth.ts');
    expect(cronAuth?.content).toMatch(/timingSafeEqual/);
    expect(cronAuth?.content).not.toMatch(/provided === expected|expected === provided/);
  });
});

describe('the service worker does not cache sensitive responses', () => {
  const sw = readFileSync(join(ROOT, 'public', 'sw.js'), 'utf8');

  it('skips API routes, auth callbacks and share links', () => {
    expect(sw).toMatch(/url\.pathname\.startsWith\('\/api\/'\)/);
    expect(sw).toMatch(/url\.pathname\.startsWith\('\/auth\/'\)/);
    expect(sw).toMatch(/url\.pathname\.startsWith\('\/shared\/'\)/);
  });

  it('never intercepts cross-origin requests, so Supabase responses are untouched', () => {
    expect(sw).toMatch(/if \(url\.origin !== self\.location\.origin\) return;/);
  });

  it('caches only GET requests', () => {
    expect(sw).toMatch(/if \(request\.method !== 'GET'\) return;/);
  });
});
