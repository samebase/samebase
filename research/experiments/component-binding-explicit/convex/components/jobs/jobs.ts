import { v } from "convex/values";
import { internal } from "./_generated/api.ts";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server.ts";

export const configure = mutation({
  args: { url: v.string(), secret: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const previous = await ctx.db.query("workerBindings").unique();
    const binding = { url: args.url, secret: args.secret };
    if (previous) await ctx.db.replace("workerBindings", previous._id, binding);
    else await ctx.db.insert("workerBindings", binding);
    return null;
  },
});

export const binding = internalQuery({
  args: {},
  returns: v.object({ url: v.string(), secret: v.string() }),
  handler: async (ctx) => {
    const value = await ctx.db.query("workerBindings").unique();
    if (!value) throw new Error("Worker is not configured");
    return { url: value.url, secret: value.secret };
  },
});

export const save = internalMutation({
  args: { input: v.string(), output: v.string() },
  returns: v.id("results"),
  handler: (ctx, args) => ctx.db.insert("results", { input: args.input, output: args.output }),
});

export const submit = action({
  args: { text: v.string() },
  returns: v.id("results"),
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(internal.jobs.binding, {});
    const response = await fetch(config.url, {
      method: "POST",
      headers: { authorization: `Bearer ${config.secret}`, "content-type": "text/plain" },
      body: args.text,
    });
    if (!response.ok) throw new Error(`Worker rejected the job (${response.status})`);
    return await ctx.runMutation(internal.jobs.save, {
      input: args.text,
      output: await response.text(),
    });
  },
});

export const result = query({
  args: { id: v.id("results") },
  returns: v.union(v.null(), v.object({ input: v.string(), output: v.string() })),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("results", args.id);
    return row ? { input: row.input, output: row.output } : null;
  },
});
