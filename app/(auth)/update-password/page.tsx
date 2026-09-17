'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { fieldErrors, updatePasswordSchema } from '@/lib/validation';
import { useSupabase } from '@/hooks/useSupabase';

/**
 * Reached from the emailed reset link, which has already exchanged its code
 * for a session in /auth/callback. Supabase requires a valid recovery session
 * for updateUser to succeed, so an expired link fails here rather than
 * silently changing nothing.
 */
export default function UpdatePasswordPage() {
  const db = useSupabase();
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const form = new FormData(event.currentTarget);
    const parsed = updatePasswordSchema.safeParse({
      password: String(form.get('password') ?? ''),
      confirmPassword: String(form.get('confirmPassword') ?? ''),
    });

    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setPending(true);
    const { error } = await db.auth.updateUser({ password: parsed.data.password });
    setPending(false);

    if (error) {
      setErrors({
        form: 'We could not update your password. The reset link may have expired — request a new one.',
      });
      return;
    }

    router.push('/home');
    router.refresh();
  }

  return (
    <Card>
      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>

      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        <Input
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="At least 12 characters."
          error={errors.password}
          required
        />
        <Input
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword}
          required
        />

        {errors.form ? (
          <p role="alert" className="text-sm font-medium text-alert-600">
            {errors.form}
          </p>
        ) : null}

        <Button type="submit" fullWidth size="lg" loading={pending}>
          Update password
        </Button>
      </form>
    </Card>
  );
}
