import { v } from "convex/values";
import { components } from "./_generated/api.ts";
import { action, query } from "./_generated/server.ts";

export const submit = action({
  args: { text: v.string() },
  returns: v.string(),
  handler: (ctx, args) => ctx.runAction(components.jobs.jobs.submit, { text: args.text }),
});

export const result = query({
  args: { id: v.string() },
  returns: v.union(v.null(), v.object({ input: v.string(), output: v.string() })),
  handler: (ctx, args) => ctx.runQuery(components.jobs.jobs.result, { id: args.id }),
});
