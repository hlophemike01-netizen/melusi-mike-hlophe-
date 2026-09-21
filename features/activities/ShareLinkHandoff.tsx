'use client';

import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { InlineNotice } from '@/components/ui/States';
import { publicEnv } from '@/lib/env';
import { buildShareUrl } from '@/services/share.service';
import { SendShareLink } from './SendShareLink';
import type { OpenedShareRow } from '@/types/database';

/**
 * Hands one-time share links to the user.
 *
 * These tokens exist only in this response: the database stores their SHA-256
 * and nothing else, so if the user navigates away without copying them the
 * links are unrecoverable. That is the correct security property, and it means
 * this step must block navigation rather than flash past.
 *
 * Mwhite SafeCircle cannot send the messages itself — there is no SMS provider — so
 * the copy says so plainly instead of implying the contact has been notified.
 * The buttons open WhatsApp, the share sheet or SMS with the text prefilled;
 * the user presses send.
 */
export function ShareLinkHandoff({
  shareLinks,
  onContinue,
}: {
  shareLinks: OpenedShareRow[];
  onContinue: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card className="border-2 border-brand-300 dark:border-brand-700">
        <CardHeader
          title="Send these links now"
          description="These contacts do not have a Mwhite SafeCircle account."
        />

        <InlineNotice tone="caution">
          Each link is shown <strong>once</strong> and cannot be recovered. Mwhite SafeCircle does not send
          messages on your behalf — send each link yourself.
        </InlineNotice>

        <ul className="mt-4 space-y-4">
          {shareLinks.map((share) => {
            const url = buildShareUrl(publicEnv.siteUrl, share.share_token ?? '');
            return (
              <li key={share.share_id}>
                <p className="text-sm font-semibold">{share.contact_name}</p>
                <code className="mt-1 block overflow-x-auto rounded-lg bg-[var(--surface-muted)] p-2.5 text-xs">
                  {url}
                </code>
                <div className="mt-2">
                  <SendShareLink url={url} />
                </div>
                <p className="mt-1.5 text-xs text-secondary">
                  Expires {new Date(share.expires_at).toLocaleTimeString()}
                </p>
              </li>
            );
          })}
        </ul>
      </Card>

      <Button size="lg" fullWidth onClick={onContinue}>
        I have sent them — continue
      </Button>
    </div>
  );
}
