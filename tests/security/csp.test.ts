/**
 * The Content-Security-Policy is the last line that still holds after an XSS.
 * On this product an injected script does not deface a page — it reads a live
 * position and a list of trusted contacts. These tests exist so the policy
 * cannot be quietly loosened back to 'unsafe-inline' by a later change.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCsp, generateNonce } from '@/lib/csp';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Strips comments. Several of these assertions read files that *explain* the
 * policy in prose; an explanation of `Content-Security-Policy` is not the
 * header being set, and the assertion is about what the code does.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const directive = (csp: string, name: string): string =>
  csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

describe('script-src', () => {
  const prod = buildCsp('TESTNONCE', false);

  it("never allows 'unsafe-inline' in production", () => {
    expect(directive(prod, 'script-src')).not.toContain("'unsafe-inline'");
  });

  it("never allows 'unsafe-eval' in production", () => {
    expect(directive(prod, 'script-src')).not.toContain("'unsafe-eval'");
  });

  it('carries the nonce it was given', () => {
    expect(directive(prod, 'script-src')).toContain("'nonce-TESTNONCE'");
  });

  it("uses 'strict-dynamic' so a stray host allowlist cannot reopen the hole", () => {
    expect(directive(prod, 'script-src')).toContain("'strict-dynamic'");
  });

  it("allows 'unsafe-eval' in development only, for hot reload", () => {
    expect(directive(buildCsp('N', true), 'script-src')).toContain("'unsafe-eval'");
  });

  it('allows no third-party script origin at all', () => {
    expect(directive(prod, 'script-src')).not.toMatch(/https?:\/\//);
  });
});

describe('the rest of the policy', () => {
  const prod = buildCsp('N', false);

  it('refuses to be framed', () => {
    expect(prod).toContain("frame-ancestors 'none'");
  });

  it('blocks plugins and locks the base URI and form targets', () => {
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("base-uri 'self'");
    expect(prod).toContain("form-action 'self'");
  });
});

describe('nonces', () => {
  it('are different every time', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateNonce()));
    expect(seen.size).toBe(200);
  });

  it('are long enough to be unguessable', () => {
    // 16 random bytes. Anything shorter can be brute-forced by an attacker who
    // can make the page render repeatedly.
    expect(atob(generateNonce())).toHaveLength(16);
  });
});

describe('where the policy is set', () => {
  it('is not baked into next.config.ts, where the nonce would be a constant', () => {
    expect(code('next.config.ts')).not.toContain('Content-Security-Policy');
  });

  it('is attached per request by the proxy', () => {
    const mw = code('lib/supabase/middleware.ts');
    expect(mw).toContain('generateNonce()');
    // Next reads the nonce off the REQUEST headers to stamp its own bootstrap
    // script. Setting it only on the response leaves the page unable to boot.
    expect(mw).toContain("headers.set('Content-Security-Policy', csp)");
    expect(mw).toContain("headers.set('x-nonce', nonce)");
  });

  it('renders every page per request, because a prerendered page gets no nonce', () => {
    expect(code('app/layout.tsx')).toContain("export const dynamic = 'force-dynamic'");
  });

  it('still sets the request-independent headers statically', () => {
    const config = read('next.config.ts');
    for (const header of [
      'Strict-Transport-Security',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      expect(config).toContain(header);
    }
  });
});

describe('no page ships its own inline script', () => {
  const walk = (dir: string): string[] =>
    readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );

  it('never uses dangerouslySetInnerHTML, which a nonce cannot cover', () => {
    const offenders = [...walk('app'), ...walk('features'), ...walk('components')]
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => read(f).includes('dangerouslySetInnerHTML'));
    expect(offenders).toEqual([]);
  });
});
