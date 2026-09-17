'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Select, Textarea } from '@/components/ui/Input';
import { InlineNotice } from '@/components/ui/States';
import { REPORT_CATEGORY_LABELS } from '@/lib/constants';
import { fieldErrors, reportSchema } from '@/lib/validation';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useSupabase } from '@/hooks/useSupabase';
import { blockUser, submitReport } from '@/services/report.service';
import type { ReportCategory } from '@/types/database';

/**
 * Report, and optionally block, in one step.
 *
 * Blocking is offered alongside reporting rather than buried, because the
 * person who needs to report someone usually also needs them gone now —
 * moderation takes time, a block is instant and revokes any live location
 * share between the two of them immediately.
 */
export function ReportDialog({
  open,
  onClose,
  subjectType = 'user',
  reportedUserId,
  reportedGroupId,
  subjectName,
}: {
  open: boolean;
  onClose: () => void;
  subjectType?: 'user' | 'group';
  reportedUserId?: string;
  reportedGroupId?: string;
  subjectName: string;
}) {
  const db = useSupabase();
  const [category, setCategory] = useState<ReportCategory>('harassment');
  const [description, setDescription] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(subjectType === 'user');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const submit = useAsyncAction(async () => {
    setErrors({});
    const parsed = reportSchema.safeParse({
      subjectType,
      reportedUserId: reportedUserId ?? null,
      reportedGroupId: reportedGroupId ?? null,
      category,
      description,
    });

    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      throw new Error('validation');
    }

    await submitReport(db, parsed.data);

    if (alsoBlock && reportedUserId) {
      await blockUser(db, reportedUserId, `Blocked while reporting: ${category}`);
    }

    setDone(true);
    return null;
  });

  if (done) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title="Report received"
        footer={<Button onClick={onClose}>Close</Button>}
      >
        <p className="text-sm">
          Our moderation team will review this. {subjectName} is not told who reported them.
        </p>
        {alsoBlock && reportedUserId ? (
          <p className="mt-2 text-sm">
            You have also blocked {subjectName}. Any location sharing between you has been stopped.
          </p>
        ) : null}
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Report ${subjectName}`}
      description="Tell us what happened. Reports are confidential."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={submit.pending} onClick={() => void submit.run()}>
            Submit report
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="What happened?"
          value={category}
          onChange={(event) => setCategory(event.target.value as ReportCategory)}
          options={Object.entries(REPORT_CATEGORY_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />

        <Textarea
          label="Describe what happened"
          hint="Include when it happened and anything that would help us understand."
          value={description}
          maxLength={2000}
          error={errors.description}
          onChange={(event) => setDescription(event.target.value)}
        />

        {reportedUserId ? (
          <label className="flex items-start gap-3 rounded-xl border border-subtle p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 accent-[var(--color-brand-600)]"
              checked={alsoBlock}
              onChange={(event) => setAlsoBlock(event.target.checked)}
            />
            <span className="text-sm">
              <span className="font-medium">Also block {subjectName}</span>
              <span className="mt-0.5 block text-secondary">
                Takes effect immediately. Neither of you can see the other, and any location sharing
                between you stops now.
              </span>
            </span>
          </label>
        ) : null}

        <InlineNotice tone="caution">
          If you are in immediate danger, call your local emergency number. SafeCircle does not
          contact emergency services.
        </InlineNotice>

        {submit.error && submit.error !== 'validation' ? (
          <p role="alert" className="text-sm font-medium text-alert-600">
            {submit.error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
