/**
 * Error handling.
 *
 * The rule: a database or network error never reaches the user verbatim. It is
 * mapped to a stable code with a plain-English message; the original is logged
 * server-side only. This prevents stack traces, table names, constraint names
 * and internal IDs from leaking through the UI.
 */

export type AppErrorCode =
  | 'unauthenticated'
  | 'not_authorised'
  | 'not_found'
  | 'validation_failed'
  | 'conflict'
  | 'rate_limited'
  | 'location_sharing_disabled'
  | 'location_permission_denied'
  | 'location_unavailable'
  | 'already_active'
  | 'unavailable'
  | 'unknown';

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Safe to render in the UI. */
  readonly userMessage: string;
  readonly status: number;

  constructor(code: AppErrorCode, userMessage: string, status = 400, cause?: unknown) {
    super(userMessage, { cause });
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    this.status = status;
  }
}

/**
 * Postgres/PostgREST error codes and our own `raise exception` names, mapped to
 * something a person can act on. Anything unrecognised becomes a generic
 * message — we never interpolate the raw error into user-facing text.
 */
const DB_ERROR_MAP: Record<string, { code: AppErrorCode; message: string; status: number }> = {
  location_sharing_disabled: {
    code: 'location_sharing_disabled',
    message:
      'Turn on location sharing in Privacy settings before choosing a sharing option. Location sharing is optional.',
    status: 400,
  },
  not_authorised: {
    code: 'not_authorised',
    message: 'You do not have permission to do that.',
    status: 403,
  },
  not_a_group_member: {
    code: 'not_authorised',
    message: 'You need to be an approved member of that group before you can share with it.',
    status: 403,
  },
  group_is_invite_only: {
    code: 'not_authorised',
    message: 'This group only accepts members who have been invited.',
    status: 403,
  },
  insufficient_group_permission: {
    code: 'not_authorised',
    message: 'Only a group owner or admin can do that.',
    status: 403,
  },
  members_may_only_leave: {
    code: 'not_authorised',
    message: 'You can leave this group, but only a group admin can change your membership.',
    status: 403,
  },
  owner_role_is_not_assignable: {
    code: 'not_authorised',
    message: 'Group ownership is transferred from group settings, not from the member list.',
    status: 403,
  },
  activity_not_active: {
    code: 'conflict',
    message: 'That activity has already finished.',
    status: 409,
  },
  activity_not_found: { code: 'not_found', message: 'We could not find that activity.', status: 404 },
  group_not_found: { code: 'not_found', message: 'We could not find that group.', status: 404 },
  report_not_found: { code: 'not_found', message: 'We could not find that report.', status: 404 },
  user_not_found: { code: 'not_found', message: 'We could not find that account.', status: 404 },
  share_unavailable: {
    code: 'not_found',
    message: 'This link has expired or was turned off by the person who shared it.',
    status: 404,
  },
  report_rate_limit_exceeded: {
    code: 'rate_limited',
    message: 'You have submitted several reports recently. Please try again later.',
    status: 429,
  },
  duplicate_open_report: {
    code: 'conflict',
    message: 'You already have an open report about this. Our team is reviewing it.',
    status: 409,
  },
  bounds_too_large: {
    code: 'validation_failed',
    message: 'Zoom in to see community activity in this area.',
    status: 400,
  },
  cannot_suspend_self: {
    code: 'validation_failed',
    message: 'You cannot suspend your own account.',
    status: 400,
  },
  reason_required: {
    code: 'validation_failed',
    message: 'Please give a reason of at least five characters.',
    status: 400,
  },
  activities_one_active_per_user: {
    code: 'already_active',
    message: 'You already have an activity running. End it before starting another.',
    status: 409,
  },
  // PostgREST / Postgres SQLSTATEs
  '23505': { code: 'conflict', message: 'That already exists.', status: 409 },
  '23503': { code: 'validation_failed', message: 'Some of the details you entered are not valid.', status: 400 },
  '23514': { code: 'validation_failed', message: 'Some of the details you entered are not valid.', status: 400 },
  '42501': { code: 'not_authorised', message: 'You do not have permission to do that.', status: 403 },
  '42P01': { code: 'unavailable', message: 'Something went wrong on our side. Please try again.', status: 500 },
  PGRST301: { code: 'unauthenticated', message: 'Please sign in again.', status: 401 },
};

interface SupabaseLikeError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

function isSupabaseLikeError(value: unknown): value is SupabaseLikeError {
  return typeof value === 'object' && value !== null && ('message' in value || 'code' in value);
}

/**
 * Turns anything thrown by Supabase into an AppError. Matching is by the named
 * exception we raise in SQL, then by SQLSTATE, then a generic fallback.
 */
export function toAppError(error: unknown, fallbackMessage = 'Something went wrong. Please try again.'): AppError {
  if (error instanceof AppError) return error;

  if (isSupabaseLikeError(error)) {
    const raw = `${error.message ?? ''}`;

    for (const [key, mapped] of Object.entries(DB_ERROR_MAP)) {
      if (raw.includes(key) || error.code === key) {
        return new AppError(mapped.code, mapped.message, mapped.status, error);
      }
    }

    if (raw.includes('row-level security') || raw.includes('permission denied')) {
      return new AppError('not_authorised', 'You do not have permission to do that.', 403, error);
    }
    if (raw.includes('JWT') || raw.includes('session')) {
      return new AppError('unauthenticated', 'Your session has expired. Please sign in again.', 401, error);
    }
  }

  return new AppError('unknown', fallbackMessage, 500, error);
}

/**
 * Logs the real error where only operators can see it, and returns the safe
 * version for the UI. Call this at every service boundary.
 */
export function handleServiceError(context: string, error: unknown, fallbackMessage?: string): AppError {
  const appError = toAppError(error, fallbackMessage);
  if (appError.code === 'unknown' || appError.status >= 500) {
    console.error(`[safecircle] ${context}:`, error);
  }
  return appError;
}

/** Everything the client is allowed to see about a failure. */
export function serialiseError(error: unknown): { error: { code: AppErrorCode; message: string } } {
  const appError = toAppError(error);
  return { error: { code: appError.code, message: appError.userMessage } };
}
