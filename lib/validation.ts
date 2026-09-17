/**
 * Input validation.
 *
 * Every user-supplied value crosses one of these schemas before it reaches a
 * query. This is the first of three layers — the other two are the database's
 * CHECK constraints and its RLS policies. Client-side validation is for
 * helpful errors, never for safety.
 */

import { z } from 'zod';

/** E.164. Matches the `profiles_phone_format` CHECK constraint exactly. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9][0-9]{6,14}$/, 'Enter a phone number in international format, for example +27821234567.');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')
  .max(254);

/**
 * Passwords: length does more for safety than composition rules, and
 * composition rules push people towards predictable substitutions.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters. A short phrase you will remember works well.')
  .max(128, 'That password is too long.');

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Your name needs at least 2 characters.')
  .max(60, 'Please keep your name under 60 characters.');

/**
 * Free-text area label. Rejects anything that looks like a street address or a
 * coordinate pair, because this field is shown to other people.
 */
export const approximateAreaSchema = z
  .string()
  .trim()
  .max(120, 'Please keep this short, for example "Sea Point, Cape Town".')
  .refine(
    (value) => !/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/.test(value),
    'Please use an area name rather than coordinates.',
  )
  .refine(
    (value) => !/^\s*\d+[a-z]?\s+\w+/i.test(value),
    'Please use a suburb or area name rather than a street address.',
  );

export const activityTypeSchema = z.enum([
  'running',
  'walking',
  'cycling',
  'travelling',
  'group_activity',
  'other',
]);

export const activityVisibilitySchema = z.enum(['private', 'nearby', 'group', 'trusted_contacts']);

export const contactPermissionSchema = z.enum(['emergency_only', 'activity_only', 'always_when_enabled']);

export const reportCategorySchema = z.enum([
  'harassment',
  'threatening_behaviour',
  'fake_profile',
  'abuse',
  'spam',
  'suspicious_behaviour',
  'other',
]);

/* ------------------------------------------------------------------------ */

export const signUpSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const resetPasswordSchema = z.object({ email: emailSchema });

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'The two passwords do not match.',
    path: ['confirmPassword'],
  });

export const profileUpdateSchema = z.object({
  displayName: displayNameSchema,
  phone: phoneSchema.optional().or(z.literal('')),
  approximateArea: approximateAreaSchema.optional().or(z.literal('')),
});

export const privacySettingsSchema = z.object({
  locationSharingEnabled: z.boolean(),
  discoverableInGroups: z.boolean(),
  defaultActivityVisibility: activityVisibilitySchema,
});

/**
 * Starting an activity.
 *
 * Duration is capped at 12 hours here and 24 in the database. A "safety
 * session" that runs for a day is tracking, not a session.
 */
export const startActivitySchema = z
  .object({
    activityType: activityTypeSchema,
    visibility: activityVisibilitySchema,
    durationMinutes: z
      .number()
      .int()
      .min(5, 'Choose at least 5 minutes.')
      .max(720, 'An activity can run for at most 12 hours.'),
    destination: z.string().trim().max(200).optional().or(z.literal('')),
    title: z.string().trim().max(120).optional().or(z.literal('')),
    groupId: z.string().uuid().optional().nullable(),
    contactIds: z.array(z.string().uuid()).max(20).optional(),
    checkInMinutes: z.number().int().min(5).max(720).nullable().optional(),
    contributeToDensity: z.boolean().default(false),
  })
  .refine((data) => data.visibility !== 'group' || Boolean(data.groupId), {
    message: 'Choose which group to share with.',
    path: ['groupId'],
  })
  .refine(
    (data) => data.visibility !== 'trusted_contacts' || (data.contactIds?.length ?? 0) > 0,
    { message: 'Choose at least one trusted contact to share with.', path: ['contactIds'] },
  )
  .refine((data) => data.checkInMinutes == null || data.checkInMinutes <= data.durationMinutes, {
    message: 'The check-in cannot be later than the end of the activity.',
    path: ['checkInMinutes'],
  });

/** A GPS reading from the browser, before it is trusted. */
export const locationPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).optional().nullable(),
  heading: z.number().min(0).max(359.999).optional().nullable(),
  speed: z.number().min(0).max(1000).optional().nullable(),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(3, 'Give the group a name of at least 3 characters.').max(80),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  activityType: activityTypeSchema,
  approximateArea: approximateAreaSchema.optional().or(z.literal('')),
  visibility: z.enum(['public', 'private', 'invite_only']),
  requiresApproval: z.boolean().default(true),
});

export const trustedContactSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(80),
  phone: phoneSchema,
  relationship: z.string().trim().max(60).optional().or(z.literal('')),
  permissionLevel: contactPermissionSchema,
});

export const reportSchema = z.object({
  subjectType: z.enum(['user', 'group', 'activity']).default('user'),
  reportedUserId: z.string().uuid().optional().nullable(),
  reportedGroupId: z.string().uuid().optional().nullable(),
  category: reportCategorySchema,
  description: z
    .string()
    .trim()
    .min(10, 'Please describe what happened in at least 10 characters.')
    .max(2000, 'Please keep this under 2000 characters.'),
});

export const mapBoundsSchema = z.object({
  minLng: z.number().min(-180).max(180),
  minLat: z.number().min(-90).max(90),
  maxLng: z.number().min(-180).max(180),
  maxLat: z.number().min(-90).max(90),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type StartActivityInput = z.infer<typeof startActivitySchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type TrustedContactInput = z.infer<typeof trustedContactSchema>;
export type ReportInput = z.infer<typeof reportSchema>;
export type LocationPointInput = z.infer<typeof locationPointSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PrivacySettingsInput = z.infer<typeof privacySettingsSchema>;

/**
 * Formats a ZodError into `{ field: message }` for form rendering. Only the
 * first message per field is kept — a wall of errors helps nobody.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!(key in result)) result[key] = issue.message;
  }
  return result;
}
