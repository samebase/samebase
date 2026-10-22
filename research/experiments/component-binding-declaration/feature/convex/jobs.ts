import { v } from "convex/values";
import { internal } from "./_generated/api";
// eslint-disable-next-line samebase/no-raw-public-convex-function-builders -- This isolated component uses the normal Convex API, outside Samebase app access wrappers.
import { action, env, internalMutation, query } from "./_generated/server";

const { string, id, object, union, null: nullValue } = v;
const result = object({ input: string(), output: string() });

export const save = internalMutation({
  args: { input: string(), output: string() },
  returns: id("results"),
  handler: (ctx, args) => ctx.db.insert("results", { input: args.input, output: args.output }),
});

export const run = action({
  args: { input: string() },
  returns: string(),
  handler: async (ctx, args) => {
    const response = await fetch(env.WORKER_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${env.WORKER_SECRET}`, "content-type": "text/plain" },
      body: args.input,
    });
    if (!response.ok) throw new Error(`Worker rejected the request: ${response.status}`);
    const output = await response.text();
    await ctx.runMutation(internal.jobs.save, { input: args.input, output });
    return output;
  },
});

export const latest = query({
  args: {},
  returns: union(result, nullValue()),
  handler: async (ctx) => {
    const row = await ctx.db.query("results").order("desc").first();
    return row ? { input: row.input, output: row.output } : null;
  },
});
