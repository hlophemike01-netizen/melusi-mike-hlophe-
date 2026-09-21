'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { InlineNotice } from '@/components/ui/States';
import { CheckInTimer } from '@/features/checkin/CheckInTimer';
import { ACTIVITY_TYPE_LABELS, SAFETY_COPY, VISIBILITY_OPTIONS } from '@/lib/constants';
import { publicEnv } from '@/lib/env';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useCountdown } from '@/hooks/useCountdown';
import { useLocationBroadcast } from '@/hooks/useLocationBroadcast';
import { useSupabase } from '@/hooks/useSupabase';
import { endActivity } from '@/services/activity.service';
import { reissueActivityShares, revokeShare } from '@/services/contacts.service';
import { buildShareUrl } from '@/services/share.service';
import { SendShareLink } from './SendShareLink';
import type { ActivityRow, CheckInRow, OpenedShareRow, TrustedLocationShareRow } from '@/types/database';

/**
 * The live activity screen.
 *
 * It is the control panel for something already in progress, so the two things
 * it must always make obvious are: exactly who can see this right now, and how
 * to stop it. Both are above the fold.
 */
export function LiveActivityPanel({
  activity,
  initialCheckIn,
  shares,
}: {
  activity: ActivityRow;
  initialCheckIn: CheckInRow | null;
  shares: TrustedLocationShareRow[];
}) {
  const db = useSupabase();
  const router = useRouter();
  const [checkIn, setCheckIn] = useState<CheckInRow | null>(initialCheckIn);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [activeShares, setActiveShares] = useState(shares);
  const [reissuedLinks, setReissuedLinks] = useState<OpenedShareRow[]>([]);

  const live =
    activity.status === 'active' || activity.status === 'overdue' || activity.status === 'emergency';

  // Streaming only happens when the activity is live AND its visibility or a
  // check-in actually needs a position.
  const needsBroadcast =
    live && (activity.visibility !== 'private' || checkIn?.status === 'scheduled');

  const broadcast = useLocationBroadcast(activity.id, needsBroadcast);
  const countdown = useCountdown(live ? activity.expected_end_time : null);
  const visibilityInfo = VISIBILITY_OPTIONS.find((option) => option.value === activity.visibility);

  const end = useAsyncAction(async (status: 'completed' | 'cancelled') => {
    await endActivity(db, activity.id, status);
    setConfirmEnd(false);
    router.push('/home');
    router.refresh();
    return null;
  });

  const revoke = useAsyncAction(async (shareId: string) => {
    await revokeShare(db, shareId);
    setActiveShares((current) => current.filter((share) => share.id !== shareId));
    return null;
  });

  const reissue = useAsyncAction(async () => {
    const links = await reissueActivityShares(db, activity.id);
    setReissuedLinks(links.filter((share) => share.share_token));
    router.refresh();
    return links;
  });

  return (
    <div className="space-y-4">
      <Card className="border-2 border-brand-300 dark:border-brand-700">
        <CardHeader
          title={activity.title || ACTIVITY_TYPE_LABELS[activity.activity_type]}
          description={live ? `Ends in ${countdown.label}` : 'This activity has finished'}
        />

        {visibilityInfo ? (
          <InlineNotice tone={visibilityInfo.sharesPreciseLocation ? 'caution' : 'info'}>
            <strong>{visibilityInfo.label}.</strong> {visibilityInfo.detail}
          </InlineNotice>
        ) : null}

        {live ? (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 rounded-full ${
                broadcast.active && broadcast.lastSentAt ? 'bg-safe-500' : 'bg-ink-400'
              }`}
            />
            <span className="text-secondary">
              {!needsBroadcast
                ? 'No location is being sent — this activity is private with no check-in.'
                : broadcast.lastSentAt
                  ? `Location last sent ${new Date(broadcast.lastSentAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
                  : 'Waiting for a location fix…'}
            </span>
          </div>
        ) : null}

        {broadcast.error ? (
          <p role="alert" className="mt-2 text-sm font-medium text-alert-600">
            {broadcast.error}
          </p>
        ) : null}

        {live ? (
          <Button variant="secondary" fullWidth className="mt-4" onClick={() => setConfirmEnd(true)}>
            End activity
          </Button>
        ) : null}
      </Card>

      {live ? (
        <CheckInTimer
          activityId={activity.id}
          checkIn={checkIn}
          onChanged={setCheckIn}
          onNeedHelp={() => router.refresh()}
        />
      ) : null}

      {live && activity.visibility !== 'private' ? (
        <Card>
          <CardHeader
            title="Who can see you"
            description={
              activity.visibility === 'group'
                ? 'Approved members of the group you selected.'
                : activity.visibility === 'nearby'
                  ? 'Nobody. You are counted in an approximate area total only.'
                  : `${activeShares.length} active share${activeShares.length === 1 ? '' : 's'}`
            }
          />

          {activity.visibility === 'trusted_contacts' ? (
            activeShares.length === 0 ? (
              <p className="text-sm text-secondary">
                No one currently has access. Every share has been revoked or has expired.
              </p>
            ) : (
              <ul className="space-y-2">
                {activeShares.map((share) => (
                  <li key={share.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {share.recipient_user_id ? 'Mwhite SafeCircle member' : 'Share link'}
                      </span>
                      <span className="block text-xs text-secondary">
                        Until{' '}
                        {new Date(share.expires_at).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={revoke.pending}
                      onClick={() => void revoke.run(share.id)}
                    >
                      Stop sharing
                    </Button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </Card>
      ) : null}

      {live && activity.visibility === 'trusted_contacts' ? (
        <Card>
          <CardHeader
            title="Lost a link?"
            description="Link tokens are shown once and cannot be recovered."
          />
          <p className="text-sm text-secondary">
            If you did not manage to send a link, you can create a new one. The old link keeps
            working until you revoke it above.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            loading={reissue.pending}
            onClick={() => void reissue.run()}
          >
            Create new links
          </Button>

          {reissuedLinks.length > 0 ? (
            <ul className="mt-4 space-y-3 border-t border-subtle pt-3">
              {reissuedLinks.map((share) => (
                <li key={share.share_id}>
                  <p className="text-sm font-medium">{share.contact_name}</p>
                  <code className="mt-1 block overflow-x-auto rounded-lg bg-[var(--surface-muted)] p-2 text-xs">
                    {buildShareUrl(publicEnv.siteUrl, share.share_token ?? '')}
                  </code>
                  <div className="mt-2">
                    <SendShareLink url={buildShareUrl(publicEnv.siteUrl, share.share_token ?? '')} />
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {reissue.error ? (
            <p role="alert" className="mt-2 text-sm font-medium text-alert-600">
              {reissue.error}
            </p>
          ) : null}
        </Card>
      ) : null}

      <InlineNotice tone="caution">{SAFETY_COPY.backgroundLimitation}</InlineNotice>

      <Dialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="End this activity?"
        description="Everyone loses access immediately and your precise locations are deleted."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
              Keep going
            </Button>
            <Button variant="primary" loading={end.pending} onClick={() => void end.run('completed')}>
              End activity
            </Button>
          </>
        }
      >
        <ul className="space-y-1.5 text-sm text-secondary">
          <li>· Every active share is revoked.</li>
          <li>· Your recorded locations for this activity are deleted, not archived.</li>
          <li>· Any scheduled check-in is cancelled.</li>
        </ul>
        {end.error ? (
          <p role="alert" className="mt-3 text-sm font-medium text-alert-600">
            {end.error}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
