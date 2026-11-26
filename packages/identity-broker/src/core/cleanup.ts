import { Effect } from "effect";
import { command as connectionsCommand } from "../connections/commands.ts";
import { command } from "./command.ts";

/** How long the cleanup keeps an audit row of an issued id_token. */
const SIGN_IN_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * One batch of the broker's daily cleanup through the `Store`: expired connection requests and codes,
 * then the core's expired rows, each command its own transaction. Answers whether rows older than
 * `cutoff` are left. A host runs batches with one `cutoff` until none are left.
 */
export const cleanupBatch = (cutoff: number) =>
  Effect.gen(function* () {
    if ((yield* connectionsCommand("connections.cleanup", { now: cutoff })).more) {
      return true;
    }
    return (yield* command("lifecycle.cleanup", {
      now: cutoff,
      signInRetentionMs: SIGN_IN_RETENTION_MS,
    })).more;
  });
