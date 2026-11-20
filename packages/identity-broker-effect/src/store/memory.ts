// The memory adapter: tables as maps, one snapshot per step for rollback. Same contract as the SQL
// adapter, which the property tests check.
import { Effect, Schema } from "effect";
import { tables, type Doc, type IndexName, type TableName, type Tables } from "./tables.ts";
import {
  checkQuery,
  compareValues,
  passes,
  RowId,
  valueAt,
  type IndexField,
  type IndexValue,
  type Query,
  type Row as RowOf,
  type TxShape,
} from "./Tx.ts";

type Row<T extends TableName> = RowOf<Tables, T>;

interface Stored<T extends TableName> {
  /** Insertion order; kept by a replace. Also the row key. */
  readonly seq: number;
  readonly doc: Doc<T>;
  /** The key of each index, computed when the row is written. */
  readonly keys: Readonly<Record<string, ReadonlyArray<IndexValue>>>;
}

type Rows = { [T in TableName]: Map<number, Stored<T>> };

const copyRows = (rows: Rows | undefined): Rows => ({
  clients: new Map(rows?.clients),
  stops: new Map(rows?.stops),
  authRequests: new Map(rows?.authRequests),
  authorizationCodes: new Map(rows?.authorizationCodes),
  signIns: new Map(rows?.signIns),
  signInBudgets: new Map(rows?.signInBudgets),
  apps: new Map(rows?.apps),
  tenants: new Map(rows?.tenants),
  signInPageExemptions: new Map(rows?.signInPageExemptions),
  connectorGrants: new Map(rows?.connectorGrants),
  events: new Map(rows?.events),
  initialAccessTokens: new Map(rows?.initialAccessTokens),
  rateLimits: new Map(rows?.rateLimits),
});

const keysOf = (table: TableName, doc: unknown): Record<string, ReadonlyArray<IndexValue>> => {
  const keys: Record<string, ReadonlyArray<IndexValue>> = {};
  for (const [index, fields] of Object.entries<ReadonlyArray<IndexField>>(tables[table].indexes)) {
    keys[index] = fields.map((field) => valueAt(doc, field));
  }
  return keys;
};

const compareKeys = (a: ReadonlyArray<IndexValue>, b: ReadonlyArray<IndexValue>): number => {
  for (let at = 0; at < a.length; at++) {
    const order = compareValues(a[at], b[at]);
    if (order !== 0) {
      return order;
    }
  }
  return 0;
};

/** A document must survive the JSON encoding of the SQL adapter: checked on every write. */
const checkDoc = (table: TableName, doc: unknown) => {
  Schema.encodeUnknownSync(tables[table].schema)(doc);
};

const seqOf = (id: RowId<string>) => {
  const seq = Number(id.key);
  if (!Number.isSafeInteger(seq)) {
    throw new Error(`Not a row id of this store: ${id.key}`);
  }
  return seq;
};

export class MemorySnapshot {
  constructor(
    readonly rows: Rows,
    readonly seq: number,
  ) {}
}

export class MemoryDb {
  private rows: Rows = copyRows(undefined);
  private seq = 0;

  /**
   * Runs `body` as one step over a fresh `Tx`. A throw restores the state from before the step.
   * The `Tx` is closed when the step ends; any later use dies. A read-only step's `Tx` refuses writes.
   */
  step<A>(
    body: (tx: TxShape<Tables>) => A,
    options: { readonly readOnly: boolean } = { readOnly: false },
  ): A {
    const saved = { rows: copyRows(this.rows), seq: this.seq };
    let open = true;
    try {
      return body(this.tx(() => open, options.readOnly));
    } catch (error) {
      this.rows = saved.rows;
      this.seq = saved.seq;
      throw error;
    } finally {
      open = false;
    }
  }

  /** The whole state, to come back to with `restore`: a state search expands each state from it. */
  snapshot(): MemorySnapshot {
    return new MemorySnapshot(copyRows(this.rows), this.seq);
  }

  restore(snapshot: MemorySnapshot): void {
    this.rows = copyRows(snapshot.rows);
    this.seq = snapshot.seq;
  }

  /** Every document of every table, in insertion order: the state compared by content. */
  contents(): { readonly [T in TableName]: ReadonlyArray<Doc<T>> } {
    const docs = <T extends TableName>(table: T) =>
      [...this.rows[table].values()].map((row) => row.doc);
    return {
      clients: docs("clients"),
      stops: docs("stops"),
      authRequests: docs("authRequests"),
      authorizationCodes: docs("authorizationCodes"),
      signIns: docs("signIns"),
      signInBudgets: docs("signInBudgets"),
      apps: docs("apps"),
      tenants: docs("tenants"),
      signInPageExemptions: docs("signInPageExemptions"),
      connectorGrants: docs("connectorGrants"),
      events: docs("events"),
      initialAccessTokens: docs("initialAccessTokens"),
      rateLimits: docs("rateLimits"),
    };
  }

  private tx(isOpen: () => boolean, readOnly: boolean): TxShape<Tables> {
    const live = () => {
      if (!isOpen()) {
        throw new Error("This Tx is closed: its step has ended");
      }
    };
    const writable = () => {
      live();
      if (readOnly) {
        throw new Error("A read-only command wrote");
      }
    };
    const stored = <T extends TableName>(table: T, id: RowId<T>) => {
      const row = this.rows[table].get(seqOf(id));
      if (row === undefined) {
        throw new Error(`No row ${id.key} in ${table}`);
      }
      return row;
    };
    return {
      insert: <T extends TableName>(table: T, doc: Doc<T>) =>
        Effect.sync(() => {
          writable();
          checkDoc(table, doc);
          this.seq += 1;
          const seq = this.seq;
          this.rows[table].set(seq, { seq, doc, keys: keysOf(table, doc) });
          return new RowId(table, String(seq));
        }),
      get: <T extends TableName>(table: T, id: RowId<T>) =>
        Effect.sync((): Row<T> | undefined => {
          live();
          const row = this.rows[table].get(seqOf(id));
          return row === undefined ? undefined : { id, doc: row.doc };
        }),
      replace: <T extends TableName>(table: T, id: RowId<T>, doc: Doc<T>) =>
        Effect.sync(() => {
          writable();
          const { seq } = stored(table, id);
          checkDoc(table, doc);
          this.rows[table].set(seq, { seq, doc, keys: keysOf(table, doc) });
        }),
      delete: <T extends TableName>(table: T, id: RowId<T>) =>
        Effect.sync(() => {
          writable();
          this.rows[table].delete(stored(table, id).seq);
        }),
      query: <T extends TableName>(table: T, index: IndexName<T>, query: Query) =>
        Effect.sync((): ReadonlyArray<Row<T>> => {
          live();
          const checked = checkQuery(tables, table, index, query);
          const keyOf = (row: Stored<T>) => row.keys[index] ?? [];
          const at = checked.eq.length;
          const matches = [...this.rows[table].values()].filter((row) => {
            const key = keyOf(row);
            return (
              checked.eq.every((value, field) => compareValues(key[field], value) === 0) &&
              (checked.lower === undefined || passes(key[at], checked.lower)) &&
              (checked.upper === undefined || passes(key[at], checked.upper))
            );
          });
          matches.sort((a, b) => compareKeys(keyOf(a), keyOf(b)) || a.seq - b.seq);
          if (checked.order === "desc") {
            matches.reverse();
          }
          return matches
            .slice(0, checked.limit)
            .map((row) => ({ id: new RowId(table, String(row.seq)), doc: row.doc }));
        }),
    };
  }
}
