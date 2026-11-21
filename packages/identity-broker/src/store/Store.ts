// The command boundary. A handler calls `store.run(name, args)` with the command's arguments
// encoded as plain JSON; a storage host decodes them, runs the rule as one all-or-nothing step, and
// returns the encoded result. The typed side of each catalog (src/core/command.ts for the core, and
// each layer's own) encodes and decodes against that catalog's schemas.
import { Context, Effect, Schema, Scheduler } from "effect";

/** The storage host did not answer. The outcome of a write command is then unknown. */
export class StoreUnavailable extends Schema.TaggedError<StoreUnavailable>()(
  "StoreUnavailable",
  {},
) {}

export interface StoreShape {
  /** `args` and the answer are the command's encoded arguments and result. */
  readonly run: (name: string, args: unknown) => Effect.Effect<unknown, StoreUnavailable>;
}

export class Store extends Context.Service<Store, StoreShape>()("identity-broker/store/Store") {}

/**
 * A scheduler that yields with microtasks only. The default one calls `setTimeout` when a fiber
 * has run 2048 operations, and a Convex query or mutation fails at any `setTimeout` call, even a
 * caught one.
 */
export const microtaskScheduler = () => new Scheduler.MixedScheduler("sync");
