'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Modal dialog built on <dialog>, which gives focus trapping, Escape handling
 * and inertness of the background for free — all things a hand-rolled overlay
 * usually gets wrong.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (open && !node.open) {
      node.showModal();
    } else if (!open && node.open) {
      node.close();
    }
  }, [open]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    node.addEventListener('cancel', handleCancel);
    return () => node.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onClose={onClose}
      className="m-0 max-h-[90dvh] w-full max-w-lg self-end justify-self-center overflow-y-auto rounded-t-2xl border border-subtle bg-[var(--surface-raised)] p-0 text-[color:var(--text-primary)] backdrop:bg-black/50 sm:mx-auto sm:my-auto sm:self-center sm:rounded-2xl"
    >
      <div className="p-5">
        <h2 id="dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-secondary">{description}</p> : null}
        <div className="mt-4">{children}</div>
        {footer ? <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div> : null}
      </div>
    </dialog>
  );
}
