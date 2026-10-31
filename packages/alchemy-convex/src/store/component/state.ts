// The data functions of the alchemyState component: the Alchemy state of
// every stack and stage, in the tables `resources` and `outputs`. Only the app
// that mounts the component calls them. The store app (src/store/convex)
// forwards its internal `state:*` functions here with the same results.
//
// A stage holds one row for each resource of its stack, so the reads of one
// stage collect all rows.
import { v, type Infer, type Validator } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Store entrypoints have no app wrapper; the reader and the deploy key enforce access.
import { mutation, query } from "./_generated/server.js";
import { generationOf } from "./keys.ts";
import { runRecord } from "./runRecord.ts";

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

/**
 * The run record of a write, or null for a write without one. The app's
 * functions take it as an optional field; across the component boundary it is
 * a required field, because the generated component API types an optional
 * field without `undefined`.
 */
const run = v.union(runRecord, v.null());

/** A resource write and its current run become visible in one transaction. */
const writeCurrentRun = async (
  ctx: MutationCtx,
  args: { stack: string; stage: string; run: Infer<typeof run> },
) => {
  const output = await outputOf(ctx, args);
  // A write without a run record clears the record of the previous run.
  if (output !== null)
    await ctx.db.patch("outputs", output._id, { currentRun: args.run ?? undefined });
  else if (args.run !== null)
    await ctx.db.insert("outputs", { stack: args.stack, stage: args.stage, currentRun: args.run });
};

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

export const set = mutation({
  args: { ...resource, value: v.string(), run },
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
    await writeCurrentRun(ctx, args);
    return null;
  },
});

export const remove = mutation({
  args: { ...resource, run },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await rowOf(ctx, args);
    if (row !== null) await ctx.db.delete("resources", row._id);
    await writeCurrentRun(ctx, args);
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
  args: { ...stage, value: v.string(), run },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await outputOf(ctx, args);
    if (row === null)
      await ctx.db.insert("outputs", { stack: args.stack, stage: args.stage, value: args.value });
    else await ctx.db.patch("outputs", row._id, { value: args.value });
    await writeCurrentRun(ctx, args);
    return null;
  },
});

/** A document holds at most 1 MiB, so one page reads less than the 16 MiB of one function. */
const RESEAL_PAGE = 10;

const pageOf = <Row extends Validator<unknown, "required", string>>(row: Row) =>
  v.object({ page: v.array(row), continueCursor: v.string(), isDone: v.boolean() });

const resealRow = v.object({ ...resource, value: v.string() });

/**
 * One bounded page of the resources, in table order, for a reseal. `list` and `readStack` read a
 * whole stage or stack, which can pass the read limit of one function.
 */
export const resourcePage = query({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: pageOf(resealRow),
  handler: async (ctx, args) => {
    const { page, continueCursor, isDone } = await ctx.db
      .query("resources")
      .paginate({ cursor: args.cursor, numItems: RESEAL_PAGE });
    return {
      page: page.map(({ stack, stage, fqn, value }) => ({ stack, stage, fqn, value })),
      continueCursor,
      isDone,
    };
  },
});

/** One bounded page of the outputs. A row with only a run record has no value and is left out. */
export const outputPage = query({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: pageOf(v.object({ ...stage, value: v.string() })),
  handler: async (ctx, args) => {
    const { page, continueCursor, isDone } = await ctx.db
      .query("outputs")
      .paginate({ cursor: args.cursor, numItems: RESEAL_PAGE });
    return {
      page: page.flatMap(({ stack, stage, value }) =>
        value === undefined ? [] : [{ stack, stage, value }],
      ),
      continueCursor,
      isDone,
    };
  },
});

/**
 * What a reseal write did. `stale` means that a rotation came after the sweep started: that sweep
 * must not put an older key back over the work of a newer one.
 */
const replaceResult = v.union(v.literal("replaced"), v.literal("changed"), v.literal("stale"));

/**
 * Replaces the value of a row that still holds `expected`, for a reseal of `generation`: the row
 * keeps its run record.
 */
export const replaceResource = mutation({
  args: { ...resource, expected: v.string(), value: v.string(), generation: v.number() },
  returns: replaceResult,
  handler: async (ctx, args) => {
    if ((await generationOf(ctx)) !== args.generation) return "stale";
    const row = await rowOf(ctx, args);
    if (row === null || row.value !== args.expected) return "changed";
    await ctx.db.patch("resources", row._id, { value: args.value });
    return "replaced";
  },
});

/** Like {@link replaceResource}, for an output. */
export const replaceOutput = mutation({
  args: { ...stage, expected: v.string(), value: v.string(), generation: v.number() },
  returns: replaceResult,
  handler: async (ctx, args) => {
    if ((await generationOf(ctx)) !== args.generation) return "stale";
    const row = await outputOf(ctx, args);
    if (row === null || row.value !== args.expected) return "changed";
    await ctx.db.patch("outputs", row._id, { value: args.value });
    return "replaced";
  },
});

/** The reply of {@link readStack}. */
export const stackReply = v.object({
  stages: v.array(
    v.object({
      stage: v.string(),
      resources: v.array(v.object({ fqn: v.string(), value: v.string() })),
      output: v.union(v.string(), v.null()),
      record: v.union(runRecord, v.null()),
    }),
  ),
});

/**
 * One call for a reader: every stage of a stack in name order, each with its
 * resources in fqn order and its output, as the JSON texts that the rows
 * hold. A stage with an output and no resource is listed with an empty
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
          stage,
          resources: resources
            .filter((row) => row.stage === stage)
            .map((row) => ({ fqn: row.fqn, value: row.value })),
          output: output?.value ?? null,
          record: output?.currentRun ?? null,
        };
      }),
    };
  },
});
