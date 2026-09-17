'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { InlineNotice } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import {
  ACTIVITY_DURATION_PRESETS,
  ACTIVITY_TYPE_ICONS,
  ACTIVITY_TYPE_LABELS,
  CHECK_IN_PRESETS,
  SAFETY_COPY,
  VISIBILITY_OPTIONS,
} from '@/lib/constants';
import { fieldErrors, startActivitySchema } from '@/lib/validation';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useSupabase } from '@/hooks/useSupabase';
import { startActivity } from '@/services/activity.service';
import type {
  ActivityType,
  ActivityVisibility,
  EmergencyContactRow,
  GroupRow,
  ProfileRow,
} from '@/types/database';

const ACTIVITY_TYPES: ActivityType[] = [
  'running',
  'walking',
  'cycling',
  'travelling',
  'group_activity',
  'other',
];

/**
 * Starting an activity.
 *
 * The whole screen is a consent flow. Every visibility choice states its
 * consequence in full before the activity starts, the location permission is
 * requested at the last possible moment, and the default is whatever the user
 * previously chose — which itself defaults to `private`.
 */
export function StartActivityForm({
  profile,
  groups,
  contacts,
}: {
  profile: ProfileRow;
  groups: GroupRow[];
  contacts: EmergencyContactRow[];
}) {
  const db = useSupabase();
  const router = useRouter();
  const { permission, requestOnce } = useGeolocation();

  const [activityType, setActivityType] = useState<ActivityType>('walking');
  const [visibility, setVisibility] = useState<ActivityVisibility>(
    profile.default_activity_visibility,
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [checkInMinutes, setCheckInMinutes] = useState<number | null>(30);
  const [destination, setDestination] = useState('');
  const [groupId, setGroupId] = useState<string>(groups[0]?.id ?? '');
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [alsoCount, setAlsoCount] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedVisibility = useMemo(
    () => VISIBILITY_OPTIONS.find((option) => option.value === visibility),
    [visibility],
  );

  const needsLocation = visibility !== 'private' || checkInMinutes !== null;
  const sharingBlocked = !profile.location_sharing_enabled && visibility !== 'private';

  const submit = useAsyncAction(async () => {
    setErrors({});

    const parsed = startActivitySchema.safeParse({
      activityType,
      visibility,
      durationMinutes,
      destination,
      groupId: visibility === 'group' ? groupId || null : null,
      contactIds: visibility === 'trusted_contacts' ? contactIds : undefined,
      checkInMinutes,
      contributeToDensity: visibility === 'nearby' ? true : alsoCount,
    });

    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      throw new Error('validation');
    }

    // The permission prompt fires HERE — after the user has read what will be
    // shared and pressed the button, not when the screen opened.
    if (needsLocation && permission !== 'granted') {
      const reading = await requestOnce();
      if (!reading && visibility !== 'private') {
        setErrors({
          form: 'SafeCircle needs location permission to share your activity. You can start a private activity instead.',
        });
        throw new Error('permission');
      }
    }

    const result = await startActivity(db, parsed.data);
    router.push(`/activity/${result.activity.id}`);
    router.refresh();
    return result;
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="What are you doing?" />
        <div className="grid grid-cols-3 gap-2">
          {ACTIVITY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={activityType === type}
              onClick={() => setActivityType(type)}
              className={cn(
                'flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl border-2 p-2 text-xs font-medium',
                activityType === type
                  ? 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-50'
                  : 'border-subtle',
              )}
            >
              <span aria-hidden="true" className="text-xl">
                {ACTIVITY_TYPE_ICONS[type]}
              </span>
              {ACTIVITY_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Who can see you?"
          description="This is the only thing that decides who receives your location."
        />

        <div className="space-y-2">
          {VISIBILITY_OPTIONS.map((option) => {
            const disabled = !profile.location_sharing_enabled && option.value !== 'private';
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                aria-pressed={visibility === option.value}
                onClick={() => setVisibility(option.value)}
                className={cn(
                  'w-full rounded-xl border-2 p-3 text-left transition-colors disabled:opacity-50',
                  visibility === option.value
                    ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30'
                    : 'border-subtle',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{option.label}</span>
                  {option.sharesPreciseLocation ? (
                    <span className="rounded-full bg-caution-50 px-2 py-0.5 text-[11px] font-semibold text-ink-800 dark:bg-caution-500/20 dark:text-ink-100">
                      Shares precise location
                    </span>
                  ) : (
                    <span className="rounded-full bg-safe-50 px-2 py-0.5 text-[11px] font-semibold text-safe-500 dark:bg-safe-500/15">
                      No location shared
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-sm text-secondary">{option.summary}</span>
              </button>
            );
          })}
        </div>

        {selectedVisibility ? (
          <InlineNotice tone={selectedVisibility.sharesPreciseLocation ? 'caution' : 'info'}>
            {selectedVisibility.detail}
          </InlineNotice>
        ) : null}

        {sharingBlocked ? (
          <InlineNotice tone="caution">
            Location sharing is turned off for your account.{' '}
            <Link href="/profile/privacy" className="font-semibold underline">
              Turn it on in Privacy settings
            </Link>{' '}
            to use this option.
          </InlineNotice>
        ) : null}

        {visibility === 'group' ? (
          groups.length === 0 ? (
            <InlineNotice tone="caution">
              You are not an approved member of any group yet.{' '}
              <Link href="/groups" className="font-semibold underline">
                Find a group
              </Link>
            </InlineNotice>
          ) : (
            <div className="mt-3">
              <Select
                label="Which group?"
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
                error={errors.groupId}
                options={groups.map((group) => ({ value: group.id, label: group.name }))}
              />
            </div>
          )
        ) : null}

        {visibility === 'trusted_contacts' ? (
          contacts.length === 0 ? (
            <InlineNotice tone="caution">
              You have not added any trusted contacts yet.{' '}
              <Link href="/profile/contacts" className="font-semibold underline">
                Add a contact
              </Link>
            </InlineNotice>
          ) : (
            <fieldset className="mt-3">
              <legend className="mb-2 text-sm font-medium">Who should see this activity?</legend>
              <div className="space-y-1.5">
                {contacts.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex min-h-11 items-center gap-3 rounded-xl border border-subtle px-3"
                  >
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[var(--color-brand-600)]"
                      checked={contactIds.includes(contact.id)}
                      onChange={(event) =>
                        setContactIds((current) =>
                          event.target.checked
                            ? [...current, contact.id]
                            : current.filter((id) => id !== contact.id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{contact.name}</span>
                      {contact.relationship ? (
                        <span className="block truncate text-xs text-secondary">
                          {contact.relationship}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
              {errors.contactIds ? (
                <p role="alert" className="mt-2 text-sm font-medium text-alert-600">
                  {errors.contactIds}
                </p>
              ) : null}
            </fieldset>
          )
        ) : null}

        {visibility === 'group' || visibility === 'trusted_contacts' ? (
          <label className="mt-3 flex items-start gap-3 rounded-xl border border-subtle p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 accent-[var(--color-brand-600)]"
              checked={alsoCount}
              onChange={(event) => setAlsoCount(event.target.checked)}
            />
            <span className="text-sm">
              <span className="font-medium">Also add me to the nearby count</span>
              <span className="mt-0.5 block text-secondary">
                Adds +1 to an approximate area total. Still no coordinates for anyone.
              </span>
            </span>
          </label>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="How long?" />
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_DURATION_PRESETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              aria-pressed={durationMinutes === minutes}
              onClick={() => setDurationMinutes(minutes)}
              className={cn(
                'min-h-11 rounded-xl border-2 px-4 text-sm font-semibold',
                durationMinutes === minutes
                  ? 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-50'
                  : 'border-subtle',
              )}
            >
              {minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Input
            label="Custom duration (minutes)"
            type="number"
            inputMode="numeric"
            min={5}
            max={720}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value) || 5)}
            error={errors.durationMinutes}
          />
        </div>

        <div className="mt-3">
          <Input
            label="Where are you heading? (optional)"
            hint="A label only, like “Home via Main Road”. SafeCircle never stores a destination address."
            value={destination}
            maxLength={200}
            onChange={(event) => setDestination(event.target.value)}
            error={errors.destination}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Check in on me"
          description="We will ask “Are you safe?” when the timer runs out."
        />
        <div className="flex flex-wrap gap-2">
          {CHECK_IN_PRESETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              aria-pressed={checkInMinutes === minutes}
              onClick={() => setCheckInMinutes(minutes)}
              className={cn(
                'min-h-11 rounded-xl border-2 px-4 text-sm font-semibold',
                checkInMinutes === minutes
                  ? 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-50'
                  : 'border-subtle',
              )}
            >
              {minutes} min
            </button>
          ))}
          <button
            type="button"
            aria-pressed={checkInMinutes === null}
            onClick={() => setCheckInMinutes(null)}
            className={cn(
              'min-h-11 rounded-xl border-2 px-4 text-sm font-semibold',
              checkInMinutes === null
                ? 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-50'
                : 'border-subtle',
            )}
          >
            No check-in
          </button>
        </div>

        {checkInMinutes !== null ? (
          <>
            <div className="mt-3">
              <Input
                label="Custom check-in (minutes)"
                type="number"
                inputMode="numeric"
                min={5}
                max={durationMinutes}
                value={checkInMinutes}
                onChange={(event) => setCheckInMinutes(Number(event.target.value) || 5)}
                error={errors.checkInMinutes}
              />
            </div>
            <InlineNotice tone="info">{SAFETY_COPY.contactsAlerted}</InlineNotice>
          </>
        ) : null}
      </Card>

      <InlineNotice tone="caution">{SAFETY_COPY.backgroundLimitation}</InlineNotice>

      {errors.form || submit.error ? (
        <p role="alert" className="px-1 text-sm font-medium text-alert-600">
          {errors.form ?? submit.error}
        </p>
      ) : null}

      <Button
        size="lg"
        fullWidth
        loading={submit.pending}
        disabled={sharingBlocked}
        onClick={() => void submit.run()}
      >
        Start activity
      </Button>

      <p className="px-1 pb-2 text-center text-xs text-secondary">
        You can end this activity at any time. {SAFETY_COPY.onlyAuthorised}
      </p>
    </div>
  );
}
