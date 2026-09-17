'use client';

import { useEffect, useState } from 'react';

export interface Countdown {
  msRemaining: number;
  expired: boolean;
  label: string;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'now';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

/** Ticks once a second toward an ISO deadline. Returns a ready-to-render label. */
export function useCountdown(deadlineIso: string | null | undefined): Countdown {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadlineIso) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [deadlineIso]);

  if (!deadlineIso) {
    return { msRemaining: 0, expired: false, label: '' };
  }

  const msRemaining = new Date(deadlineIso).getTime() - now;
  return {
    msRemaining,
    expired: msRemaining <= 0,
    label: formatRemaining(msRemaining),
  };
}
