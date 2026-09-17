import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/features/auth/AuthForm';
import { LoadingCard } from '@/components/ui/States';

export const metadata: Metadata = { title: 'Create account' };

export default function SignUpPage() {
  return (
    <Suspense fallback={<LoadingCard label="Loading sign up" />}>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
