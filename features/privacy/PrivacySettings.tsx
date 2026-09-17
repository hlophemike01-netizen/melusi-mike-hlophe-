'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { InlineNotice } from '@/components/ui/States';
import { PrivacyControl } from '@/features/privacy/PrivacyControl';
import { SAFETY_COPY, VISIBILITY_OPTIONS } from '@/lib/constants';
import { K_ANONYMITY_THRESHOLD } from '@/lib/geo';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useSupabase } from '@/hooks/useSupabase';
import { eraseMyLocationHistory } from '@/services/activity.service';
import { revokeAllShares } from '@/services/contacts.service';
import { updatePrivacySettings } from '@/services/profile.service';
import type { ActivityVisibility, ProfileRow } from '@/types/database';

/**
 * Privacy and location settings.
 *
 * The master switch is the important control on this screen. Turning it off
 * does not just prevent future sharing — it ends any activity currently
 * running, because a switch that leaves a live broadcast in place is a lie.
 */
export function PrivacySettings({
  profile,
  activeShareCount,
}: {
  profile: ProfileRow;
  activeShareCount: number;
}) {
  const db = useSupabase();
  const router = useRouter();

  const [locationSharing, setLocationSharing] = useState(profile.location_sharing_enabled);
  const [discoverable, setDiscoverable] = useState(profile.discoverable_in_groups);
  const [defaultVisibility, setDefaultVisibility] = useState<ActivityVisibility>(
    profile.default_activity_visibility,
  );
  const [saved, setSaved] = useState(false);
  const [erased, setErased] = useState<number | null>(null);
  const [revoked, setRevoked] = useState<number | null>(null);

  const save = useAsyncAction(async () => {
    setSaved(false);
    await updatePrivacySettings(db, {
      locationSharingEnabled: locationSharing,
      discoverableInGroups: discoverable,
      defaultActivityVisibility: defaultVisibility,
    });
    setSaved(true);
    router.refresh();
    return null;
  });

  const revokeAll = useAsyncAction(async () => {
    const count = await revokeAllShares(db);
    setRevoked(count);
    router.refresh();
    return count;
  });

  const erase = useAsyncAction(async () => {
    const count = await eraseMyLocationHistory(db);
    setErased(count);
    router.refresh();
    return count;
  });

  return (
    <div className="space-y-4">
      <InlineNotice tone="info">
        {SAFETY_COPY.locationOptional} {SAFETY_COPY.onlyAuthorised}
      </InlineNotice>

      <Card>
        <CardHeader title="Location sharing" />
        <div className="divide-y divide-[color:var(--border-subtle)]">
          <PrivacyControl
            tone="sharing"
            label="Allow location sharing"
            description="The master switch. While this is off, Mwhite SafeCircle cannot record or share your location at all, and only private activities can be started. Turning it off also ends any activity running right now."
            checked={locationSharing}
            onChange={setLocationSharing}
          />
          <PrivacyControl
            label="Let group members find me"
            description="Members of groups you belong to can see your display name, avatar and area. Turning this off hides you from group member lists. Your email and phone are never shown either way."
            checked={discoverable}
            onChange={setDiscoverable}
          />
        </div>

        {!locationSharing && profile.location_sharing_enabled ? (
          <InlineNotice tone="caution">
            Saving will end any activity you have running and stop all sharing immediately.
          </InlineNotice>
        ) : null}

        <div className="mt-4">
          <Select
            label="Default for new activities"
            value={defaultVisibility}
            onChange={(event) => setDefaultVisibility(event.target.value as ActivityVisibility)}
            hint={VISIBILITY_OPTIONS.find((option) => option.value === defaultVisibility)?.detail}
            options={VISIBILITY_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
        </div>

        {save.error ? (
          <p role="alert" className="mt-3 text-sm font-medium text-alert-600">
            {save.error}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="mt-3 text-sm font-medium text-safe-600">
            Saved.
          </p>
        ) : null}

        <Button className="mt-4" loading={save.pending} onClick={() => void save.run()}>
          Save privacy settings
        </Button>
      </Card>

      <Card>
        <CardHeader
          title="Stop sharing now"
          description={
            activeShareCount === 0
              ? 'Nobody currently has access to your location.'
              : `${activeShareCount} person or link currently has access.`
          }
        />
        <p className="text-sm text-secondary">
          This revokes every live share immediately. It does not delete your trusted contacts — you
          can share with them again later.
        </p>
        {revoked !== null ? (
          <p role="status" className="mt-2 text-sm font-medium text-safe-600">
            Revoked {revoked} share{revoked === 1 ? '' : 's'}.
          </p>
        ) : null}
        <Button
          variant="secondary"
          className="mt-3"
          disabled={activeShareCount === 0}
          loading={revokeAll.pending}
          onClick={() => void revokeAll.run()}
        >
          Revoke all access
        </Button>
      </Card>

      <Card>
        <CardHeader title="Delete my location data" />
        <p className="text-sm text-secondary">
          Mwhite SafeCircle already deletes precise locations when an activity ends, and expired points are
          purged automatically. This removes anything still stored right now.
        </p>
        {erased !== null ? (
          <p role="status" className="mt-2 text-sm font-medium text-safe-600">
            Deleted {erased} location point{erased === 1 ? '' : 's'}.
          </p>
        ) : null}
        {erase.error ? (
          <p role="alert" className="mt-2 text-sm font-medium text-alert-600">
            {erase.error}
          </p>
        ) : null}
        <Button variant="secondary" className="mt-3" loading={erase.pending} onClick={() => void erase.run()}>
          Delete stored locations
        </Button>
      </Card>

      <Card>
        <CardHeader title="What other people can see" />
        <ul className="space-y-2.5 text-sm">
          <li>
            <strong>Strangers:</strong> nothing. Not your name, not your area, not your activities.
          </li>
          <li>
            <strong>Group members:</strong> your display name, avatar and area. Your precise location
            only while you are running a group activity you chose to share.
          </li>
          <li>
            <strong>Trusted contacts:</strong> your precise location only during a session you
            authorize, and only until it expires or you revoke it.
          </li>
          <li>
            <strong>The community map:</strong> at most, that someone is active in a grid square
            of roughly a kilometre — and only where at least {K_ANONYMITY_THRESHOLD} people are
            active.
          </li>
          <li>
            <strong>Mwhite SafeCircle administrators:</strong> your display name and account status.
            Administrators cannot see your location, your activities or your trusted contacts.
          </li>
        </ul>
      </Card>

      <InlineNotice tone="caution">{SAFETY_COPY.backgroundLimitation}</InlineNotice>
    </div>
  );
}
