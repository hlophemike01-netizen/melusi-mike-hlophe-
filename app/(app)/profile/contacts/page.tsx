import type { Metadata } from 'next';
import { AppHeader } from '@/components/layout/AppHeader';
import { TrustedContactsPanel } from '@/features/contacts/TrustedContactsPanel';
import { createClient } from '@/lib/supabase/server';
import { listContacts } from '@/services/contacts.service';

export const metadata: Metadata = { title: 'Trusted contacts' };
export const dynamic = 'force-dynamic';

export default async function ContactsPage() {
  const supabase = await createClient();
  const contacts = await listContacts(supabase);

  return (
    <div className="space-y-4">
      <AppHeader title="Trusted contacts" subtitle="Only you can see these" backHref="/profile" />
      <TrustedContactsPanel contacts={contacts} />
    </div>
  );
}
