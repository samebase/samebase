// The storage contract of one step. A rule is an Effect program over `Tx`; the host decides how it
// runs (synchronous SQL under a transaction, or memory in tests). A `Tx` is valid only inside its
// step: every operation dies once the host has closed it.
import { Context, Effect, Schema } from "effect";
import {
  declarations,
  type Doc,
  type IndexField,
  type IndexName,
  type TableName,
} from "./tables.ts";

/**
 * An opaque row handle of table `T`, given by the store and stable across `replace`. Never stored
 * in a document. `key` is the adapter's own row key; two handles of one row have equal keys.
 */
export class RowId<T extends TableName> {
  constructor(
    readonly table: T,
    readonly key: string,
  ) {}
}

/** An index value; `undefined` stands for an absent field, which sorts before every value. */
export type IndexValue = string | number | undefined;

export interface Row<T extends TableName> {
  readonly id: RowId<T>;
  readonly doc: Doc<T>;
}

export interface Bound {
  readonly op: "gt" | "gte" | "lt" | "lte";
  readonly value: IndexValue;
}

export interface Query {
  /** A prefix of the index fields. `undefined` matches an absent field only. */
  readonly eq: ReadonlyArray<IndexValue>;
  /** At most one lower and one upper bound, on the field after the prefix. */
  readonly range?: ReadonlyArray<Bound>;
  readonly order: "asc" | "desc";
  /** Every read is bounded. */
  readonly limit: number;
}

export interface TxShape {
  readonly insert: <T extends TableName>(table: T, doc: Doc<T>) => Effect.Effect<RowId<T>>;
  readonly get: <T extends TableName>(table: T, id: RowId<T>) => Effect.Effect<Row<T> | undefined>;
  /** Writes the whole document: a field the new document omits is removed. Dies on a missing row. */
  readonly replace: <T extends TableName>(
    table: T,
    id: RowId<T>,
    doc: Doc<T>,
  ) => Effect.Effect<void>;
  /** Dies on a missing row. */
  readonly delete: <T extends TableName>(table: T, id: RowId<T>) => Effect.Effect<void>;
  /**
   * Rows in index order: the index fields, then insertion order among equal keys (a replace keeps
   * the row's place). Reads see the earlier writes of the same step.
   */
  readonly query: <T extends TableName>(
    table: T,
    index: IndexName<T>,
    query: Query,
  ) => Effect.Effect<ReadonlyArray<Row<T>>>;
}

export class Tx extends Context.Service<Tx, TxShape>()("identity-broker-effect/store/Tx") {}

/** The one row with the full key `eq`, or undefined. Two rows are a broken invariant. */
export const unique = <T extends TableName>(
  table: T,
  index: IndexName<T>,
  eq: ReadonlyArray<IndexValue>,
) =>
  Effect.gen(function* () {
    const tx = yield* Tx;
    const rows = yield* tx.query(table, index, { eq, order: "asc", limit: 2 });
    if (rows.length > 1) {
      return yield* Effect.die(new Error(`Two rows of ${table}.${index} share one key`));
    }
    return rows.at(0);
  });

/** The first row in index order with the prefix `eq`, or undefined. */
export const first = <T extends TableName>(
  table: T,
  index: IndexName<T>,
  eq: ReadonlyArray<IndexValue>,
) =>
  Effect.gen(function* () {
    const tx = yield* Tx;
    const rows = yield* tx.query(table, index, { eq, order: "asc", limit: 1 });
    return rows.at(0);
  });

/**
 * Every row with the prefix `eq`, when an invariant keeps them below `limit`. Reaching `limit` is a
 * broken invariant, so the read stays bounded.
 */
export const allBelow = <T extends TableName>(
  table: T,
  index: IndexName<T>,
  eq: ReadonlyArray<IndexValue>,
  limit: number,
) =>
  Effect.gen(function* () {
    const tx = yield* Tx;
    const rows = yield* tx.query(table, index, { eq, order: "asc", limit });
    if (rows.length >= limit) {
      return yield* Effect.die(
        new Error(`${table}.${index} holds ${limit} or more rows of one key`),
      );
    }
    return rows;
  });

/** The fields of an index. Dies on an index that the table does not declare. */
export const indexFields = (table: TableName, index: string): ReadonlyArray<IndexField> => {
  const fields = declarations[table].indexes[index];
  if (fields === undefined) {
    throw new Error(`${table} has no index ${index}`);
  }
  return fields;
};

