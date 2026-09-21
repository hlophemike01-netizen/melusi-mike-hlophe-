'use client';

import { ShareLinkHandoff } from '@/features/activities/ShareLinkHandoff';
import type { OpenedShareRow } from '@/types/database';

/**
 * ShareLinkHandoff needs an onContinue callback, so it has to be mounted from
 * a client component. The tokens below are obviously fake strings.
 */
const links: OpenedShareRow[] = [
  {
    share_id: 'preview-1',
    contact_id: 'c1',
    contact_name: 'Mama',
    recipient_user_id: null,
    share_token: 'EXAMPLE-TOKEN-NOT-REAL-0001',
    expires_at: new Date(Date.now() + 40 * 60_000).toISOString(),
  },
  {
    share_id: 'preview-2',
    contact_id: 'c2',
    contact_name: 'Sipho',
    recipient_user_id: null,
    share_token: 'EXAMPLE-TOKEN-NOT-REAL-0002',
    expires_at: new Date(Date.now() + 40 * 60_000).toISOString(),
  },
];

export function PreviewShareLinks() {
  return <ShareLinkHandoff shareLinks={links} onContinue={() => {}} />;
}
