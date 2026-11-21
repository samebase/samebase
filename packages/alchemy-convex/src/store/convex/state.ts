// The state functions of the alchemy-state-store project of a team: one project for each
// Convex team, pushed by Convex.state() from this directory. These raw state
// functions are internal. reader.ts exposes authenticated, redacted reads.
//
// The rows are in the alchemyState component (src/store/component). Each
// function here forwards to the component function of the same name, with the
// same results; an absent `stage` goes to the component as null. The functions
// hold Alchemy's state interface and nothing else, the same as the Cloudflare
// state store of Alchemy.
// These names and arguments are the wire contract of STORE_VERSION. Samebase
// reads `stacks`, `getOutput`, and `readStack` by name: a renamed function is
// a version bump of the store and of Samebase.
//
// The client seals each secret before `set` and `setOutput`, with data keys from `newDataKey` and
// `openDataKey` (see sealing.ts), and the writes refuse a secret in clear text. `get`, `replaced`,
// and `getOutput` give the text that the client wrote, and open a row of store version 7.
// `readStack` gives the rows without their secrets.
import { v } from "convex/values";
import { newKey } from "../sealedSecret.ts";
import { stackReply } from "../component/state.ts";
import { components } from "./_generated/api.js";
import { internalAction, internalMutation, internalQuery } from "./_generated/server.js";
import {
  openText,
  outputAad,
  refuseClearSecrets,
  requireKey,
  resourceAad,
  unwrapDataKey,
  wrapDataKey,
} from "./sealing.ts";
import { STORE_VERSION } from "./version.ts";

const state = components.alchemyState.state;
const keys = components.alchemyState.keys;

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

export const set = internalMutation({
  args: { stack: v.string(), stage: v.string(), fqn: v.string(), value: v.string() },
  returns: v.null(),
  handler: (ctx, args) => {
    refuseClearSecrets(args.value);
    return ctx.runMutation(state.set, {
      stack: args.stack,
      stage: args.stage,
      fqn: args.fqn,
      value: args.value,
    });
  },
});

export const remove = internalMutation({
  args: { stack: v.string(), stage: v.string(), fqn: v.string() },
  returns: v.null(),
  handler: (ctx, args) =>
    ctx.runMutation(state.remove, { stack: args.stack, stage: args.stage, fqn: args.fqn }),
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

export const setOutput = internalMutation({
  args: { stack: v.string(), stage: v.string(), value: v.string() },
  returns: v.null(),
  handler: (ctx, args) => {
    refuseClearSecrets(args.value);
    return ctx.runMutation(state.setOutput, {
      stack: args.stack,
      stage: args.stage,
      value: args.value,
    });
  },
});

/** Every stage of a stack with its resources and output, without secrets, in one call. */
export const readStack = internalQuery({
  args: { stack: v.string() },
  returns: stackReply,
  handler: (ctx, args) => ctx.runQuery(state.readStack, { stack: args.stack }),
});

/**
 * A new data key of one stage, and its copy wrapped under the current key. An action: in a query or
 * a mutation `crypto.getRandomValues` is seeded.
 */
export const newDataKey = internalAction({
  args: { stack: v.string(), stage: v.string() },
  returns: v.object({ plaintext: v.string(), wrapped: v.string() }),
  handler: async (ctx, args) => {
    const { current } = await ctx.runQuery(keys.sealing, {});
    if (current === null) throw new Error("The store has no key yet.");
    const plaintext = newKey();
    return { plaintext, wrapped: await wrapDataKey(plaintext, args, current) };
  },
});

/** The data key of a wrapped copy that `newDataKey` made for this stack and stage. */
export const openDataKey = internalQuery({
  args: { stack: v.string(), stage: v.string(), wrapped: v.string() },
  returns: v.string(),
  handler: (_ctx, args) => unwrapDataKey(args.wrapped, { stack: args.stack, stage: args.stage }),
});

/** The current key, which wraps new data keys. A run reads this each time. */
export const sealing = internalQuery({
  args: {},
  returns: v.object({ current: v.union(v.string(), v.null()) }),
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
    return ctx.runMutation(keys.choose, { keyId: args.keyId });
  },
});

/**
 * Makes `keyId`, a key that the deployment holds, the current key for new data keys. A data key
 * that an older key wrapped still opens while its variable stays.
 */
export const rotateKey = internalMutation({
  args: { keyId: v.string() },
  returns: v.null(),
  handler: (ctx, args) => {
    requireKey(args.keyId);
    return ctx.runMutation(keys.rotate, { keyId: args.keyId });
  },
});
