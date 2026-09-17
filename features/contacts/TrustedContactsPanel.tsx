'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState, InlineNotice } from '@/components/ui/States';
import { TrustedContactCard } from '@/features/contacts/TrustedContactCard';
import { CONTACT_PERMISSION_OPTIONS, SAFETY_COPY } from '@/lib/constants';
import { fieldErrors, trustedContactSchema } from '@/lib/validation';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useSupabase } from '@/hooks/useSupabase';
import {
  addContact,
  removeContact,
  revokeContactAccess,
  updateContact,
} from '@/services/contacts.service';
import type { ContactPermissionLevel, EmergencyContactRow } from '@/types/database';

export function TrustedContactsPanel({ contacts }: { contacts: EmergencyContactRow[] }) {
  const db = useSupabase();
  const router = useRouter();
  const [editing, setEditing] = useState<EmergencyContactRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [permission, setPermission] = useState<ContactPermissionLevel>('emergency_only');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setPermission('emergency_only');
    setErrors({});
    setCreating(true);
  };

  const openEdit = (contact: EmergencyContactRow) => {
    setEditing(contact);
    setPermission(contact.permission_level);
    setErrors({});
    setCreating(true);
  };

  const save = useAsyncAction(async (form: FormData) => {
    setErrors({});
    const parsed = trustedContactSchema.safeParse({
      name: String(form.get('name') ?? ''),
      phone: String(form.get('phone') ?? ''),
      relationship: String(form.get('relationship') ?? ''),
      permissionLevel: permission,
    });

    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      throw new Error('validation');
    }

    if (editing) {
      await updateContact(db, editing.id, parsed.data);
    } else {
      await addContact(db, parsed.data);
    }

    setCreating(false);
    setEditing(null);
    router.refresh();
    return null;
  });

  const remove = useAsyncAction(async (contactId: string) => {
    await removeContact(db, contactId);
    router.refresh();
    return null;
  });

  const revoke = useAsyncAction(async (contactId: string) => {
    const count = await revokeContactAccess(db, contactId);
    setNotice(
      count === 0
        ? 'That contact did not have any active access.'
        : `Revoked ${count} active share${count === 1 ? '' : 's'}.`,
    );
    router.refresh();
    return null;
  });

  return (
    <div className="space-y-4">
      <InlineNotice tone="info">
        A trusted contact only ever receives your location during a session you authorize. They are
        never told they were added, and they cannot see your activities the rest of the time.
      </InlineNotice>

      {notice ? (
        <p role="status" className="px-1 text-sm font-medium text-safe-500">
          {notice}
        </p>
      ) : null}

      {contacts.length === 0 ? (
        <EmptyState
          icon="📇"
          title="No trusted contacts yet"
          description="Add someone who should know if you miss a check-in or activate emergency mode."
          action={<Button onClick={openCreate}>Add a contact</Button>}
        />
      ) : (
        <>
          {contacts.map((contact) => (
            <TrustedContactCard
              key={contact.id}
              contact={contact}
              busy={remove.pending || revoke.pending}
              onEdit={() => openEdit(contact)}
              onRemove={() => void remove.run(contact.id)}
              onRevoke={() => void revoke.run(contact.id)}
            />
          ))}
          <Button variant="secondary" fullWidth onClick={openCreate}>
            Add another contact
          </Button>
        </>
      )}

      <Card>
        <CardHeader title="How alerts reach your contacts" />
        <p className="text-sm text-secondary">{SAFETY_COPY.contactsAlerted}</p>
        <p className="mt-2 text-sm text-secondary">
          Contacts with a Mwhite SafeCircle account see the alert in the app. For everyone else you get a
          one-time link to send them yourself — Mwhite SafeCircle does not send SMS or make calls.
        </p>
      </Card>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title={editing ? 'Edit contact' : 'Add a trusted contact'}
        description="Only you can see this contact's details."
      >
        <form
          id="contact-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save.run(new FormData(event.currentTarget));
          }}
          className="space-y-4"
          noValidate
        >
          <Input
            label="Name"
            name="name"
            defaultValue={editing?.name ?? ''}
            error={errors.name}
            maxLength={80}
            required
          />
          <Input
            label="Phone number"
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={editing?.phone ?? ''}
            hint="International format, like +27821234567."
            error={errors.phone}
            required
          />
          <Input
            label="Relationship (optional)"
            name="relationship"
            defaultValue={editing?.relationship ?? ''}
            placeholder="Sister, flatmate, running partner"
            error={errors.relationship}
            maxLength={60}
          />
          <Select
            label="What can they see?"
            value={permission}
            onChange={(event) => setPermission(event.target.value as ContactPermissionLevel)}
            hint={CONTACT_PERMISSION_OPTIONS.find((option) => option.value === permission)?.detail}
            options={CONTACT_PERMISSION_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />

          {save.error && save.error !== 'validation' ? (
            <p role="alert" className="text-sm font-medium text-alert-600">
              {save.error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              {editing ? 'Save contact' : 'Add contact'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
