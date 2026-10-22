import { v } from "convex/values";
import { components } from "./_generated/api";
// eslint-disable-next-line samebase/no-raw-public-convex-function-builders -- This isolated local host has no Samebase app access wrapper.
import { action, query } from "./_generated/server";

export const run = action({
  args: { input: v.string() },
  returns: v.string(),
  handler: (ctx, args) => ctx.runAction(components.textJobs.jobs.run, { input: args.input }),
});

export const latest = query({
  args: {},
  returns: v.union(v.object({ input: v.string(), output: v.string() }), v.null()),
  handler: (ctx) => ctx.runQuery(components.textJobs.jobs.latest, {}),
});
