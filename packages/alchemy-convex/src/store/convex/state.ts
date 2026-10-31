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
import type { FunctionReturnType } from "convex/server";
import { v } from "convex/values";
import { runRecord } from "../component/runRecord.ts";
import { stackReply } from "../component/state.ts";
import { components, internal } from "./_generated/api.js";
import {
  type ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server.js";
import {
  hasSecret,
  openText,
  outputAad,
  requireKey,
  resealText,
  resourceAad,
  sealText,
} from "./sealing.ts";
import { STORE_VERSION } from "./version.ts";

const state = components.alchemyState.state;
const keys = components.alchemyState.keys;

const NO_KEY = "The store has no key yet.";

const currentKey = async (ctx: ActionCtx) => {
  const { current } = await ctx.runQuery(keys.sealing, {});
  if (current === null) throw new Error(NO_KEY);
  return current;
};

/**
 * Seals a text and writes it. A write that sealed under a key that stopped being the current key
 * does not commit, so it cannot land after the reseal of a rotation: it seals again.
 */
const sealedWrite = async (
  ctx: ActionCtx,
  text: string,
  aad: string,
  write: (value: string, keyId: string | null) => Promise<boolean>,
): Promise<null> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const keyId = hasSecret(text) ? await currentKey(ctx) : null;
    const value = keyId === null ? text : await sealText(text, aad, keyId);
    if (await write(value, keyId)) return null;
  }
  throw new Error("The current key of the store changed during three writes in a row.");
};

/** True when a value sealed under `keyId` must not commit. A text with no secret has no key. */
const isStale = async (ctx: MutationCtx, keyId: string | null) =>
  keyId !== null && (await ctx.runQuery(keys.sealing, {})).current !== keyId;

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
  handler: (ctx, args): Promise<null> =>
    sealedWrite(ctx, args.value, resourceAad(args), (value, keyId) =>
      ctx.runMutation(internal.state.writeResource, { ...args, value, keyId }),
    ),
});

/** The write of `set`. It answers false when `keyId` is no longer the current key. */
export const writeResource = internalMutation({
  args: { ...setArgs, keyId: v.union(v.string(), v.null()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (await isStale(ctx, args.keyId)) return false;
    await ctx.runMutation(state.set, {
      stack: args.stack,
      stage: args.stage,
      fqn: args.fqn,
      value: args.value,
      run: args.run ?? null,
    });
    return true;
  },
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
  handler: (ctx, args): Promise<null> =>
    sealedWrite(ctx, args.value, outputAad(args), (value, keyId) =>
      ctx.runMutation(internal.state.writeOutput, { ...args, value, keyId }),
    ),
});

/** The write of `setOutput`. It answers false when `keyId` is no longer the current key. */
export const writeOutput = internalMutation({
  args: { ...setOutputArgs, keyId: v.union(v.string(), v.null()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (await isStale(ctx, args.keyId)) return false;
    await ctx.runMutation(state.setOutput, {
      stack: args.stack,
      stage: args.stage,
      value: args.value,
      run: args.run ?? null,
    });
    return true;
  },
});

/** Every stage of a stack with its resources, output, and current record, in one call. Since store version 2. */
export const readStack = internalQuery({
  args: { stack: v.string() },
  returns: stackReply,
  handler: (ctx, args) => ctx.runQuery(state.readStack, { stack: args.stack }),
});

/** The current key, and true when every secret is sealed under it. A run reads this each time. */
export const sealing = internalQuery({
  args: {},
  returns: v.object({
    current: v.union(v.string(), v.null()),
    generation: v.number(),
    sealed: v.boolean(),
  }),
  handler: (ctx) => ctx.runQuery(keys.sealing, {}),
});

/**
 * Makes `keyId` the current key of a store with no key, and answers the current key. Two first runs
 * can both call it: the first one wins, and the variable of the other stays unused.
 */
export const chooseKey = internalMutation({
  args: { keyId: v.string() },
  returns: v.string(),
  handler: (ctx, args) => {
    requireKey(args.keyId);
    return ctx.runMutation(keys.choose, args);
  },
});

/** Makes `keyId`, a key that the deployment holds, the current key. See `reseal`. */
export const rotateKey = internalMutation({
  args: { keyId: v.string() },
  returns: v.null(),
  handler: (ctx, args) => {
    requireKey(args.keyId);
    return ctx.runMutation(keys.rotate, args);
  },
});

/**
 * Seals every secret of the store under the current key, one row at a time, through bounded pages.
 * A run calls it until one finishes, so a run that stops only leaves work for the next one, and the
 * rows that it sealed stay sealed. A row that fails, because a key is gone or a write limit was hit,
 * is named in `failed`, and the others go on. A row that changed during the sweep is left: the write
 * that changed it sealed it. A sweep
 * stops when the current key changes: the sweep of the new key does the work, and this one must not
 * put the older key back.
 */
export const reseal = internalAction({
  args: {},
  returns: v.object({
    resealed: v.number(),
    skippedChanged: v.number(),
    failed: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const { current: keyId, generation } = await ctx.runQuery(keys.sealing, {});
    if (keyId === null) throw new Error(NO_KEY);
    let resealed = 0;
    let skippedChanged = 0;
    const failed: string[] = [];
    /** Reseals one row, and answers true when the sweep must stop. */
    const sweep = async (
      name: string,
      aad: string,
      expected: string,
      replace: (value: string) => Promise<"replaced" | "changed" | "stale">,
    ) => {
      try {
        const value = await resealText(expected, aad, keyId);
        if (value === expected) return false;
        const result = await replace(value);
        if (result === "replaced") resealed += 1;
        if (result === "changed") skippedChanged += 1;
        return result === "stale";
      } catch {
        // The row name is enough: an error can name a key id, and it adds nothing to find the row.
        failed.push(name);
        return false;
      }
    };
    const done = () => ({ resealed, skippedChanged, failed });

    let cursor: string | null = null;
    for (;;) {
      const { page, continueCursor, isDone }: FunctionReturnType<typeof state.resourcePage> =
        await ctx.runQuery(state.resourcePage, { cursor });
      for (const { stack, stage, fqn, value: expected } of page) {
        const stale = await sweep(
          `${stack}/${stage}/${fqn}`,
          resourceAad({ stack, stage, fqn }),
          expected,
          (value) =>
            ctx.runMutation(state.replaceResource, {
              stack,
              stage,
              fqn,
              expected,
              value,
              generation,
            }),
        );
        if (stale) return done();
      }
      if (isDone) break;
      cursor = continueCursor;
    }

    cursor = null;
    for (;;) {
      const { page, continueCursor, isDone }: FunctionReturnType<typeof state.outputPage> =
        await ctx.runQuery(state.outputPage, { cursor });
      for (const { stack, stage, value: expected } of page) {
        const stale = await sweep(
          `${stack}/${stage} output`,
          outputAad({ stack, stage }),
          expected,
          (value) =>
            ctx.runMutation(state.replaceOutput, { stack, stage, expected, value, generation }),
        );
        if (stale) return done();
      }
      if (isDone) break;
      cursor = continueCursor;
    }

    if (failed.length === 0) await ctx.runMutation(keys.markSealed, { generation });
    return done();
  },
});
