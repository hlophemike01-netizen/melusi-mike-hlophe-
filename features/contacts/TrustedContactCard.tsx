'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CONTACT_PERMISSION_OPTIONS } from '@/lib/constants';
import type { EmergencyContactRow } from '@/types/database';

export function TrustedContactCard({
  contact,
  onEdit,
  onRemove,
  onRevoke,
  busy,
}: {
  contact: EmergencyContactRow;
  onEdit: () => void;
  onRemove: () => void;
  onRevoke: () => void;
  busy?: boolean;
}) {
  const permission = CONTACT_PERMISSION_OPTIONS.find(
    (option) => option.value === contact.permission_level,
  );

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{contact.name}</h3>
          {contact.relationship ? (
            <p className="truncate text-sm text-secondary">{contact.relationship}</p>
          ) : null}
          {/* The phone number is the owner's own record of a third party. It is
              shown to them and to nobody else — not other members, not admins. */}
          <p className="mt-0.5 font-mono text-sm text-secondary">{contact.phone}</p>
          <p className="mt-1.5 text-sm">
            <span className="font-medium">{permission?.label}</span>
          </p>
          <p className="mt-0.5 text-xs text-secondary">{permission?.detail}</p>
          {contact.contact_user_id ? (
            <p className="mt-1 text-xs text-safe-500">Has a SafeCircle account — alerted in-app.</p>
          ) : (
            <p className="mt-1 text-xs text-secondary">
              No SafeCircle account — you will get a link to send them.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onEdit} disabled={busy}>
          Edit
        </Button>
        <Button size="sm" variant="secondary" onClick={onRevoke} disabled={busy}>
          Revoke access now
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove} disabled={busy}>
          Remove
        </Button>
      </div>
    </Card>
  );
}