/** A query checked against its index: the prefix fields and the range field with its bounds. */
export interface CheckedQuery {
  readonly fields: ReadonlyArray<IndexField>;
  readonly eq: ReadonlyArray<IndexValue>;
  readonly lower: Bound | undefined;
  readonly upper: Bound | undefined;
  readonly rangeField: IndexField | undefined;
  readonly order: "asc" | "desc";
  readonly limit: number;
}

const typeMatches = (field: IndexField, value: IndexValue) =>
  value === undefined || typeof value === field.type;

/** Checks a query against the declared index. A malformed query is a defect of the rule. */
export const checkQuery = (table: TableName, index: string, query: Query): CheckedQuery => {
  const fields = indexFields(table, index);
  if (query.eq.length > fields.length) {
    throw new Error(`${table}.${index}: the prefix is longer than the index`);
  }
  query.eq.forEach((value, at) => {
    const field = fields.at(at);
    if (field === undefined || !typeMatches(field, value)) {
      throw new Error(`${table}.${index}: a prefix value has the wrong type`);
    }
  });
  if (!Number.isSafeInteger(query.limit) || query.limit < 0) {
    throw new Error(`${table}.${index}: the limit must be a non-negative integer`);
  }
  const range = query.range ?? [];
  const rangeField = range.length === 0 ? undefined : fields.at(query.eq.length);
  if (range.length > 0 && rangeField === undefined) {
    throw new Error(`${table}.${index}: a range needs a field after the prefix`);
  }
  const lowers = range.filter((bound) => bound.op === "gt" || bound.op === "gte");
  const uppers = range.filter((bound) => bound.op === "lt" || bound.op === "lte");
  if (lowers.length > 1 || uppers.length > 1) {
    throw new Error(`${table}.${index}: at most one lower and one upper bound`);
  }
  for (const bound of range) {
    if (rangeField === undefined || !typeMatches(rangeField, bound.value)) {
      throw new Error(`${table}.${index}: a bound has the wrong type`);
    }
  }
  return {
    fields,
    eq: query.eq,
    lower: lowers.at(0),
    upper: uppers.at(0),
    rangeField,
    order: query.order,
    limit: query.limit,
  };
};

const isRecord = Schema.is(Schema.Record(Schema.String, Schema.Unknown));

/** The index value at `path` (`target.scope`) of a document. A value of another type is a defect. */
export const valueAt = (doc: unknown, field: IndexField): IndexValue => {
  let value: unknown = doc;
  for (const key of field.path.split(".")) {
    if (!isRecord(value)) {
      return undefined;
    }
    value = value[key];
  }
  if (value === undefined || typeof value === field.type) {
    return typeof value === "string" || typeof value === "number" ? value : undefined;
  }
  throw new Error(`The index field ${field.path} holds a value of another type`);
};

/**
 * Index value order: absent first, strings by Unicode code point (UTF-8 byte order, as SQLite's
 * BINARY collation), numbers by value.
 */
export const compareValues = (a: IndexValue, b: IndexValue): number => {
  if (a === undefined || b === undefined) {
    return a === b ? 0 : a === undefined ? -1 : 1;
  }
  if (typeof a === "number" && typeof b === "number") {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === "string" && typeof b === "string") {
    return compareCodePoints(a, b);
  }
  throw new Error("Index values of two types");
};

/** UTF-16 units remapped so that surrogate pairs sort above U+E000..U+FFFF, as code points do. */
const unitRank = (unit: number) =>
  unit < 0xd800 ? unit : unit < 0xe000 ? unit + 0x2000 : unit - 0x800;

const compareCodePoints = (a: string, b: string): number => {
  const length = Math.min(a.length, b.length);
  for (let at = 0; at < length; at++) {
    const x = a.charCodeAt(at);
    const y = b.charCodeAt(at);
    if (x !== y) {
      return unitRank(x) - unitRank(y);
    }
  }
  return a.length - b.length;
};

/** Whether `value` passes `bound`. An absent value fails a lower bound and passes an upper bound. */
export const passes = (value: IndexValue, bound: Bound): boolean => {
  const order = compareValues(value, bound.value);
  switch (bound.op) {
    case "gt":
      return order > 0;
    case "gte":
      return order >= 0;
    case "lt":
      return order < 0;
    case "lte":
      return order <= 0;
    default:
      return bound.op satisfies never;
  }
};
