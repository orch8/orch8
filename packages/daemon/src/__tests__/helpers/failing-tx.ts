import type { SchemaDb } from "../../db/client.js";

/**
 * Wraps a real drizzle `SchemaDb` so that targeted `insert(table)` or
 * `update(table)` calls throw synchronously — both at the top level and
 * inside `db.transaction(fn)` callbacks.
 *
 * The synchronous throw propagates out of the user's await and, if we're
 * inside a drizzle transaction, triggers a real `ROLLBACK`.
 *
 * Used to test that multi-write service methods roll back prior writes when
 * a later write fails, and to test that non-transactional code paths handle
 * DB errors gracefully.
 */
export function makeFailingTxDb(
  realDb: SchemaDb,
  opts: {
    failInsertOnTable?: unknown;
    failUpdateOnTable?: unknown;
    /** Skip this many matching calls before failing (0 = fail immediately). */
    skip?: number;
    error?: Error;
    /** If true, only fail inside transactions. Default: fail everywhere. */
    onlyInTransaction?: boolean;
  },
): SchemaDb {
  const err = opts.error ?? new Error("simulated db write failure");
  const skipTarget = opts.skip ?? 0;
  let insertHits = 0;
  let updateHits = 0;

  function shouldFailInsert(table: unknown): boolean {
    if (!opts.failInsertOnTable || table !== opts.failInsertOnTable) return false;
    if (insertHits < skipTarget) {
      insertHits++;
      return false;
    }
    return true;
  }

  function shouldFailUpdate(table: unknown): boolean {
    if (!opts.failUpdateOnTable || table !== opts.failUpdateOnTable) return false;
    if (updateHits < skipTarget) {
      updateHits++;
      return false;
    }
    return true;
  }

  function wrapHandle<T extends object>(handle: T, inTransaction: boolean): T {
    const failEverywhere = !opts.onlyInTransaction;
    return new Proxy(handle, {
      get(t, p, r) {
        if (p === "insert" && (inTransaction || failEverywhere)) {
          return (table: unknown) => {
            if (shouldFailInsert(table)) throw err;
            return (t as any).insert(table);
          };
        }
        if (p === "update" && (inTransaction || failEverywhere)) {
          return (table: unknown) => {
            if (shouldFailUpdate(table)) throw err;
            return (t as any).update(table);
          };
        }
        if (p === "transaction") {
          return (fn: (tx: SchemaDb) => Promise<unknown>, config?: unknown) => {
            return ((t as any).transaction as (
              inner: (tx: SchemaDb) => Promise<unknown>,
              cfg?: unknown,
            ) => Promise<unknown>)(
              async (tx) => fn(wrapHandle(tx as unknown as object, true) as unknown as SchemaDb),
              config,
            );
          };
        }
        const v = Reflect.get(t, p, r);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  }

  return wrapHandle(realDb as unknown as object, false) as unknown as SchemaDb;
}
