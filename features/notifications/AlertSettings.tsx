'use client';

import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { InlineNotice } from '@/components/ui/States';
import { usePushAlerts } from '@/hooks/usePushAlerts';

/**
 * Turning on alerts for this device.
 *
 * Worth being blunt in the copy about two things: this is per-device, and on
 * an iPhone it only works once the app is added to the home screen. Somebody
 * relying on this to hear that a family member missed a check-in needs to know
 * that before they rely on it, not afterwards.
 */
export function AlertSettings() {
  const { state, busy, error, enable, disable } = usePushAlerts();

  return (
    <Card>
      <CardHeader
        title="Alerts on this device"
        description="Be told when someone who trusts you misses a check-in or raises an emergency."
      />

      {state === 'unsupported' ? (
        <InlineNotice tone="caution">
          This browser cannot show alerts. You will still see everything inside the app.
        </InlineNotice>
      ) : state === 'unconfigured' ? (
        <InlineNotice tone="caution">
          Alerts are not set up on this deployment yet. Everything else works — alerts simply stay
          inside the app.
        </InlineNotice>
      ) : state === 'denied' ? (
        <InlineNotice tone="caution">
          Notifications are blocked for this site. Turn them back on in your browser settings, then
          reload this page.
        </InlineNotice>
      ) : state === 'on' ? (
        <>
          <InlineNotice tone="safe">
            Alerts are on for this device. You will be told even when SafeCircle is closed.
          </InlineNotice>
          <Button variant="secondary" className="mt-3" loading={busy} onClick={() => void disable()}>
            Turn alerts off
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-secondary">
            Without this, a missed check-in only shows up when you next open the app.
          </p>
          <Button className="mt-3" loading={busy} onClick={() => void enable()}>
            Turn on alerts
          </Button>
        </>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-alert-600">
          {error}
        </p>
      ) : null}

      <p className="mt-4 border-t border-subtle pt-3 text-xs leading-relaxed text-secondary">
        Alerts are per device — turn them on wherever you want to be reached. On an iPhone they only
        work once you have added SafeCircle to your home screen. Alerts never contain anyone&apos;s
        location.
      </p>
    </Card>
  );
}
