// The state functions of the alchemy-state-store project of a team: one project for each
// Convex team, pushed by Convex.state() from this directory. These raw state
// functions are internal. reader.ts exposes authenticated, redacted reads.
//
// The rows are in the alchemyState component (src/store/component). Each
// function here forwards to the component function of the same name, with the
// same results; an absent `run` or `stage` goes to the component as null.
// These names and arguments are the wire contract of STORE_VERSION. Samebase
// reads `stacks`, `getOutput`, and `readStack` by name: a renamed function is
// a version bump of the store and of Samebase.
//
// The rows hold their secrets sealed (see sealing.ts): `set` and `setOutput`
// are actions that seal and then write, and `get`, `replaced`, and `getOutput`
// open them for the run. `readStack` gives the rows as they are stored.
import { v } from "convex/values";
import { runRecord } from "../component/runRecord.ts";
import { stackReply } from "../component/state.ts";
import { components, internal } from "./_generated/api.js";
import { internalAction, internalMutation, internalQuery } from "./_generated/server.js";
import { openText, outputAad, resealText, resourceAad, sealText } from "./sealing.ts";
import { STORE_VERSION } from "./version.ts";

const state = components.alchemyState.state;

/** The wire version of this store, compared with the client's STORE_VERSION. */
export const version = internalQuery({
  args: {},
  returns: v.number(),
  handler: async () => STORE_VERSION,
});

/** Stacks with at least one resource or one output, sorted. */
export const stacks = internalQuery({
  args: {},
  returns: v.array(v.string()),
  handler: (ctx) => ctx.runQuery(state.stacks, {}),
});

/** Stages of a stack with at least one resource or one output, sorted. */
export const stages = internalQuery({
  args: { stack: v.string() },
  returns: v.array(v.string()),
  handler: (ctx, args) => ctx.runQuery(state.stages, { stack: args.stack }),
});

export const list = internalQuery({
  args: { stack: v.string(), stage: v.string() },
  returns: v.array(v.string()),
  handler: (ctx, args) => ctx.runQuery(state.list, { stack: args.stack, stage: args.stage }),
});

export const get = internalQuery({
  args: { stack: v.string(), stage: v.string(), fqn: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const row = { stack: args.stack, stage: args.stage, fqn: args.fqn };
    const value = await ctx.runQuery(state.get, row);
    return value === null ? null : openText(value, resourceAad(row));
  },
});

/** Resources whose state has `status: "replaced"`. */
export const replaced = internalQuery({
  args: { stack: v.string(), stage: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const rows = await ctx.runQuery(state.replaced, { stack: args.stack, stage: args.stage });
    return Promise.all(
      rows.map((row) =>
        openText(row.value, resourceAad({ stack: args.stack, stage: args.stage, fqn: row.fqn })),
      ),
    );
  },
});

const setArgs = {
  stack: v.string(),
  stage: v.string(),
  fqn: v.string(),
  value: v.string(),
  run: v.optional(runRecord),
};

export const set = internalAction({
  args: setArgs,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    ctx.runMutation(internal.state.writeResource, {
      ...args,
      value: await sealText(args.value, resourceAad(args)),
    }),
});

/** The write of `set`, with its secrets sealed. */
export const writeResource = internalMutation({
  args: setArgs,
  returns: v.null(),
  handler: (ctx, args) =>
    ctx.runMutation(state.set, {
      stack: args.stack,
      stage: args.stage,
      fqn: args.fqn,
      value: args.value,
      run: args.run ?? null,
    }),
});

export const remove = internalMutation({
  args: { stack: v.string(), stage: v.string(), fqn: v.string(), run: v.optional(runRecord) },
  returns: v.null(),
  handler: (ctx, args) =>
    ctx.runMutation(state.remove, {
      stack: args.stack,
      stage: args.stage,
      fqn: args.fqn,
      run: args.run ?? null,
    }),
});

/** Deletes the resources and outputs of one stage, or of every stage of the stack. */
export const removeStack = internalMutation({
  args: { stack: v.string(), stage: v.optional(v.string()) },
  returns: v.null(),
  handler: (ctx, args) =>
    ctx.runMutation(state.removeStack, { stack: args.stack, stage: args.stage ?? null }),
});

export const getOutput = internalQuery({
  args: { stack: v.string(), stage: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const row = { stack: args.stack, stage: args.stage };
    const value = await ctx.runQuery(state.getOutput, row);
    return value === null ? null : openText(value, outputAad(row));
  },
});

const setOutputArgs = {
  stack: v.string(),
  stage: v.string(),
  value: v.string(),
  run: v.optional(runRecord),
};

export const setOutput = internalAction({
  args: setOutputArgs,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    ctx.runMutation(internal.state.writeOutput, {
      ...args,
      value: await sealText(args.value, outputAad(args)),
    }),
});

/** The write of `setOutput`, with its secrets sealed. */
export const writeOutput = internalMutation({
  args: setOutputArgs,
  returns: v.null(),
  handler: (ctx, args) =>
    ctx.runMutation(state.setOutput, {
      stack: args.stack,
      stage: args.stage,
      value: args.value,
      run: args.run ?? null,
    }),
});

/** Every stage of a stack with its resources, output, and current record, in one call. Since store version 2. */
export const readStack = internalQuery({
  args: { stack: v.string() },
  returns: stackReply,
  handler: (ctx, args) => ctx.runQuery(state.readStack, { stack: args.stack }),
});

/**
 * Seals every secret of the store under the current key. A client runs it after each push, which
 * covers the rows of an older store. To rotate the key, add a new key to STATE_KEYS, make it
 * `current`, and run this function. Then an older key can leave the ring. A row that changed
 * during the run is left: the write that changed it sealed it.
 */
export const reseal = internalAction({
  args: {},
  returns: v.object({ resealed: v.number(), skippedChanged: v.number() }),
  handler: async (ctx) => {
    let resealed = 0;
    let skippedChanged = 0;
    const count = (replaced: boolean) => {
      if (replaced) resealed += 1;
      else skippedChanged += 1;
    };
    for (const stack of await ctx.runQuery(state.stacks, {})) {
      const { stages } = await ctx.runQuery(state.readStack, { stack });
      for (const { stage, resources, output } of stages) {
        for (const { fqn, value: expected } of resources) {
          const value = await resealText(expected, resourceAad({ stack, stage, fqn }));
          if (value === expected) continue;
          count(
            await ctx.runMutation(state.replaceResource, { stack, stage, fqn, expected, value }),
          );
        }
        if (output === null) continue;
        const value = await resealText(output, outputAad({ stack, stage }));
        if (value === output) continue;
        count(
          await ctx.runMutation(state.replaceOutput, { stack, stage, expected: output, value }),
        );
      }
    }
    return { resealed, skippedChanged };
  },
});
