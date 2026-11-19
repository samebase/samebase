// Test support: random operation lists over three tables, as data, and the program that plays one
// step of them over a `Tx`. The adapter tests run the same steps on every adapter; a step crosses
// to a Convex backend as a Convex value, so an absent index value travels as `null` and `-0` keeps
// its sign.
import { Effect, Exit, Schema } from "effect";
import { tables, type Doc, type IndexName } from "./tables.ts";
import { RowId, Tx, type Bound, type IndexValue, type Query, type TxShape } from "./Tx.ts";

export const testTables = ["signIns", "signInPageExemptions", "clients"] as const;
type Table = (typeof testTables)[number];

export const indexNames = {
  signIns: ["by_app_id_and_at", "by_at"],
  signInPageExemptions: ["by_target"],
  clients: [
    "by_client_id",
    "by_app_id",
    "by_app_id_and_deployment_type",
    "by_deployment_type_and_activity",
    "by_remove_at",
  ],
} as const satisfies { readonly [T in Table]: ReadonlyArray<IndexName<T>> };

/** An index value; `null` stands for an absent field. */
const Slot = Schema.NullOr(Schema.Union([Schema.String, Schema.Number]));

const range = {
  eq: Schema.Array(Slot),
  lower: Schema.NullOr(Schema.Struct({ op: Schema.Literals(["gt", "gte"]), value: Slot })),
  upper: Schema.NullOr(Schema.Struct({ op: Schema.Literals(["lt", "lte"]), value: Slot })),
  order: Schema.Literals(["asc", "desc"]),
  limit: Schema.Number,
};

const Written = Schema.Union([
  Schema.Struct({ table: Schema.Literal("signIns"), doc: tables.signIns.schema }),
  Schema.Struct({
    table: Schema.Literal("signInPageExemptions"),
    doc: tables.signInPageExemptions.schema,
  }),
  Schema.Struct({ table: Schema.Literal("clients"), doc: tables.clients.schema }),
]);

export const Op = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("insert"), written: Written }),
  Schema.Struct({ kind: Schema.Literal("replace"), ref: Schema.Number, written: Written }),
  Schema.Struct({ kind: Schema.Literal("delete"), ref: Schema.Number }),
  Schema.Struct({ kind: Schema.Literal("get"), ref: Schema.Number }),
  Schema.Struct({
    kind: Schema.Literal("query"),
    table: Schema.Literal("signIns"),
    index: Schema.Literals(indexNames.signIns),
    ...range,
  }),
  Schema.Struct({
    kind: Schema.Literal("query"),
    table: Schema.Literal("signInPageExemptions"),
    index: Schema.Literals(indexNames.signInPageExemptions),
    ...range,
  }),
  Schema.Struct({
    kind: Schema.Literal("query"),
    table: Schema.Literal("clients"),
    index: Schema.Literals(indexNames.clients),
    ...range,
  }),
]);
export type Op = typeof Op.Type;
type QueryOp = Extract<Op, { readonly kind: "query" }>;

const Ref = Schema.Struct({ table: Schema.Literals(testTables), key: Schema.String });
export type Ref = typeof Ref.Type;

/** One step: its ops, where it dies (`null`: it does not), and the rows of the earlier steps. */
export const StepInput = Schema.Struct({
  ops: Schema.Array(Op),
  dieAt: Schema.NullOr(Schema.Number),
  refs: Schema.Array(Ref),
});
export type StepInput = typeof StepInput.Type;

/** What each op gave, the rows the step inserted, and every row after the step. */
export const StepOutput = Schema.Struct({
  log: Schema.Array(Schema.Unknown),
  added: Schema.Array(Ref),
  after: Schema.Array(Schema.Unknown),
});
export type StepOutput = typeof StepOutput.Type;

const value = (slot: string | number | null): IndexValue => (slot === null ? undefined : slot);

const queryOf = (op: QueryOp): Query => {
  const bounds: Array<Bound> = [];
  for (const bound of [op.lower, op.upper]) {
    if (bound !== null) {
      bounds.push({ op: bound.op, value: value(bound.value) });
    }
  }
  return {
    eq: op.eq.map(value),
    order: op.order,
    limit: op.limit,
    ...(bounds.length === 0 ? {} : { range: bounds }),
  };
};

