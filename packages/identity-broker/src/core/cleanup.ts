import { Effect } from "effect";
import { command as integrationsCommand } from "../integrations/commands.ts";
import { command } from "./command.ts";

/**
 * One batch of the broker's cleanup through the `Store`: expired connection requests and codes,
 * then the core's expired rows, each command its own transaction. Answers whether rows older than
 * `cutoff` are left. A host runs batches with one `cutoff` until none are left.
 */
export const cleanupBatch = (cutoff: number) =>
  Effect.gen(function* () {
    if ((yield* integrationsCommand("connections.cleanup", { now: cutoff })).more) {
      return true;
    }
    return (yield* command("lifecycle.cleanup", { now: cutoff })).more;
  });
