import { Effect } from "effect";
import { Store, type Args, type CommandName } from "../store/Store.ts";

/**
 * A command that failed or did not answer. The router catches it, answers 500 and logs only the
 * command name: never the cause, whose text can hold what the store or the RPC wrote. A lost reply
 * is an unknown outcome, so nothing retries the command (design section 2.2).
 */
export class CommandFailed extends Error {
  constructor(readonly command: CommandName) {
    super(`The command ${command} failed`);
  }
}

/** Runs one command of the closed registry, once. Any failure or defect becomes `CommandFailed`. */
export const command = <N extends CommandName>(name: N, args: Args<N>) =>
  Effect.gen(function* () {
    const store = yield* Store;
    return yield* store.run(name, args);
  }).pipe(Effect.catchCause(() => Effect.die(new CommandFailed(name))));
