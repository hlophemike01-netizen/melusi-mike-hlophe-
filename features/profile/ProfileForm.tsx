'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { fieldErrors, profileUpdateSchema } from '@/lib/validation';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useSupabase } from '@/hooks/useSupabase';
import { updateMyProfile } from '@/services/profile.service';
import type { ProfileRow } from '@/types/database';

export function ProfileForm({ profile }: { profile: ProfileRow }) {
  const db = useSupabase();
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const save = useAsyncAction(async (form: FormData) => {
    setErrors({});
    setSaved(false);

    const parsed = profileUpdateSchema.safeParse({
      displayName: String(form.get('displayName') ?? ''),
      phone: String(form.get('phone') ?? ''),
      approximateArea: String(form.get('approximateArea') ?? ''),
    });

    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      throw new Error('validation');
    }

    await updateMyProfile(db, parsed.data);
    setSaved(true);
    router.refresh();
    return null;
  });

  return (
    <Card>
      <CardHeader title="Your details" />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save.run(new FormData(event.currentTarget));
        }}
        className="space-y-4"
        noValidate
      >
        <Input
          label="Display name"
          name="displayName"
          defaultValue={profile.display_name}
          error={errors.displayName}
          maxLength={60}
          required
        />
        <Input
          label="Phone number"
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={profile.phone ?? ''}
          hint="International format, like +27821234567. Used so people who add you as a trusted contact can reach you in the app. Never shown to other members."
          error={errors.phone}
        />
        <Input
          label="Your area"
          name="approximateArea"
          defaultValue={profile.approximate_area ?? ''}
          hint="A suburb or area name only — for example “Melville, Johannesburg”. Do not enter a street address; group members can see this."
          error={errors.approximateArea}
          maxLength={120}
        />

        {save.error && save.error !== 'validation' ? (
          <p role="alert" className="text-sm font-medium text-alert-600">
            {save.error}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="text-sm font-medium text-safe-500">
            Saved.
          </p>
        ) : null}

        <Button type="submit" loading={save.pending}>
          Save changes
        </Button>
      </form>
    </Card>
  );
}
