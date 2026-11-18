import { Effect, Schema } from "effect";
import { CommandNameSchema } from "../rules/commands.ts";
import { Store, type Args, type CommandName } from "../store/Store.ts";

/**
 * A command that failed or did not answer. The router answers it with 500 and logs only the
 * command name: never the cause, whose text can hold what the store or the RPC wrote, so the
 * error keeps no cause. A lost reply is an unknown outcome, so nothing retries the command
 * (design section 2.2).
 */
export class CommandFailed extends Schema.TaggedError<CommandFailed>()("CommandFailed", {
  command: CommandNameSchema,
}) {}

/** Runs one command of the closed registry, once. Any failure or defect becomes `CommandFailed`. */
export const command = Effect.fn("command")(function* <N extends CommandName>(
  name: N,
  args: Args<N>,
) {
  const store = yield* Store;
  return yield* store
    .run(name, args)
    .pipe(Effect.catchCause(() => Effect.fail(new CommandFailed({ command: name }))));
});
