'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { publicEnv } from '@/lib/env';
import { emailSchema } from '@/lib/validation';
import { useSupabase } from '@/hooks/useSupabase';

export default function ResetPasswordPage() {
  const db = useSupabase();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address.');
      return;
    }

    setPending(true);
    await db.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${publicEnv.siteUrl}/auth/callback?next=/update-password`,
    });
    setPending(false);

    // Always report success, whether or not the address is registered.
    // Distinguishing the two would confirm which emails have accounts.
    setSent(true);
  }

  if (sent) {
    return (
      <Card>
        <h1 className="text-xl font-bold">Check your email</h1>
        <p className="mt-2 text-sm text-secondary">
          If that address has a Mwhite SafeCircle account, we have sent a link to reset the password. The
          link expires in one hour.
        </p>
        <Link
          href="/sign-in"
          className="mt-4 inline-block text-sm font-semibold text-brand-700 dark:text-brand-300"
        >
          Back to sign in
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 text-sm text-secondary">
        We will email you a link to choose a new one.
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        <Input
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          error={error ?? undefined}
          required
        />
        <Button type="submit" fullWidth size="lg" loading={pending}>
          Send reset link
        </Button>
      </form>

      <Link
        href="/sign-in"
        className="mt-5 inline-block border-t border-subtle pt-4 text-sm font-semibold text-brand-700 dark:text-brand-300"
      >
        Back to sign in
      </Link>
    </Card>
  );
}
