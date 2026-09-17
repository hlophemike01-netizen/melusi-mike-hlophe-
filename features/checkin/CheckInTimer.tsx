'use client';

import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { InlineNotice } from '@/components/ui/States';
import { CHECK_IN_PRESETS, SAFETY_COPY } from '@/lib/constants';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useCountdown } from '@/hooks/useCountdown';
import { useSupabase } from '@/hooks/useSupabase';
import { respondNeedHelp, respondSafe, scheduleCheckIn } from '@/services/checkin.service';
import type { CheckInRow } from '@/types/database';

/**
 * The check-in timer and the "Are you safe?" prompt.
 *
 * Once the timer expires the two responses are equally prominent and equally
 * easy to hit. Making "I'm safe" the bigger, greener, easier button would nudge
 * people towards dismissing a prompt they should be answering honestly.
 */
export function CheckInTimer({
  activityId,
  checkIn,
  onChanged,
  onNeedHelp,
}: {
  activityId: string;
  checkIn: CheckInRow | null;
  onChanged: (next: CheckInRow | null) => void;
  onNeedHelp: () => void;
}) {
  const db = useSupabase();
  const countdown = useCountdown(checkIn?.status === 'scheduled' ? checkIn.due_at : null);

  // Derived, not mirrored in state: the prompt is showing exactly while a
  // scheduled check-in is past due. Responding changes `checkIn`, which clears
  // the prompt on its own — there is no second source of truth to get stuck.
  const prompting = checkIn?.status === 'scheduled' && countdown.expired;

  const safe = useAsyncAction(async (nextInterval?: number) => {
    if (!checkIn) return null;
    const next = await respondSafe(db, checkIn.id, nextInterval);
    onChanged(next);
    return next;
  });

  const help = useAsyncAction(async () => {
    if (!checkIn) return null;
    await respondNeedHelp(db, checkIn.id);
    onChanged(null);
    onNeedHelp();
    return null;
  });

  const schedule = useAsyncAction(async (minutes: number) => {
    const next = await scheduleCheckIn(db, activityId, minutes);
    onChanged(next);
    return next;
  });

  if (prompting && checkIn) {
    return (
      <Card className="border-2 border-caution-500/60 bg-caution-50 dark:bg-caution-500/10">
        <h2 className="text-center text-2xl font-bold">Are you safe?</h2>
        <p className="mt-1.5 text-center text-sm text-secondary">
          Your check-in timer has finished. Let us know how you are.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Button
            size="lg"
            variant="safe"
            loading={safe.pending}
            onClick={() => void safe.run(undefined)}
          >
            I&apos;M SAFE
          </Button>
          <Button size="lg" variant="danger" loading={help.pending} onClick={() => void help.run()}>
            I NEED HELP
          </Button>
        </div>

        <div className="mt-4 border-t border-caution-500/30 pt-3">
          <p className="text-sm text-secondary">Safe, but need more time?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CHECK_IN_PRESETS.map((minutes) => (
              <Button
                key={minutes}
                size="sm"
                variant="secondary"
                loading={safe.pending}
                onClick={() => void safe.run(minutes)}
              >
                Safe — check again in {minutes}m
              </Button>
            ))}
          </div>
        </div>

        <InlineNotice tone="caution">
          If you do not respond, your trusted contacts will be alerted.{' '}
          {SAFETY_COPY.notEmergencyServices}
        </InlineNotice>

        {safe.error || help.error ? (
          <p role="alert" className="mt-2 text-sm font-medium text-alert-600">
            {safe.error ?? help.error}
          </p>
        ) : null}
      </Card>
    );
  }

  if (!checkIn || checkIn.status !== 'scheduled') {
    return (
      <Card>
        <CardHeader title="Check-in" description="No check-in scheduled for this activity." />
        <div className="flex flex-wrap gap-2">
          {CHECK_IN_PRESETS.map((minutes) => (
            <Button
              key={minutes}
              size="sm"
              variant="secondary"
              loading={schedule.pending}
              onClick={() => void schedule.run(minutes)}
            >
              Check in after {minutes}m
            </Button>
          ))}
        </div>
        {schedule.error ? (
          <p role="alert" className="mt-2 text-sm font-medium text-alert-600">
            {schedule.error}
          </p>
        ) : null}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Next check-in" description="We will ask if you are safe." />
      <p className="text-3xl font-bold tabular-nums" aria-live="polite">
        {countdown.label}
      </p>
      <p className="mt-1 text-sm text-secondary">
        Due at{' '}
        {new Date(checkIn.due_at).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="mt-3"
        loading={safe.pending}
        onClick={() => void safe.run(undefined)}
      >
        I&apos;m safe — clear this check-in
      </Button>
    </Card>
  );
}
