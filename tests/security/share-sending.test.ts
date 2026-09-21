/**
 * A share link IS the permission. Anyone holding one can watch a live position
 * until it expires, so the route the link travels matters as much as the token.
 *
 * The specific thing these tests defend: `https://wa.me/?text=...` is a
 * redirect hosted by Meta, so using it would send a working location token to
 * a third party's server on every share. The app uses the OS share sheet and
 * the whatsapp:// scheme instead, both of which stay on the device.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shareMessage, smsDeepLink, whatsappDeepLink } from '@/lib/share-message';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Comments explain why wa.me is avoided; an explanation is not a link. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const walk = (dir: string): string[] =>
  readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

const sourceFiles = ['app', 'features', 'components', 'lib', 'hooks', 'services']
  .flatMap(walk)
  .filter((f) => /\.tsx?$/.test(f));

describe('the token never goes through somebody else’s server', () => {
  it('uses the whatsapp:// scheme, which does not make a network request', () => {
    expect(whatsappDeepLink('hello')).toBe('whatsapp://send?text=hello');
  });

  it('never builds a wa.me or api.whatsapp.com link anywhere in the app', () => {
    const offenders = sourceFiles.filter((f) => /wa\.me|api\.whatsapp\.com/.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it('sends SMS through the device composer, not a gateway', () => {
    expect(smsDeepLink('hi there')).toBe('sms:?&body=hi%20there');
  });

  it('percent-encodes the link so the token survives intact', () => {
    const url = 'https://example.com/shared/a+b/c&d=e';
    expect(whatsappDeepLink(shareMessage(url))).toContain(encodeURIComponent(url));
  });
});

describe('what the message says', () => {
  const text = shareMessage('https://example.com/shared/tok');

  it('includes the link', () => {
    expect(text).toContain('https://example.com/shared/tok');
  });

  it('says the link expires', () => {
    expect(text.toLowerCase()).toContain('expires');
  });

  it('never claims emergency services were contacted', () => {
    expect(text.toLowerCase()).not.toMatch(/police|ambulance|emergency services|911|10111/);
  });

  it('does not read as an alarm — it is a link, not an incident', () => {
    expect(text.toLowerCase()).not.toMatch(/\b(sos|help me|danger|urgent)\b/);
  });

  it('uses the sender’s name when there is one', () => {
    expect(shareMessage('u', 'Thandi')).toContain('Thandi is sharing');
    expect(shareMessage('u')).toContain("I'm sharing");
  });
});

describe('nothing is sent without the user pressing send', () => {
  it('never auto-opens the share sheet on mount', () => {
    // Every call to the share sheet must sit inside a handler, never in an
    // effect that fires on render.
    expect(code('features/activities/SendShareLink.tsx')).not.toMatch(
      /useEffect\([\s\S]{0,200}openShareSheet/,
    );
  });

  it('never tells the user a message was sent, because it cannot know that', () => {
    expect(read('features/activities/SendShareLink.tsx')).not.toMatch(
      /'(Sent|Message sent)[^']*'/,
    );
  });

  it('keeps copy-to-clipboard available when the share sheet is missing', () => {
    expect(read('features/activities/SendShareLink.tsx')).toContain('Copy link');
  });
});
