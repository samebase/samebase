// The memory host, for tests: a `Store` over the memory adapter with a settable step clock.
import { Effect, Layer } from "effect";
import {
  decodeCommand,
  decodeResult,
  encodeArgs,
  type Args,
  type CommandName,
  type Result,
} from "../store/commands.ts";
import { MemoryDb } from "../store/memory.ts";
import { Store } from "../store/Store.ts";
import type { Tables } from "../store/tables.ts";
import type { TxShape } from "../store/Tx.ts";

export const makeMemoryStore = (options: { readonly now: number } = { now: 0 }) => {
  const db = new MemoryDb();
  let now = options.now;

  /** Runs one command as one step, from its encoded arguments to its encoded result. */
  const runEncoded = (name: string, args: unknown): unknown => {
    const command = decodeCommand(name, args);
    return db.step((tx) => command.run(now, tx), { readOnly: command.readOnly });
  };

  const store = Store.of({ run: (name, args) => Effect.sync(() => runEncoded(name, args)) });

  return {
    store,
    layer: Layer.succeed(Store, store),
    /** `store.run` as a plain typed call, with the JSON boundary of a real host. A defect throws. */
    run: <N extends CommandName>(name: N, args: Args<N>): Result<N> =>
      decodeResult(name, runEncoded(name, encodeArgs(name, args))),
    db,
    /** The step clock that the next command reads as `step.now`. */
    setNow: (ms: number) => {
      now = ms;
    },
    now: () => now,
    /** Runs `body` as one step over a fresh `Tx`: seeds rows, or reads them. */
    withTx: <A>(body: (tx: TxShape<Tables>) => Effect.Effect<A>): A =>
      db.step((tx) => Effect.runSync(body(tx))),
  };
};

export type MemoryStore = ReturnType<typeof makeMemoryStore>;
