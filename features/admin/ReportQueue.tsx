'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Input, Textarea } from '@/components/ui/Input';
import { EmptyState, InlineNotice } from '@/components/ui/States';
import { REPORT_CATEGORY_LABELS } from '@/lib/constants';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useSupabase } from '@/hooks/useSupabase';
import { restoreUser, reviewReport, suspendUser } from '@/services/admin.service';
import type { AdminReportRow, ReportStatus } from '@/types/database';

export function ReportQueue({ reports }: { reports: AdminReportRow[] }) {
  const db = useSupabase();
  const router = useRouter();
  const [suspending, setSuspending] = useState<AdminReportRow | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const review = useAsyncAction(
    async (reportId: string, status: Extract<ReportStatus, 'under_review' | 'actioned' | 'dismissed'>) => {
      await reviewReport(db, reportId, status, note || undefined);
      setNote('');
      router.refresh();
      return null;
    },
  );

  const suspend = useAsyncAction(async (userId: string) => {
    await suspendUser(db, userId, reason);
    setSuspending(null);
    setReason('');
    router.refresh();
    return null;
  });

  const restore = useAsyncAction(async (userId: string) => {
    await restoreUser(db, userId);
    router.refresh();
    return null;
  });

  if (reports.length === 0) {
    return <EmptyState icon="✅" title="No reports" description="Nothing is waiting for review." />;
  }

  return (
    <div className="space-y-3">
      <InlineNotice tone="info">
        Suspending an account ends its live activities, revokes every location share and deletes its
        stored location points. Every action here is written to the audit log with your name.
      </InlineNotice>

      {reports.map((report) => (
        <Card key={report.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{REPORT_CATEGORY_LABELS[report.category]}</h3>
                <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-semibold capitalize">
                  {report.status.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="mt-1 text-sm text-secondary">
                {report.reporter_name} reported{' '}
                {report.reported_name ?? (report.reported_group_id ? 'a group' : 'an account')} ·{' '}
                {new Date(report.created_at).toLocaleString()}
              </p>
              {/* Rendered as text by React, so a report body cannot inject markup. */}
              <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[var(--surface-muted)] p-3 text-sm">
                {report.description}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {report.status === 'open' ? (
              <Button size="sm" variant="secondary" onClick={() => void review.run(report.id, 'under_review')}>
                Start review
              </Button>
            ) : null}
            {report.status !== 'dismissed' ? (
              <Button size="sm" variant="secondary" onClick={() => void review.run(report.id, 'dismissed')}>
                Dismiss
              </Button>
            ) : null}
            {report.status !== 'actioned' ? (
              <Button size="sm" onClick={() => void review.run(report.id, 'actioned')}>
                Mark actioned
              </Button>
            ) : null}
            {report.reported_user_id ? (
              <>
                <Button size="sm" variant="danger" onClick={() => setSuspending(report)}>
                  Suspend account
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={restore.pending}
                  onClick={() => void restore.run(report.reported_user_id!)}
                >
                  Restore account
                </Button>
              </>
            ) : null}
          </div>
        </Card>
      ))}

      {review.error || restore.error ? (
        <p role="alert" className="px-1 text-sm font-medium text-alert-600">
          {review.error ?? restore.error}
        </p>
      ) : null}

      <Card>
        <Textarea
          label="Resolution note (applied to the next action)"
          hint="Recorded on the report. Do not include personal details that are not needed."
          value={note}
          maxLength={2000}
          onChange={(event) => setNote(event.target.value)}
        />
      </Card>

      <Dialog
        open={Boolean(suspending)}
        onClose={() => setSuspending(null)}
        title={`Suspend ${suspending?.reported_name ?? 'this account'}?`}
        description="This ends their live activities and revokes all their location sharing immediately."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSuspending(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={suspend.pending}
              onClick={() => suspending?.reported_user_id && void suspend.run(suspending.reported_user_id)}
            >
              Suspend account
            </Button>
          </>
        }
      >
        <Input
          label="Reason"
          hint="At least five characters. Stored in the audit log."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
        />
        {suspend.error ? (
          <p role="alert" className="mt-2 text-sm font-medium text-alert-600">
            {suspend.error}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
