// The SQL adapter: the DDL of the layout and a `Tx` over one host function `exec`. The same text
// runs on node:sqlite in tests and on a Durable Object's `storage.sql`.
//
// Layout: per table `id INTEGER PRIMARY KEY AUTOINCREMENT, doc TEXT NOT NULL` and one column per
// indexed path, written from the document on every write; per index `(<columns>, id)`. Absent is
// NULL, which SQLite sorts first. Columns have no declared type, so a value is stored as bound and
// strings compare with the BINARY collation (UTF-8 byte order). `id` is the insertion order.
import { Effect, Schema } from "effect";
import {
  tableNames,
  tables,
  type Doc,
  type IndexName,
  type TableName,
  type Tables,
} from "./tables.ts";
import {
  checkQuery,
  RowId,
  valueAt,
  type Bound,
  type IndexField,
  type IndexValue,
  type Query,
  type Row as RowOf,
  type TxShape,
} from "./Tx.ts";

type Row<T extends TableName> = RowOf<Tables, T>;

export type SqlValue = string | number | null;

/** Runs one statement with positional parameters and returns every row it gives. */
export type Exec = (
  sql: string,
  params: ReadonlyArray<SqlValue>,
) => ReadonlyArray<Record<string, unknown>>;

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** The distinct indexed paths of a table, in declaration order: its key columns. */
const columnsOf = (table: TableName): ReadonlyArray<IndexField> => {
  const seen = new Map<string, IndexField>();
  for (const fields of Object.values<ReadonlyArray<IndexField>>(tables[table].indexes)) {
    for (const field of fields) {
      seen.set(field.path, field);
    }
  }
  return [...seen.values()];
};

const indexSql = (table: TableName) =>
  Object.entries<ReadonlyArray<IndexField>>(tables[table].indexes).map(
    ([index, fields]) =>
      `CREATE INDEX IF NOT EXISTS ${quote(`${table}__${index}`)} ON ${quote(table)} (${[
        ...fields.map((field) => quote(field.path)),
        "id",
      ].join(", ")})`,
  );

/** Every statement of the layout, in order. Its text is the layout that the `meta` row records. */
export const layoutStatements: ReadonlyArray<string> = tableNames.flatMap((table) => [
  `CREATE TABLE IF NOT EXISTS ${quote(table)} (id INTEGER PRIMARY KEY AUTOINCREMENT, doc TEXT NOT NULL${columnsOf(
    table,
  )
    .map((field) => `, ${quote(field.path)}`)
    .join("")})`,
  ...indexSql(table),
]);

const layout = layoutStatements.join(";\n");

const MetaRow = Schema.Struct({ value: Schema.String });
const IdRow = Schema.Struct({ id: Schema.Number });
const DocRow = Schema.Struct({ id: Schema.Number, doc: Schema.String });
const decodeMeta = Schema.decodeUnknownSync(Schema.Array(MetaRow));
const decodeIds = Schema.decodeUnknownSync(Schema.Array(IdRow));
const decodeDocs = Schema.decodeUnknownSync(Schema.Array(DocRow));
const parseJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

/**
 * Creates the layout, or checks that the stored one is this one. Run it inside the host's
 * transaction. A different stored layout is a defect: a layout change needs a migration.
 */
