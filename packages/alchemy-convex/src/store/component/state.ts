// The data functions of the alchemyState component: the Alchemy state of
// every stack and stage, in the tables `resources` and `outputs`. Only the app
// that mounts the component calls them. The store app (src/store/convex)
// forwards its internal `state:*` functions here with the same results.
//
// A stage holds one row for each resource of its stack, so the reads of one
// stage collect all rows.
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server.js";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Store entrypoints have no app wrapper; the reader and the deploy key enforce access.
import { mutation, query } from "./_generated/server.js";

const stage = { stack: v.string(), stage: v.string() };
const resource = { ...stage, fqn: v.string() };

const rowOf = (ctx: QueryCtx, args: { stack: string; stage: string; fqn: string }) =>
  ctx.db
    .query("resources")
    .withIndex("by_fqn", (q) =>
      q.eq("stack", args.stack).eq("stage", args.stage).eq("fqn", args.fqn),
    )
    .unique();

const rowsOf = (ctx: QueryCtx, args: { stack: string; stage: string }) =>
  ctx.db
    .query("resources")
    .withIndex("by_fqn", (q) => q.eq("stack", args.stack).eq("stage", args.stage))
    .collect();

const outputOf = (ctx: QueryCtx, args: { stack: string; stage: string }) =>
  ctx.db
    .query("outputs")
    .withIndex("by_stage", (q) => q.eq("stack", args.stack).eq("stage", args.stage))
    .unique();

/** The sorted union of two lists of names. */
const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])].sort();

/**
 * The distinct names of one table in index order, with one index read for
 * each name: `first(after)` is the first row whose name is above `after`.
 */
const distinct = async (first: (after: string | undefined) => Promise<string | null>) => {
  const names: string[] = [];
  for (;;) {
    const next = await first(names.at(-1));
    if (next === null) return names;
    names.push(next);
  }
};

/** Stacks with at least one resource or one output, sorted. */
export const stacks = query({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) =>
    union(
      await distinct(
        async (after) =>
          (
            await ctx.db
              .query("resources")
              .withIndex("by_fqn", (q) => (after === undefined ? q : q.gt("stack", after)))
              .first()
          )?.stack ?? null,
      ),
      await distinct(
        async (after) =>
          (
            await ctx.db
              .query("outputs")
              .withIndex("by_stage", (q) => (after === undefined ? q : q.gt("stack", after)))
              .first()
          )?.stack ?? null,
      ),
    ),
});

/** Stages of a stack with at least one resource or one output, sorted. */
export const stages = query({
  args: { stack: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) =>
    union(
      await distinct(
        async (after) =>
          (
            await ctx.db
              .query("resources")
              .withIndex("by_fqn", (q) =>
                after === undefined
                  ? q.eq("stack", args.stack)
                  : q.eq("stack", args.stack).gt("stage", after),
              )
              .first()
          )?.stage ?? null,
      ),
      await distinct(
        async (after) =>
          (
            await ctx.db
              .query("outputs")
              .withIndex("by_stage", (q) =>
                after === undefined
                  ? q.eq("stack", args.stack)
                  : q.eq("stack", args.stack).gt("stage", after),
              )
              .first()
          )?.stage ?? null,
      ),
    ),
});

export const list = query({
  args: stage,
  returns: v.array(v.string()),
  handler: async (ctx, args) => (await rowsOf(ctx, args)).map((row) => row.fqn),
});

export const get = query({
  args: resource,
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => (await rowOf(ctx, args))?.value ?? null,
});

/** Resources whose state has `status: "replaced"`. */
export const replaced = query({
  args: stage,
  returns: v.array(v.object({ fqn: v.string(), value: v.string() })),
  handler: async (ctx, args) =>
    (await rowsOf(ctx, args))
      .map((row) => ({ fqn: row.fqn, value: row.value }))
      .filter(({ value }) => {
        const parsed: unknown = JSON.parse(value);
        return (
          typeof parsed === "object" &&
          parsed !== null &&
          "status" in parsed &&
          parsed.status === "replaced"
        );
      }),
});

/** A resource write reads and writes only the row of that resource. */
export const set = mutation({
  args: { ...resource, value: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await rowOf(ctx, args);
    if (row === null)
      await ctx.db.insert("resources", {
        stack: args.stack,
        stage: args.stage,
        fqn: args.fqn,
        value: args.value,
      });
    else await ctx.db.patch("resources", row._id, { value: args.value });
    return null;
  },
});

