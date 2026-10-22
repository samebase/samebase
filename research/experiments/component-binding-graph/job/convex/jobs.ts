import { v } from "convex/values";
import { internal } from "./_generated/api";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- This isolated component has no Samebase access wrapper.
import { action, env, internalMutation, query } from "./_generated/server";

export const save = internalMutation({
  args: { input: v.string(), result: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("jobs", { input: args.input, result: args.result });
    return null;
  },
});

export const run = action({
  args: { text: v.string() },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const response = await fetch(env.WORKER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WORKER_SECRET}` },
      body: args.text,
    });
    if (!response.ok) throw new Error(`Worker returned ${response.status}`);
    const result = await response.text();
    await ctx.runMutation(internal.jobs.save, { input: args.text, result });
    return result;
  },
});

export const latest = query({
  args: {},
  returns: v.union(v.null(), v.object({ input: v.string(), result: v.string() })),
  handler: async (ctx) => {
    const result = await ctx.db.query("jobs").order("desc").first();
    return result === null ? null : { input: result.input, result: result.result };
  },
});
