'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { InlineNotice } from '@/components/ui/States';
import { publicEnv } from '@/lib/env';
import { SAFETY_COPY } from '@/lib/constants';
import { fieldErrors, signInSchema, signUpSchema } from '@/lib/validation';
import { useSupabase } from '@/hooks/useSupabase';

type Mode = 'sign-in' | 'sign-up';

/**
 * Sign in / sign up.
 *
 * Authentication errors are deliberately vague ("those details did not
 * match"). Telling someone that an email exists but the password was wrong
 * confirms account existence to anyone with a list of addresses.
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const db = useSupabase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Only ever redirect to a same-site path, so a crafted ?next= cannot bounce
  // a freshly signed-in user to an attacker's page.
  const rawNext = searchParams.get('next') ?? '/home';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/home';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const raw = {
      displayName: String(form.get('displayName') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    };

    const schema = mode === 'sign-up' ? signUpSchema : signInSchema;
    const parsed = schema.safeParse(mode === 'sign-up' ? raw : { email: raw.email, password: raw.password });

    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setPending(true);
    try {
      if (mode === 'sign-up') {
        const { error } = await db.auth.signUp({
          email: raw.email.trim().toLowerCase(),
          password: raw.password,
          options: {
            data: { display_name: raw.displayName.trim() },
            emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;

        setMessage(
          'Check your email for a confirmation link. You need to confirm before you can sign in.',
        );
        return;
      }

      const { error } = await db.auth.signInWithPassword({
        email: raw.email.trim().toLowerCase(),
        password: raw.password,
      });
      if (error) throw error;

      router.push(next);
      router.refresh();
    } catch {
      setErrors({
        form:
          mode === 'sign-up'
            ? 'We could not create that account. Check your details and try again.'
            : 'Those details did not match an account.',
      });
    } finally {
      setPending(false);
    }
  }

  if (message) {
    return (
      <Card>
        <h1 className="text-xl font-bold">Almost there</h1>
        <p className="mt-2 text-sm text-secondary">{message}</p>
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
      <h1 className="text-2xl font-bold tracking-tight">
        {mode === 'sign-up' ? 'Create your account' : 'Welcome back'}
      </h1>
      <p className="mt-1.5 text-sm text-secondary">
        {mode === 'sign-up'
          ? 'Your location stays private until you choose to share it.'
          : 'Sign in to see your activities and groups.'}
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        {mode === 'sign-up' ? (
          <Input
            label="Display name"
            name="displayName"
            autoComplete="nickname"
            hint="This is what other members see. It does not have to be your full name."
            error={errors.displayName}
            required
          />
        ) : null}

        <Input
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          error={errors.email}
          required
        />

        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          hint={mode === 'sign-up' ? 'At least 12 characters. A phrase you will remember works well.' : undefined}
          error={errors.password}
          required
        />

        {errors.form ? (
          <p role="alert" className="text-sm font-medium text-alert-600">
            {errors.form}
          </p>
        ) : null}

        <Button type="submit" fullWidth size="lg" loading={pending}>
          {mode === 'sign-up' ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      {mode === 'sign-up' ? (
        <InlineNotice tone="info">
          <span className="block">{SAFETY_COPY.locationOptional}</span>
          <span className="mt-1 block">{SAFETY_COPY.onlyAuthorised}</span>
        </InlineNotice>
      ) : null}

      <div className="mt-5 space-y-2 border-t border-subtle pt-4 text-sm">
        {mode === 'sign-in' ? (
          <>
            <p>
              <Link href="/reset-password" className="font-semibold text-brand-700 dark:text-brand-300">
                Forgot your password?
              </Link>
            </p>
            <p className="text-secondary">
              New here?{' '}
              <Link href="/sign-up" className="font-semibold text-brand-700 dark:text-brand-300">
                Create an account
              </Link>
            </p>
          </>
        ) : (
          <p className="text-secondary">
            Already have an account?{' '}
            <Link href="/sign-in" className="font-semibold text-brand-700 dark:text-brand-300">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </Card>
  );
}
