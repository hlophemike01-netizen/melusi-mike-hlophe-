import { describe, expect, it } from 'vitest';
import {
  approximateAreaSchema,
  createGroupSchema,
  fieldErrors,
  locationPointSchema,
  passwordSchema,
  phoneSchema,
  reportSchema,
  startActivitySchema,
  trustedContactSchema,
} from '@/lib/validation';

describe('phoneSchema', () => {
  it('accepts E.164 numbers', () => {
    expect(phoneSchema.safeParse('+27821234567').success).toBe(true);
    expect(phoneSchema.safeParse('+14155550123').success).toBe(true);
  });

  it('rejects anything the database CHECK constraint would also reject', () => {
    for (const invalid of ['0821234567', '+0821234567', 'not a number', '+1', '']) {
      expect(phoneSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("rejects an injection attempt rather than passing it to the query layer", () => {
    expect(phoneSchema.safeParse("+27821234567'; DROP TABLE profiles; --").success).toBe(false);
  });
});

describe('approximateAreaSchema', () => {
  it('accepts a suburb label', () => {
    expect(approximateAreaSchema.safeParse('Sea Point, Cape Town').success).toBe(true);
  });

  it('rejects coordinates, which would defeat the point of a coarse field', () => {
    const result = approximateAreaSchema.safeParse('-33.92487, 18.42406');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/area name/i);
    }
  });

  it('rejects a street address, which is shown to other members', () => {
    expect(approximateAreaSchema.safeParse('42 Long Street').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('requires enough length to matter', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('correct horse battery').success).toBe(true);
  });
});

describe('startActivitySchema', () => {
  const base = {
    activityType: 'running' as const,
    visibility: 'private' as const,
    durationMinutes: 60,
    contributeToDensity: false,
  };

  it('accepts a private activity with no sharing targets', () => {
    expect(startActivitySchema.safeParse(base).success).toBe(true);
  });

  it('refuses group visibility without a group', () => {
    const result = startActivitySchema.safeParse({ ...base, visibility: 'group' });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).groupId).toBeTruthy();
  });

  it('refuses trusted-contact visibility with nobody selected', () => {
    const result = startActivitySchema.safeParse({
      ...base,
      visibility: 'trusted_contacts',
      contactIds: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).contactIds).toBeTruthy();
  });

  it('accepts trusted-contact visibility once a contact is chosen', () => {
    expect(
      startActivitySchema.safeParse({
        ...base,
        visibility: 'trusted_contacts',
        contactIds: ['11111111-1111-1111-1111-111111111111'],
      }).success,
    ).toBe(true);
  });

  it('caps a session at 12 hours so it cannot become continuous tracking', () => {
    expect(startActivitySchema.safeParse({ ...base, durationMinutes: 1440 }).success).toBe(false);
    expect(startActivitySchema.safeParse({ ...base, durationMinutes: 720 }).success).toBe(true);
  });

  it('refuses a check-in scheduled after the activity ends', () => {
    const result = startActivitySchema.safeParse({
      ...base,
      durationMinutes: 30,
      checkInMinutes: 60,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).checkInMinutes).toBeTruthy();
  });
});

describe('locationPointSchema', () => {
  it('accepts a real reading', () => {
    expect(
      locationPointSchema.safeParse({ latitude: -33.9249, longitude: 18.4241, accuracy: 12 })
        .success,
    ).toBe(true);
  });

  it('rejects out-of-range coordinates', () => {
    expect(locationPointSchema.safeParse({ latitude: 91, longitude: 0 }).success).toBe(false);
    expect(locationPointSchema.safeParse({ latitude: 0, longitude: 181 }).success).toBe(false);
  });

  it('rejects a non-numeric coordinate rather than coercing it', () => {
    expect(
      locationPointSchema.safeParse({ latitude: '-33.9' as unknown, longitude: 18.4 }).success,
    ).toBe(false);
  });
});

describe('reportSchema', () => {
  it('requires a usable description', () => {
    expect(
      reportSchema.safeParse({ category: 'harassment', description: 'bad' }).success,
    ).toBe(false);
  });

  it('accepts a described report', () => {
    expect(
      reportSchema.safeParse({
        category: 'harassment',
        description: 'Sent repeated unwanted messages after I left the group.',
        reportedUserId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(true);
  });
});

describe('trustedContactSchema and createGroupSchema', () => {
  it('requires a valid phone for a trusted contact', () => {
    expect(
      trustedContactSchema.safeParse({
        name: 'Carol',
        phone: '0821234567',
        permissionLevel: 'emergency_only',
      }).success,
    ).toBe(false);
  });

  it('refuses a group whose area field is a street address', () => {
    expect(
      createGroupSchema.safeParse({
        name: 'Evening Walkers',
        activityType: 'walking',
        visibility: 'public',
        approximateArea: '42 Long Street',
        requiresApproval: true,
      }).success,
    ).toBe(false);
  });
});
