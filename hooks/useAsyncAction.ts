'use client';

import { useCallback, useState } from 'react';
import { toAppError } from '@/lib/errors';

export interface AsyncActionState {
  pending: boolean;
  error: string | null;
  success: boolean;
}

/**
 * Wraps a mutation so every caller gets the same loading/error/success shape,
 * and so errors are converted to safe user-facing text in exactly one place.
 */
export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
) {
  const [state, setState] = useState<AsyncActionState>({
    pending: false,
    error: null,
    success: false,
  });

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
      setState({ pending: true, error: null, success: false });
      try {
        const result = await action(...args);
        setState({ pending: false, error: null, success: true });
        return result;
      } catch (error) {
        setState({ pending: false, error: toAppError(error).userMessage, success: false });
        return null;
      }
    },
    [action],
  );

  const reset = useCallback(() => setState({ pending: false, error: null, success: false }), []);

  return { ...state, run, reset };
}
