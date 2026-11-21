import { Effect, Schema } from "effect";
import { coreCommands, type CoreCommandName } from "../rules/commands.ts";
import { Store } from "../store/Store.ts";

/**
 * A command that failed or did not answer. The router answers it with 500 and logs only the
 * command name: never the cause, whose text can hold what the store or the RPC wrote, so the
 * error keeps no cause. A lost reply is an unknown outcome, so nothing retries the command
 * (design section 2.2).
 */
export class CommandFailed extends Schema.TaggedError<CommandFailed>()("CommandFailed", {
  command: Schema.String,
}) {}

/**
 * Runs the command `name` once through the `Store`, with the schemas of its catalog's
 * `definition`. Any failure or defect becomes `CommandFailed`.
 */
export const runCommand = <A, R>(
  name: string,
  definition: {
    readonly args: Schema.Codec<A, unknown>;
    readonly result: Schema.Codec<R, unknown>;
  },
  args: A,
) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const encoded = yield* store.run(name, Schema.encodeSync(definition.args)(args));
    return Schema.decodeUnknownSync(definition.result)(encoded);
  }).pipe(Effect.catchCause(() => Effect.fail(new CommandFailed({ command: name }))));

/** Runs one command of the core, once. */
export const command = <N extends CoreCommandName>(
  name: N,
  args: (typeof coreCommands)[N]["args"]["Type"],
) => runCommand(name, coreCommands[name], args);
