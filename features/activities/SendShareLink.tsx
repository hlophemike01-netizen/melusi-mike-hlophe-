'use client';

import { useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/Button';
import {
  canUseShareSheet,
  openShareSheet,
  shareMessage,
  smsDeepLink,
  whatsappDeepLink,
} from '@/lib/share-message';

/**
 * The send controls for one share link.
 *
 * Nothing here transmits anything by itself. Each button hands the text to an
 * app the user already has and stops; the user presses send. The status line
 * below the buttons only ever reports what the browser actually told us —
 * "Sent" is never shown because this component cannot know that.
 */
export function SendShareLink({
  url,
  senderName,
  onCopied,
}: {
  url: string;
  senderName?: string;
  onCopied?: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);

  /**
   * Whether the OS share sheet exists is a fact about the browser, not state
   * this component owns. `navigator` does not exist while this renders on the
   * server, so the server snapshot is false and the client reads the real
   * value on hydration. Nothing ever changes it, so the subscribe callback has
   * nothing to do.
   */
  const hasShareSheet = useSyncExternalStore(
    () => () => {},
    canUseShareSheet,
    () => false,
  );

  const text = shareMessage(url, senderName);

  const share = async () => {
    const outcome = await openShareSheet(text);
    if (outcome === 'shared') {
      // The sheet closed on a target. The OS does not tell us which one, or
      // whether the message was actually sent, so the wording stays neutral.
      setStatus('Handed to the app you chose.');
    } else if (outcome === 'dismissed') {
      setStatus(null);
    } else {
      setStatus('Could not open the share sheet. Use WhatsApp or copy the link.');
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Link copied.');
      onCopied?.();
    } catch {
      setStatus('Copy was blocked — select the link above and copy it by hand.');
    }
  };

  const linkClass =
    'inline-flex min-h-9 items-center rounded-xl border border-subtle px-3 text-sm font-semibold';

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {hasShareSheet && (
          <Button size="sm" onClick={() => void share()}>
            Share…
          </Button>
        )}
        <a href={whatsappDeepLink(text)} className={linkClass}>
          WhatsApp
        </a>
        <a href={smsDeepLink(text)} className={linkClass}>
          SMS
        </a>
        <Button size="sm" variant="secondary" onClick={() => void copy()}>
          Copy link
        </Button>
      </div>
      {status && (
        <p aria-live="polite" className="mt-1.5 text-xs text-secondary">
          {status}
        </p>
      )}
    </div>
  );
}
