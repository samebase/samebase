// The memory host, for tests: a `Store` over the memory adapter with a settable step clock.
import { Effect, Layer } from "effect";
import { MemoryDb } from "../store/memory.ts";
import {
  decodeArgs,
  decodeResult,
  isReadOnly,
  runStep,
  Store,
  type Args,
  type CommandName,
  type Result,
} from "../store/Store.ts";
import { Tx } from "../store/Tx.ts";

export const makeMemoryStore = (options: { readonly now: number } = { now: 0 }) => {
  const db = new MemoryDb();
  let now = options.now;

  /** Runs one command as one step, with the JSON boundary of a real host on both sides. */
  const run = <N extends CommandName>(name: N, args: Args<N>): Result<N> => {
    const decoded = decodeArgs(name, args);
    const encoded = db.step((tx) => runStep(name, decoded, now, tx), {
      readOnly: isReadOnly(name),
    });
    return decodeResult(name, encoded);
  };

  const store = Store.of({ run: (name, args) => Effect.sync(() => run(name, args)) });

  return {
    store,
    layer: Layer.succeed(Store, store),
    /** `store.run` as a plain call. A defect throws. */
    run,
    db,
    /** The step clock that the next command reads as `step.now`. */
    setNow: (ms: number) => {
      now = ms;
    },
    now: () => now,
    /** Runs `effect` as one step over a fresh `Tx`: seeds rows, or reads them. */
    withTx: <A>(effect: Effect.Effect<A, never, Tx>): A =>
      db.step((tx) => Effect.runSync(effect.pipe(Effect.provideService(Tx, tx)))),
  };
};

export type MemoryStore = ReturnType<typeof makeMemoryStore>;
