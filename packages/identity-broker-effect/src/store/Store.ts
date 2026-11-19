// The command boundary. The core calls `store.run(name, args)`; a storage host decodes the
// arguments, runs the rule as one all-or-nothing step over a fresh `Tx`, and returns the encoded
// result, which the caller decodes. Arguments and results are plain JSON.
import { Context, Effect, Schema } from "effect";
import { commands, type Args, type CommandName, type Result } from "../rules/commands.ts";
import { Tx, type TxShape } from "./Tx.ts";

export type { Args, CommandName, Result } from "../rules/commands.ts";

/** The storage host did not answer. The outcome of a write command is then unknown. */
export class StoreUnavailable extends Schema.TaggedError<StoreUnavailable>()(
  "StoreUnavailable",
  {},
) {}

export interface StoreShape {
  readonly run: <N extends CommandName>(
    name: N,
    args: Args<N>,
  ) => Effect.Effect<Result<N>, StoreUnavailable>;
}

export class Store extends Context.Service<Store, StoreShape>()(
  "identity-broker-effect/store/Store",
) {}

/** Decodes the arguments of `name`. Bad arguments are a defect of the caller. */
export const decodeArgs = <N extends CommandName>(name: N, input: unknown): Args<N> =>
  Schema.decodeUnknownSync(commands[name].args)(input);

/** Decodes the result of `name` on the caller's side. */
export const decodeResult = <N extends CommandName>(name: N, input: unknown): Result<N> =>
  Schema.decodeUnknownSync(commands[name].result)(input);

/**
 * Runs the rule of `name` to completion over `tx` and encodes its result, inside the host's
 * transaction, so a codec defect rolls the step back too. Throws on a defect, and on a rule that
 * suspends (`Effect.runSync` cannot finish it).
 */
export const runStep = <N extends CommandName>(
  name: N,
  args: Args<N>,
  now: number,
  tx: TxShape,
): unknown => {
  const command = commands[name];
  const result = Effect.runSync(command.rule(args, { now }).pipe(Effect.provideService(Tx, tx)));
  return Schema.encodeSync(command.result)(result);
};

/** Whether the command of `name` writes nothing. A host gives such a step a `Tx` that refuses writes. */
export const isReadOnly = (name: CommandName): boolean => commands[name].readOnly;
