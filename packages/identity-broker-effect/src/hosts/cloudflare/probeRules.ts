// The deploy probe's state rules. They have no host import, so the same text runs in the Durable
// Object (synchronous SQL under `transactionSync`) and in the tests (a Map). The real `Tx` of
// `src/store/Tx.ts` replaces this one.
import { Context, Effect, Schema } from "effect";

export class Tx extends Context.Service<
  Tx,
  {
    readonly get: (key: string) => Effect.Effect<number | undefined>;
    readonly put: (key: string, value: number) => Effect.Effect<void>;
  }
>()("identity-broker-effect/hosts/cloudflare/probe/Tx") {}

/** The arguments of every probe rule, plain JSON across the Durable Object RPC boundary. */
export const RuleArgs = Schema.Struct({ key: Schema.String });

/** Adds one to the counter at `key` and returns the new value. */
const increment = (args: typeof RuleArgs.Type) =>
  Effect.gen(function* () {
    const tx = yield* Tx;
    const next = ((yield* tx.get(args.key)) ?? 0) + 1;
    yield* tx.put(args.key, next);
    return next;
  });

/** Returns the counter at `key`, 0 when absent. */
const read = (args: typeof RuleArgs.Type) =>
  Effect.gen(function* () {
    const tx = yield* Tx;
    return (yield* tx.get(args.key)) ?? 0;
  });

/** Writes the counter at `key`, then fails with a defect. The host must roll the write back. */
const failAfterWrite = (args: typeof RuleArgs.Type) =>
  Effect.gen(function* () {
    const tx = yield* Tx;
    yield* tx.put(args.key, 1_000_000);
    return yield* Effect.die(new Error("probe defect after a write"));
  });

export const rules = { increment, read, failAfterWrite };

export const RuleName = Schema.Literals(["increment", "read", "failAfterWrite"]);
export type RuleName = typeof RuleName.Type;
