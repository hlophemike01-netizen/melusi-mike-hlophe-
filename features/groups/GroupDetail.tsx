'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { InlineNotice } from '@/components/ui/States';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { ReportDialog } from '@/features/reports/ReportDialog';
import { ACTIVITY_TYPE_LABELS } from '@/lib/constants';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useSupabase } from '@/hooks/useSupabase';
import {
  joinGroup,
  leaveGroup,
  removeMember,
  reviewJoinRequest,
  setMemberRole,
  type GroupMemberWithProfile,
} from '@/services/group.service';
import type { GroupMemberRow, GroupRow } from '@/types/database';

export function GroupDetail({
  group,
  membership,
  members,
  currentUserId,
}: {
  group: GroupRow;
  membership: GroupMemberRow | null;
  members: GroupMemberWithProfile[];
  currentUserId: string;
}) {
  const db = useSupabase();
  const router = useRouter();
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);

  const isApproved = membership?.status === 'approved';
  const isAdmin = isApproved && (membership.role === 'owner' || membership.role === 'admin');
  const pending = members.filter((member) => member.status === 'pending');
  const approved = members.filter((member) => member.status === 'approved');

  const join = useAsyncAction(async () => {
    await joinGroup(db, group.id);
    router.refresh();
    return null;
  });

  const leave = useAsyncAction(async () => {
    await leaveGroup(db, group.id);
    router.refresh();
    return null;
  });

  const review = useAsyncAction(async (memberId: string, decision: 'approved' | 'rejected') => {
    await reviewJoinRequest(db, memberId, decision);
    router.refresh();
    return null;
  });

  const remove = useAsyncAction(async (memberId: string) => {
    await removeMember(db, memberId);
    router.refresh();
    return null;
  });

  const promote = useAsyncAction(async (memberId: string, role: 'admin' | 'member') => {
    await setMemberRole(db, memberId, role);
    router.refresh();
    return null;
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={group.name}
          description={`${ACTIVITY_TYPE_LABELS[group.activity_type]} · ${group.member_count} member${group.member_count === 1 ? '' : 's'}${group.approximate_area ? ` · ${group.approximate_area}` : ''}`}
        />
        {group.description ? <p className="text-sm">{group.description}</p> : null}

        <div className="mt-4">
          {!membership || membership.status === 'left' || membership.status === 'removed' ? (
            <Button fullWidth loading={join.pending} onClick={() => void join.run()}>
              {group.requires_approval ? 'Request to join' : 'Join group'}
            </Button>
          ) : membership.status === 'pending' ? (
            <InlineNotice tone="info">
              Your request is waiting for a group admin. You cannot see group activities until it is
              approved.
            </InlineNotice>
          ) : (
            <Button variant="secondary" fullWidth loading={leave.pending} onClick={() => void leave.run()}>
              Leave group
            </Button>
          )}
        </div>

        {join.error || leave.error ? (
          <p role="alert" className="mt-2 text-sm font-medium text-alert-600">
            {join.error ?? leave.error}
          </p>
        ) : null}
      </Card>

      {isApproved ? (
        <InlineNotice tone="info">
          When you start a group activity, approved members can see your location until it ends.
          Members with a pending request cannot.
        </InlineNotice>
      ) : null}

      {isAdmin && pending.length > 0 ? (
        <Card>
          <CardHeader title="Join requests" description={`${pending.length} waiting`} />
          <ul className="space-y-2">
            {pending.map((member) => (
              <li key={member.id} className="flex items-center gap-3">
                <UserAvatar
                  name={member.profile?.display_name ?? 'Member'}
                  avatarUrl={member.profile?.avatar_url}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {member.profile?.display_name ?? 'Member'}
                </span>
                <Button size="sm" variant="secondary" onClick={() => void review.run(member.id, 'rejected')}>
                  Decline
                </Button>
                <Button size="sm" onClick={() => void review.run(member.id, 'approved')}>
                  Approve
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {isApproved ? (
        <Card>
          <CardHeader title="Members" description={`${approved.length} approved`} />
          <ul className="divide-y divide-[color:var(--border-subtle)]">
            {approved.map((member) => {
              const name = member.profile?.display_name ?? 'Member';
              const isSelf = member.user_id === currentUserId;
              return (
                <li key={member.id} className="flex items-center gap-3 py-2.5">
                  <UserAvatar name={name} avatarUrl={member.profile?.avatar_url} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {name}
                      {isSelf ? ' (you)' : ''}
                    </span>
                    <span className="block text-xs capitalize text-secondary">
                      {member.role}
                      {member.profile?.approximate_area ? ` · ${member.profile.approximate_area}` : ''}
                    </span>
                  </span>

                  {isAdmin && !isSelf && member.role !== 'owner' ? (
                    <span className="flex shrink-0 gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void promote.run(member.id, member.role === 'admin' ? 'member' : 'admin')
                        }
                      >
                        {member.role === 'admin' ? 'Demote' : 'Make admin'}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void remove.run(member.id)}>
                        Remove
                      </Button>
                    </span>
                  ) : null}

                  {!isSelf ? (
                    <button
                      type="button"
                      aria-label={`Report ${name}`}
                      onClick={() => setReportTarget({ id: member.user_id, name })}
                      className="shrink-0 rounded-lg px-2 py-2 text-sm text-secondary"
                    >
                      ⋯
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {reportTarget ? (
        <ReportDialog
          open
          onClose={() => setReportTarget(null)}
          reportedUserId={reportTarget.id}
          subjectName={reportTarget.name}
        />
      ) : null}
    </div>
  );
}