const docs = <T extends Table>(rows: ReadonlyArray<{ readonly doc: Doc<T> }>) =>
  rows.map((row) => row.doc);

const runQuery = (tx: TxShape, op: QueryOp) => {
  switch (op.table) {
    case "signIns":
      return tx.query(op.table, op.index, queryOf(op)).pipe(Effect.map(docs));
    case "signInPageExemptions":
      return tx.query(op.table, op.index, queryOf(op)).pipe(Effect.map(docs));
    case "clients":
      return tx.query(op.table, op.index, queryOf(op)).pipe(Effect.map(docs));
    default:
      return op satisfies never;
  }
};

const scan = (order: "asc" | "desc"): Array<QueryOp> => {
  const all = { kind: "query", eq: [], lower: null, upper: null, order, limit: 1_000 } as const;
  return [
    ...indexNames.signIns.map((index): QueryOp => ({ ...all, table: "signIns", index })),
    ...indexNames.signInPageExemptions.map((index): QueryOp => ({
      ...all,
      table: "signInPageExemptions",
      index,
    })),
    ...indexNames.clients.map((index): QueryOp => ({ ...all, table: "clients", index })),
  ];
};

/** Every row of the three tables, in each index's order, both ways. */
const everything = Effect.gen(function* () {
  const tx = yield* Tx;
  const out: Array<unknown> = [];
  for (const op of [...scan("asc"), ...scan("desc")]) {
    out.push(yield* runQuery(tx, op));
  }
  return out;
});

const insert = (tx: TxShape, written: typeof Written.Type) => {
  switch (written.table) {
    case "signIns":
      return tx.insert(written.table, written.doc);
    case "signInPageExemptions":
      return tx.insert(written.table, written.doc);
    case "clients":
      return tx.insert(written.table, written.doc);
    default:
      return written satisfies never;
  }
};

/**
 * Plays one step. An op that dies is logged as "defect" and the step goes on; at `dieAt` the
 * whole step dies. A replace writes the op's document into the referenced row, whatever its table,
 * so a document of another table is a logged defect.
 */
export const playStep = (input: StepInput) =>
  Effect.gen(function* () {
    const tx = yield* Tx;
    const rows = input.refs.map((ref) => new RowId<Table>(ref.table, ref.key));
    const added: Array<RowId<Table>> = [];
    const refAt = (ref: number) => {
      const all = [...rows, ...added];
      return all.length === 0 ? undefined : all[ref % all.length];
    };
    const log: Array<unknown> = [];
    for (const [at, op] of input.ops.entries()) {
      if (at === input.dieAt) {
        return yield* Effect.die(new Error("a defect in the middle of a step"));
      }
      const outcome = yield* Effect.exit(
        Effect.gen(function* () {
          switch (op.kind) {
            case "insert": {
              added.push(yield* insert(tx, op.written));
              return "inserted";
            }
            case "replace": {
              const ref = refAt(op.ref);
              if (ref === undefined) return "no ref";
              // The op's table can differ from the row's: the `Tx` must refuse that document.
              yield* tx.replace(ref.table, ref, op.written.doc);
              return "replaced";
            }
            case "delete": {
              const ref = refAt(op.ref);
              if (ref === undefined) return "no ref";
              yield* tx.delete(ref.table, ref);
              return "deleted";
            }
            case "get": {
              const ref = refAt(op.ref);
              if (ref === undefined) return "no ref";
              return (yield* tx.get(ref.table, ref))?.doc ?? null;
            }
            case "query":
              return yield* runQuery(tx, op);
            default:
              return op satisfies never;
          }
        }),
      );
      log.push(Exit.isSuccess(outcome) ? outcome.value : "defect");
    }
    const output: StepOutput = {
      log,
      added: added.map((id) => ({ table: id.table, key: id.key })),
      after: yield* everything,
    };
    return output;
  });

/** The step that only reads: the state after an earlier step that died. */
export const readStep: StepInput = { ops: [], dieAt: null, refs: [] };
