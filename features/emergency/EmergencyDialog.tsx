'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { InlineNotice } from '@/components/ui/States';
import { Textarea } from '@/components/ui/Input';
import { SAFETY_COPY } from '@/lib/constants';
import { publicEnv } from '@/lib/env';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useSupabase } from '@/hooks/useSupabase';
import { activateEmergency, resolveEmergency } from '@/services/emergency.service';
import { buildShareUrl } from '@/services/share.service';
import type { EmergencyEventRow, OpenedShareRow } from '@/types/database';

type Step = 'confirm' | 'active';

/**
 * Emergency confirmation and management.
 *
 * The honesty requirement drives the whole design of this dialog. It must be
 * impossible for a user to come away believing that police or an ambulance
 * were called. So:
 *   - the confirm step states what will and will not happen, before activation;
 *   - the active step repeats it, with the count of contacts actually alerted;
 *   - the local emergency number is shown as a real, tappable link so the
 *     person has a genuine route to help.
 */
export function EmergencyDialog({
  open,
  onClose,
  activeEvent,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  activeEvent: EmergencyEventRow | null;
  onChanged: (event: EmergencyEventRow | null) => void;
}) {
  const db = useSupabase();
  const { permission, requestOnce } = useGeolocation();
  const [note, setNote] = useState('');
  const [shareLinks, setShareLinks] = useState<OpenedShareRow[]>([]);
  const [notifiedCount, setNotifiedCount] = useState<number | null>(null);

  const step: Step = activeEvent ? 'active' : 'confirm';

  const activate = useAsyncAction(async () => {
    // Location is captured only if permission already exists, or if the user
    // grants it at this moment. Emergency mode works without it.
    let reading = null;
    if (permission === 'granted' || permission === 'prompt' || permission === 'unknown') {
      reading = await requestOnce();
    }

    const result = await activateEmergency(db, {
      location: reading
        ? {
            latitude: reading.latitude,
            longitude: reading.longitude,
            accuracy: reading.accuracy,
          }
        : null,
      note: note.trim() || undefined,
    });

    setShareLinks(result.shareLinks.filter((share) => share.share_token));
    setNotifiedCount(result.notifiedCount);
    onChanged(result.event);
    return result;
  });

  const resolve = useAsyncAction(async (status: 'resolved_safe' | 'resolved_false_alarm') => {
    if (!activeEvent) return null;
    await resolveEmergency(db, activeEvent.id, status);
    onChanged(null);
    setShareLinks([]);
    setNotifiedCount(null);
    onClose();
    return null;
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={step === 'active' ? 'Emergency mode is on' : 'Start emergency mode?'}
      description={
        step === 'active'
          ? 'Your trusted contacts have been alerted and can see your location.'
          : 'Take a moment — this alerts the people you have chosen.'
      }
      footer={
        step === 'active' ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Keep it on
            </Button>
            <Button
              variant="secondary"
              loading={resolve.pending}
              onClick={() => void resolve.run('resolved_false_alarm')}
            >
              False alarm
            </Button>
            <Button variant="safe" loading={resolve.pending} onClick={() => void resolve.run('resolved_safe')}>
              I&apos;m safe now
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" loading={activate.pending} onClick={() => void activate.run()}>
              Yes, alert my contacts
            </Button>
          </>
        )
      }
    >
      {step === 'confirm' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-subtle p-3">
            <h3 className="text-sm font-semibold">What happens next</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-secondary">
              <li>✅ Your trusted contacts are alerted in Mwhite SafeCircle.</li>
              <li>✅ They can see your current location while this stays on.</li>
              <li>✅ Your activity switches to emergency status.</li>
              <li className="font-medium text-alert-700 dark:text-alert-50">
                ❌ Police, ambulance and fire services are NOT contacted.
              </li>
            </ul>
          </div>

          <InlineNotice tone="caution">
            {SAFETY_COPY.notEmergencyServices} <EmergencyNumberLink />
          </InlineNotice>

          <Textarea
            label="Anything you want your contacts to know? (optional)"
            hint="Keep it short — for example, a street name or what is happening."
            value={note}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
          />

          {permission === 'denied' ? (
            <InlineNotice tone="caution">
              Location permission is off, so your contacts will be alerted without a location. You
              can still continue.
            </InlineNotice>
          ) : null}

          {activate.error ? (
            <p role="alert" className="text-sm font-medium text-alert-600">
              {activate.error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <InlineNotice tone="caution">
            <strong>Emergency services have not been contacted.</strong> Mwhite SafeCircle alerted your
            trusted contacts only. <EmergencyNumberLink />
          </InlineNotice>

          <div className="rounded-xl border border-subtle p-3 text-sm">
            <p>
              <strong>
                {notifiedCount ?? activeEvent?.contacts_notified_count ?? 0} trusted contact
                {(notifiedCount ?? activeEvent?.contacts_notified_count ?? 0) === 1 ? '' : 's'}
              </strong>{' '}
              alerted.
            </p>
            <p className="mt-1 text-secondary">
              {activeEvent?.location_available
                ? 'Your location was captured and is being shared with them.'
                : 'No location was captured. Your contacts were still alerted.'}
            </p>
          </div>

          {shareLinks.length > 0 ? (
            <div className="rounded-xl border border-subtle p-3">
              <h3 className="text-sm font-semibold">Send these links</h3>
              <p className="mt-1 text-sm text-secondary">
                These contacts do not have a Mwhite SafeCircle account. Send them their link — Mwhite SafeCircle
                cannot send messages for you. Each link is shown once.
              </p>
              <ul className="mt-2 space-y-2">
                {shareLinks.map((share) => (
                  <li key={share.share_id} className="text-sm">
                    <span className="font-medium">{share.contact_name}</span>
                    <code className="mt-1 block overflow-x-auto rounded-lg bg-[var(--surface-muted)] p-2 text-xs">
                      {buildShareUrl(publicEnv.siteUrl, share.share_token ?? '')}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {resolve.error ? (
            <p role="alert" className="text-sm font-medium text-alert-600">
              {resolve.error}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

/**
 * A real, tappable emergency number. Defaults to South Africa's 112 (the
 * GSM-standard number, which works from any mobile worldwide) — replace with a
 * locale lookup before launching in another market.
 */
function EmergencyNumberLink() {
  return (
    <>
      {' '}
      If you are in danger, call{' '}
      <a href="tel:112" className="font-semibold underline">
        112
      </a>
      .
    </>
  );
}
