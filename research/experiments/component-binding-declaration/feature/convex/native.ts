import { workerUrl, RuntimeContext } from "../../.local/output-entry.js";
import * as Effect from "effect/Effect";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { outputContext } from "./outputContext.ts";
// eslint-disable-next-line samebase/no-raw-public-convex-function-builders -- This local probe tests the normal component action API.
import { action, env } from "./_generated/server";

export const read = action({
  args: { input: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const url = await Effect.runPromise(
      Effect.gen(function* () {
        const readUrl = yield* workerUrl;
        return yield* readUrl;
      }).pipe(Effect.provideService(RuntimeContext, outputContext({ workerUrl: env.WORKER_URL }))),
    );
    if (!url) throw new Error("Worker URL was not bound");
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${env.WORKER_SECRET}` },
      body: args.input,
    });
    if (!response.ok) throw new Error(`Worker rejected the request: ${response.status}`);
    const output = await response.text();
    await ctx.runMutation(internal.jobs.save, { input: args.input, output });
    return output;
  },
});
