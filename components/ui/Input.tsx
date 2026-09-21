'use client';

import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const FIELD_CLASSES =
  'w-full rounded-xl border border-subtle bg-white px-3 py-3 text-base text-ink-900 ' +
  'placeholder:text-ink-400 focus:border-brand-500 focus:outline-none ' +
  'disabled:bg-ink-100 disabled:text-ink-500 dark:bg-[var(--surface-raised)] dark:text-ink-100';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className="w-full">
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mb-1.5 text-sm text-secondary">
          {hint}
        </p>
      ) : null}
      <input
        ref={ref}
        id={fieldId}
        aria-describedby={cn(hintId, errorId) || undefined}
        aria-invalid={error ? true : undefined}
        className={cn(FIELD_CLASSES, error && 'border-alert-600', className)}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-sm font-medium text-alert-600">
          {error}
        </p>
      ) : null}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className="w-full">
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mb-1.5 text-sm text-secondary">
          {hint}
        </p>
      ) : null}
      <textarea
        ref={ref}
        id={fieldId}
        rows={4}
        aria-describedby={cn(hintId, errorId) || undefined}
        aria-invalid={error ? true : undefined}
        className={cn(FIELD_CLASSES, 'resize-y', error && 'border-alert-600', className)}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-sm font-medium text-alert-600">
          {error}
        </p>
      ) : null}
    </div>
  );
});

export interface SelectProps extends InputHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
}

export function Select({ label, hint, error, options, id, className, ...props }: SelectProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className="w-full">
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mb-1.5 text-sm text-secondary">
          {hint}
        </p>
      ) : null}
      <select
        id={fieldId}
        aria-describedby={cn(hintId, errorId) || undefined}
        aria-invalid={error ? true : undefined}
        className={cn(FIELD_CLASSES, error && 'border-alert-600', className)}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-sm font-medium text-alert-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