export const ensureLayout = (exec: Exec): void => {
  exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`, []);
  const stored = decodeMeta(exec(`SELECT value FROM meta WHERE key = 'layout'`, []));
  const current = stored.at(0);
  if (current !== undefined) {
    if (current.value !== layout) {
      throw new Error("The stored layout differs from this build's layout");
    }
    return;
  }
  for (const statement of layoutStatements) {
    exec(statement, []);
  }
  exec(`INSERT INTO meta (key, value) VALUES ('layout', ?)`, [layout]);
};

const sqlValue = (value: IndexValue): SqlValue => (value === undefined ? null : value);

/** The condition of one bound, with the absent-first order of the contract. */
const boundSql = (
  column: string,
  bound: Bound,
): { readonly sql: string; readonly params: ReadonlyArray<SqlValue> } => {
  const { value } = bound;
  switch (bound.op) {
    case "gt":
      return value === undefined
        ? { sql: `${column} IS NOT NULL`, params: [] }
        : { sql: `${column} > ?`, params: [value] };
    case "gte":
      return value === undefined
        ? { sql: `1`, params: [] }
        : { sql: `${column} >= ?`, params: [value] };
    case "lt":
      return value === undefined
        ? { sql: `0`, params: [] }
        : { sql: `(${column} IS NULL OR ${column} < ?)`, params: [value] };
    case "lte":
      return value === undefined
        ? { sql: `${column} IS NULL`, params: [] }
        : { sql: `(${column} IS NULL OR ${column} <= ?)`, params: [value] };
    default:
      return bound.op satisfies never;
  }
};

/** A `Tx` over `exec`, live while `isOpen()` holds. A read-only `Tx` refuses writes. */
export const sqlTx = (exec: Exec, isOpen: () => boolean, readOnly: boolean): TxShape<Tables> => {
  /** Checked right before each statement: a closed `Tx` never reaches storage. */
  const run = (sql: string, params: ReadonlyArray<SqlValue>) => {
    if (!isOpen()) {
      throw new Error("This Tx is closed: its step has ended");
    }
    return exec(sql, params);
  };
  const writable = () => {
    if (readOnly) {
      throw new Error("A read-only command wrote");
    }
  };
  const encodeDoc = (table: TableName, doc: unknown) => {
    Schema.encodeUnknownSync(tables[table].schema)(doc);
    return JSON.stringify(doc);
  };
  const keyParams = (table: TableName, doc: unknown) =>
    columnsOf(table).map((field) => sqlValue(valueAt(doc, field)));
  const rowOf = <T extends TableName>(
    table: T,
    row: { readonly id: number; readonly doc: string },
  ): Row<T> => ({
    id: new RowId(table, String(row.id)),
    doc: Schema.decodeUnknownSync(tables[table].schema)(parseJson(row.doc)),
  });
  const idOf = (id: RowId<string>) => {
    const key = Number(id.key);
    if (!Number.isSafeInteger(key)) {
      throw new Error(`Not a row id of this store: ${id.key}`);
    }
    return key;
  };
  const one = (
    rows: ReadonlyArray<Record<string, unknown>>,
    table: TableName,
    id: RowId<string>,
  ) => {
    if (decodeIds(rows).length !== 1) {
      throw new Error(`No row ${id.key} in ${table}`);
    }
  };

  return {
    insert: <T extends TableName>(table: T, doc: Doc<T>) =>
      Effect.sync(() => {
        writable();
        const columns = columnsOf(table);
        const text = encodeDoc(table, doc);
        const rows = decodeIds(
          run(
            `INSERT INTO ${quote(table)} (doc${columns.map((field) => `, ${quote(field.path)}`).join("")}) VALUES (?${columns
              .map(() => ", ?")
              .join("")}) RETURNING id`,
            [text, ...keyParams(table, doc)],
          ),
        );
        const inserted = rows.at(0);
        if (inserted === undefined) {
          throw new Error(`The insert into ${table} returned no id`);
        }
        return new RowId(table, String(inserted.id));
      }),
    get: <T extends TableName>(table: T, id: RowId<T>) =>
      Effect.sync((): Row<T> | undefined => {
        const row = decodeDocs(
          run(`SELECT id, doc FROM ${quote(table)} WHERE id = ?`, [idOf(id)]),
        )[0];
        return row === undefined ? undefined : rowOf(table, row);
      }),
    replace: <T extends TableName>(table: T, id: RowId<T>, doc: Doc<T>) =>
      Effect.sync(() => {
        writable();
        const columns = columnsOf(table);
        const text = encodeDoc(table, doc);
        one(
          run(
            `UPDATE ${quote(table)} SET doc = ?${columns.map((field) => `, ${quote(field.path)} = ?`).join("")} WHERE id = ? RETURNING id`,
            [text, ...keyParams(table, doc), idOf(id)],
          ),
          table,
          id,
        );
      }),
    delete: <T extends TableName>(table: T, id: RowId<T>) =>
      Effect.sync(() => {
        writable();
        one(run(`DELETE FROM ${quote(table)} WHERE id = ? RETURNING id`, [idOf(id)]), table, id);
      }),
    query: <T extends TableName>(table: T, index: IndexName<T>, query: Query) =>
      Effect.sync((): ReadonlyArray<Row<T>> => {
        const checked = checkQuery(tables, table, index, query);
        const conditions: Array<string> = [];
        const params: Array<SqlValue> = [];
        checked.eq.forEach((value, at) => {
          const field = checked.fields.at(at);
          if (field === undefined) {
            throw new Error(`${table}.${index}: the prefix is longer than the index`);
          }
          if (value === undefined) {
            conditions.push(`${quote(field.path)} IS NULL`);
          } else {
            conditions.push(`${quote(field.path)} = ?`);
            params.push(value);
          }
        });
        for (const bound of [checked.lower, checked.upper]) {
          if (bound !== undefined && checked.rangeField !== undefined) {
            const compiled = boundSql(quote(checked.rangeField.path), bound);
            conditions.push(compiled.sql);
            params.push(...compiled.params);
          }
        }
        const direction = checked.order === "asc" ? "ASC" : "DESC";
        const order = [...checked.fields.map((field) => quote(field.path)), "id"]
          .map((column) => `${column} ${direction}`)
          .join(", ");
        const where = conditions.length === 0 ? "" : ` WHERE ${conditions.join(" AND ")}`;
        params.push(checked.limit);
        const rows = decodeDocs(
          run(
            `SELECT id, doc FROM ${quote(table)} INDEXED BY ${quote(`${table}__${index}`)}${where} ORDER BY ${order} LIMIT ?`,
            params,
          ),
        );
        return rows.map((row) => rowOf(table, row));
      }),
  };
};
