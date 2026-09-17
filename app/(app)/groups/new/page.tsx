import type { Metadata } from 'next';
import { AppHeader } from '@/components/layout/AppHeader';
import { CreateGroupForm } from '@/features/groups/CreateGroupForm';

export const metadata: Metadata = { title: 'Create group' };

export default function NewGroupPage() {
  return (
    <div className="space-y-4">
      <AppHeader title="Create a group" backHref="/groups" />
      <CreateGroupForm />
    </div>
  );
}
