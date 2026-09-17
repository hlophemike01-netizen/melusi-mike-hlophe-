'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, InlineNotice } from '@/components/ui/States';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useSupabase } from '@/hooks/useSupabase';
import { unblockUser } from '@/services/report.service';

export interface BlockedEntry {
  id: string;
  blockedId: string;
  displayName: string;
  createdAt: string;
}

export function BlockedList({ blocks }: { blocks: BlockedEntry[] }) {
  const db = useSupabase();
  const router = useRouter();

  const unblock = useAsyncAction(async (userId: string) => {
    await unblockUser(db, userId);
    router.refresh();
    return null;
  });

  if (blocks.length === 0) {
    return (
      <EmptyState
        icon="🚫"
        title="You have not blocked anyone"
        description="Blocking someone stops all interaction both ways and immediately ends any location sharing between you."
      />
    );
  }

  return (
    <div className="space-y-3">
      <InlineNotice tone="info">
        Blocking works both ways and takes effect immediately. The other person is never told that
        you blocked them.
      </InlineNotice>

      {blocks.map((block) => (
        <Card key={block.id}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{block.displayName}</p>
              <p className="text-xs text-secondary">
                Blocked {new Date(block.createdAt).toLocaleDateString()}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              loading={unblock.pending}
              onClick={() => void unblock.run(block.blockedId)}
            >
              Unblock
            </Button>
          </div>
        </Card>
      ))}

      {unblock.error ? (
        <p role="alert" className="px-1 text-sm font-medium text-alert-600">
          {unblock.error}
        </p>
      ) : null}
    </div>
  );
}
