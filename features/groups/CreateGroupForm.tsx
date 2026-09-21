'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { InlineNotice } from '@/components/ui/States';
import { PrivacyControl } from '@/features/privacy/PrivacyControl';
import { ACTIVITY_TYPE_LABELS } from '@/lib/constants';
import { createGroupSchema, fieldErrors } from '@/lib/validation';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useSupabase } from '@/hooks/useSupabase';
import { createGroup } from '@/services/group.service';
import type { ActivityType, GroupVisibility } from '@/types/database';

const VISIBILITY_HELP: Record<GroupVisibility, string> = {
  public: 'Anyone signed in can find this group and ask to join.',
  private: 'Only people you invite can see this group. It does not appear in Discover.',
  invite_only: 'Hidden, and nobody can request to join — you add members yourself.',
};

export function CreateGroupForm() {
  const db = useSupabase();
  const router = useRouter();
  const [activityType, setActivityType] = useState<ActivityType>('running');
  const [visibility, setVisibility] = useState<GroupVisibility>('private');
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = useAsyncAction(async (form: FormData) => {
    setErrors({});
    const parsed = createGroupSchema.safeParse({
      name: String(form.get('name') ?? ''),
      description: String(form.get('description') ?? ''),
      approximateArea: String(form.get('approximateArea') ?? ''),
      activityType,
      visibility,
      requiresApproval,
    });

    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      throw new Error('validation');
    }

    const group = await createGroup(db, parsed.data);
    router.push(`/groups/${group.id}`);
    router.refresh();
    return group;
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit.run(new FormData(event.currentTarget));
      }}
      className="space-y-4"
      noValidate
    >
      <Card>
        <CardHeader title="About the group" />
        <div className="space-y-4">
          <Input label="Group name" name="name" error={errors.name} required maxLength={80} />
          <Textarea
            label="Description"
            name="description"
            hint="What the group is for, when you usually meet."
            error={errors.description}
            maxLength={1000}
          />
          <Input
            label="Area"
            name="approximateArea"
            hint="A suburb or area name, like “Sea Point, Cape Town”. Never a street address — this is shown to everyone who can see the group."
            error={errors.approximateArea}
            maxLength={120}
          />
          <Select
            label="Main activity"
            value={activityType}
            onChange={(event) => setActivityType(event.target.value as ActivityType)}
            options={Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Who can join" />
        <Select
          label="Group visibility"
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as GroupVisibility)}
          hint={VISIBILITY_HELP[visibility]}
          options={[
            { value: 'private', label: 'Private — invite people yourself' },
            { value: 'public', label: 'Public — anyone can request to join' },
            { value: 'invite_only', label: 'Invite only — hidden entirely' },
          ]}
        />

        <div className="mt-2 divide-y divide-[color:var(--border-subtle)]">
          <PrivacyControl
            label="Approve each new member"
            description="Join requests wait for an owner or admin. Turning this off lets anyone who finds a public group join instantly — and approved members can see group activities."
            checked={requiresApproval}
            onChange={setRequiresApproval}
          />
        </div>

        <InlineNotice tone="info">
          Members can see each other&apos;s display name, avatar and area. Emails and phone numbers
          are never shared with a group.
        </InlineNotice>
      </Card>

      {submit.error && submit.error !== 'validation' ? (
        <p role="alert" className="px-1 text-sm font-medium text-alert-600">
          {submit.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" fullWidth loading={submit.pending}>
        Create group
      </Button>
    </form>
  );
}
