import { vi } from 'vitest';
import type { Db } from '@/services/types';

/**
 * A minimal fake of the Supabase client.
 *
 * It records how a service builds its query so a test can assert on the
 * filters that were applied — which is the point: services must not paper over
 * an authorisation rule with a client-side filter, and must not silently drop
 * one the database depends on.
 *
 * It does NOT simulate RLS. Policy behaviour is tested for real against
 * PostgreSQL in tests/db — a mock that "enforced" RLS would only be testing
 * the mock.
 */
export interface RecordedCall {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'delete';
  filters: Array<{ method: string; args: unknown[] }>;
  payload?: unknown;
}

export interface MockDb {
  db: Db;
  calls: RecordedCall[];
  rpcCalls: Array<{ fn: string; args: unknown }>;
  /**
   * Stubs the response for a table. Pass `operation` to distinguish a read
   * from a write on the same table — several services select before they
   * insert, and the two need different answers.
   */
  setTableResult: (
    table: string,
    result: { data: unknown; error: unknown },
    operation?: RecordedCall['operation'],
  ) => void;
  setRpcResult: (fn: string, result: { data: unknown; error: unknown }) => void;
  setUser: (user: { id: string } | null) => void;
}

const CHAIN_METHODS = [
  'eq',
  'neq',
  'in',
  'is',
  'gt',
  'gte',
  'lt',
  'lte',
  'ilike',
  'order',
  'limit',
  'not',
  'filter',
] as const;

export function createMockDb(initialUser: { id: string } | null = { id: 'user-1' }): MockDb {
  const calls: RecordedCall[] = [];
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  const tableResults = new Map<string, { data: unknown; error: unknown }>();
  const rpcResults = new Map<string, { data: unknown; error: unknown }>();
  let user = initialUser;

  const makeBuilder = (call: RecordedCall) => {
    const result = () =>
      tableResults.get(`${call.table}:${call.operation}`) ??
      tableResults.get(call.table) ?? { data: null, error: null };

    const builder: Record<string, unknown> = {
      select: (..._args: unknown[]) => builder,
      single: () => Promise.resolve(result()),
      maybeSingle: () => Promise.resolve(result()),
      // Awaiting the builder directly resolves like a PostgREST response.
      then: (
        onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(result()).then(onFulfilled, onRejected),
    };

    for (const method of CHAIN_METHODS) {
      builder[method] = (...args: unknown[]) => {
        call.filters.push({ method, args });
        return builder;
      };
    }

    return builder;
  };

  const from = (table: string) => {
    const start = (operation: RecordedCall['operation'], payload?: unknown) => {
      const call: RecordedCall = { table, operation, filters: [], payload };
      calls.push(call);
      return makeBuilder(call);
    };

    return {
      select: (..._args: unknown[]) => start('select'),
      insert: (payload: unknown) => start('insert', payload),
      update: (payload: unknown) => start('update', payload),
      delete: () => start('delete'),
    };
  };

  const db = {
    from: vi.fn(from),
    rpc: vi.fn((fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(rpcResults.get(fn) ?? { data: null, error: null });
    }),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user }, error: null })),
    },
  } as unknown as Db;

  return {
    db,
    calls,
    rpcCalls,
    setTableResult: (table, result, operation) =>
      tableResults.set(operation ? `${table}:${operation}` : table, result),
    setRpcResult: (fn, result) => rpcResults.set(fn, result),
    setUser: (next) => {
      user = next;
    },
  };
}

/** Finds the first recorded call for a table/operation pair. */
export function findCall(
  calls: RecordedCall[],
  table: string,
  operation: RecordedCall['operation'],
): RecordedCall | undefined {
  return calls.find((call) => call.table === table && call.operation === operation);
}

/** True when the recorded call applied `method` with these exact arguments. */
export function hasFilter(call: RecordedCall | undefined, method: string, ...args: unknown[]): boolean {
  if (!call) return false;
  return call.filters.some(
    (filter) => filter.method === method && JSON.stringify(filter.args) === JSON.stringify(args),
  );
}
