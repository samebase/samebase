import { v } from "convex/values";
import { components } from "./_generated/api";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- This isolated component has no Samebase access wrapper.
import { action, query } from "./_generated/server";

export const run = action({
  args: { text: v.string() },
  returns: v.string(),
  handler: (ctx, args) => ctx.runAction(components.jobs.jobs.run, { text: args.text }),
});

export const latest = query({
  args: {},
  returns: v.union(v.null(), v.object({ input: v.string(), result: v.string() })),
  handler: (ctx) => ctx.runQuery(components.jobs.jobs.latest, {}),
});
