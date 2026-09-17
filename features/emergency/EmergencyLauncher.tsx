'use client';

import { useEffect, useState } from 'react';
import { EmergencyButton } from '@/features/emergency/EmergencyButton';
import { EmergencyDialog } from '@/features/emergency/EmergencyDialog';
import { getActiveEmergency } from '@/services/emergency.service';
import { useSupabase } from '@/hooks/useSupabase';
import type { EmergencyEventRow } from '@/types/database';

/**
 * Persistent emergency entry point, rendered by the app shell on every signed-in
 * screen. It polls for an active event so the control reflects reality even if
 * the emergency was raised on another device.
 */
export function EmergencyLauncher() {
  const db = useSupabase();
  const [open, setOpen] = useState(false);
  const [event, setEvent] = useState<EmergencyEventRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      void getActiveEmergency(db)
        .then((active) => {
          if (!cancelled) setEvent(active);
        })
        .catch(() => {
          // A failed poll must never remove the button. Leave the last known
          // state in place.
        });
    };

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [db]);

  return (
    <>
      <div className="fixed inset-x-0 bottom-[var(--nav-height)] z-40 px-4 pb-3">
        <div className="mx-auto max-w-2xl">
          <EmergencyButton active={Boolean(event)} onActivate={() => setOpen(true)} />
        </div>
      </div>

      <EmergencyDialog
        open={open}
        onClose={() => setOpen(false)}
        activeEvent={event}
        onChanged={setEvent}
      />
    </>
  );
}
