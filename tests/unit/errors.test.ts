import { describe, expect, it, vi } from 'vitest';
import { AppError, handleServiceError, serialiseError, toAppError } from '@/lib/errors';

describe('toAppError', () => {
  it('maps a named SQL exception to a message a person can act on', () => {
    const error = toAppError({ message: 'location_sharing_disabled' });
    expect(error.code).toBe('location_sharing_disabled');
    expect(error.userMessage).toMatch(/Privacy settings/i);
  });

  it('maps an RLS rejection to a permission message', () => {
    const error = toAppError({
      message: 'new row violates row-level security policy for table "activity_locations"',
    });
    expect(error.code).toBe('not_authorised');
    expect(error.status).toBe(403);
  });

  it('maps a unique-violation SQLSTATE to a conflict', () => {
    expect(toAppError({ code: '23505', message: 'duplicate key' }).code).toBe('conflict');
  });

  it('passes an existing AppError through unchanged', () => {
    const original = new AppError('not_found', 'Nothing here.', 404);
    expect(toAppError(original)).toBe(original);
  });
});

describe('user-facing messages never leak internals', () => {
  const leaky = [
    {
      message:
        'relation "public.activity_locations" does not exist at character 15\n  at Query.run (/app/node_modules/pg/lib/query.js:12:3)',
      code: '42P01',
    },
    { message: 'password authentication failed for user "postgres"' },
    { message: 'duplicate key value violates unique constraint "profiles_pkey"', code: '23505' },
    new Error('connect ECONNREFUSED 10.0.0.5:5432'),
  ];

  it.each(leaky)('sanitises %#', (raw) => {
    const message = toAppError(raw).userMessage;

    for (const forbidden of [
      'activity_locations',
      'node_modules',
      'postgres',
      'profiles_pkey',
      'ECONNREFUSED',
      '5432',
      'at Query.run',
    ]) {
      expect(message).not.toContain(forbidden);
    }
  });

  it('serialiseError exposes only a code and a message', () => {
    const payload = serialiseError({ message: 'relation "profiles" does not exist', code: '42P01' });
    expect(Object.keys(payload)).toEqual(['error']);
    expect(Object.keys(payload.error).sort()).toEqual(['code', 'message']);
    expect(payload.error.message).not.toContain('profiles');
  });
});

describe('handleServiceError', () => {
  it('logs the original server-side but returns only the safe version', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const raw = { message: 'relation "profiles" does not exist', code: '42P01' };

    const safe = handleServiceError('getMyProfile', raw);

    expect(spy).toHaveBeenCalled();
    expect(safe.userMessage).not.toContain('profiles');
  });

  it('does not log an ordinary authorisation refusal as an incident', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    handleServiceError('getGroup', { message: 'permission denied for table groups' });
    expect(spy).not.toHaveBeenCalled();
  });
});