export const remove = mutation({
  args: resource,
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await rowOf(ctx, args);
    if (row !== null) await ctx.db.delete("resources", row._id);
    return null;
  },
});

/** Deletes the resources and outputs of one stage, or of every stage of the stack (`stage: null`). */
export const removeStack = mutation({
  args: { stack: v.string(), stage: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { stack } = args;
    const resources = await ctx.db
      .query("resources")
      .withIndex("by_fqn", (q) =>
        args.stage === null ? q.eq("stack", stack) : q.eq("stack", stack).eq("stage", args.stage),
      )
      .collect();
    const outputs = await ctx.db
      .query("outputs")
      .withIndex("by_stage", (q) =>
        args.stage === null ? q.eq("stack", stack) : q.eq("stack", stack).eq("stage", args.stage),
      )
      .collect();
    for (const row of resources) await ctx.db.delete("resources", row._id);
    for (const row of outputs) await ctx.db.delete("outputs", row._id);
    return null;
  },
});

export const getOutput = query({
  args: stage,
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => (await outputOf(ctx, args))?.value ?? null,
});

export const setOutput = mutation({
  args: { ...stage, value: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await outputOf(ctx, args);
    if (row !== null) await ctx.db.patch("outputs", row._id, { value: args.value });
    else
      await ctx.db.insert("outputs", { stack: args.stack, stage: args.stage, value: args.value });
    return null;
  },
});

const REDACTED = "__redacted__";

/**
 * A row's JSON text without its secrets. A secret of store version 7 (`__redacted__`, sealed or in
 * clear text) and a secret that the client sealed (`__sealed__`) become `{"__redacted__": null}`.
 * The header of a sealed record, the top-level field `__alchemy_sealed__`, holds the wrapped data
 * key: it is dropped, and a record that is not an object comes from its `value`.
 */
export const withoutSecrets = (text: string) => {
  const parsed: unknown = JSON.parse(text, (_key, value: unknown) =>
    typeof value === "object" && value !== null && (REDACTED in value || "__sealed__" in value)
      ? { [REDACTED]: null }
      : value,
  );
  if (typeof parsed !== "object" || parsed === null || !("__alchemy_sealed__" in parsed)) {
    return JSON.stringify(parsed);
  }
  const { __alchemy_sealed__: header, ...record } = parsed;
  return JSON.stringify(
    typeof header === "object" && header !== null && "value" in header ? header.value : record,
  );
};

/**
 * One stage as the store holds it, without secrets: its resources in fqn order and its output, as
 * JSON texts, with `output: null` for a stage without one. {@link readStack} and the repository
 * reader give stages in this shape, and the shape is Alchemy state only: a reader takes anything
 * else from the output.
 */
export const storedStage = v.object({
  name: v.string(),
  resources: v.array(v.object({ fqn: v.string(), value: v.string() })),
  output: v.union(v.string(), v.null()),
});

/** The reply of {@link readStack}. */
export const stackReply = v.object({ stages: v.array(storedStage) });

/**
 * One call for a reader: every stage of a stack in name order, each with its
 * resources in fqn order and its output, as the JSON texts that the rows
 * hold without their secrets. A stage with an output and no resource is listed with an empty
 * resource list; a stage with resources and no output with `output: null`.
 * One function reads at most 16 MiB (Convex limit): a stack whose rows go
 * beyond that fails here and is read with `stages`, `list`, `get`, and
 * `getOutput` instead.
 */
export const readStack = query({
  args: { stack: v.string() },
  returns: stackReply,
  handler: async (ctx, args) => {
    // Both indexes order by stack, then stage, then (for resources) fqn.
    const resources = await ctx.db
      .query("resources")
      .withIndex("by_fqn", (q) => q.eq("stack", args.stack))
      .collect();
    const outputs = await ctx.db
      .query("outputs")
      .withIndex("by_stage", (q) => q.eq("stack", args.stack))
      .collect();
    const stages = union(
      [...new Set(resources.map((row) => row.stage))],
      [...new Set(outputs.map((row) => row.stage))],
    );
    return {
      stages: stages.map((stage) => {
        const output = outputs.find((row) => row.stage === stage);
        return {
          name: stage,
          resources: resources
            .filter((row) => row.stage === stage)
            .map((row) => ({ fqn: row.fqn, value: withoutSecrets(row.value) })),
          output: output?.value === undefined ? null : withoutSecrets(output.value),
        };
      }),
    };
  },
});
