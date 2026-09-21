import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/features/auth/AuthForm';
import { LoadingCard } from '@/components/ui/States';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <Suspense fallback={<LoadingCard label="Loading sign in" />}>
      <AuthForm mode="sign-in" />
    </Suspense>
  );
}
