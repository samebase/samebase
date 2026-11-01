import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";

const { number, object, optional } = v;

/** How many documents one batch deletes per table, so a batch stays well inside one transaction. */
export const BATCH = 200;

const vCleanupArgs = object({
  now: number(),
  /** Absent: preview clients are never deleted. */
  previewClientMaxAgeMs: optional(number()),
  signInRetentionMs: number(),
});

const vCleanupCounts = object({
  authRequests: number(),
  authorizationCodes: number(),
  previewClients: number(),
  expiredClients: number(),
  signIns: number(),
});

/**
 * At most one batch of the preview clients idle since before `cutoff`: a client that never signed
 * in counts from its creation, and any other from its last sign-in. Both reads stop at the batch, so
 * the cost of a batch does not grow with the number of preview clients.
 */
async function idlePreviewClients(ctx: MutationCtx, cutoff: number) {
  const neverUsed = await ctx.db
    .query("clients")
    .withIndex("by_deployment_type_and_activity", (q) =>
      q.eq("deploymentType", "preview").eq("lastSignInAt", undefined).lt("createdAt", cutoff),
    )
    .take(BATCH);
  if (neverUsed.length === BATCH) {
    return neverUsed;
  }
  const used = await ctx.db
    .query("clients")
    .withIndex("by_deployment_type_and_activity", (q) =>
      q.eq("deploymentType", "preview").gt("lastSignInAt", undefined).lt("lastSignInAt", cutoff),
    )
    .take(BATCH - neverUsed.length);
  return [...neverUsed, ...used];
}

/** At most one batch of the clients past their removal date. A row without one is not in the range. */
async function expiredClients(ctx: MutationCtx, now: number) {
  return await ctx.db
    .query("clients")
    .withIndex("by_remove_at", (q) => q.gt("removeAt", undefined).lt("removeAt", now))
    .take(BATCH);
}

/**
 * Deletes one batch of what has run out. A table that filled its batch may hold more, so the batch
 * schedules the next one with the same `now`, until no table fills a batch. The cutoff never moves,
 * so the run ends: a row written after the run began, a registration token minted with a positive
 * lifetime included, runs out after `now`, and the rows that had run out by then are a fixed set.
 */
async function cleanupBatch(
  ctx: MutationCtx,
  args: Infer<typeof vCleanupArgs>,
): Promise<Infer<typeof vCleanupCounts>> {
  const requests = await ctx.db
    .query("authRequests")
    .withIndex("by_expires_at", (q) => q.lt("expiresAt", args.now))
    .take(BATCH);
  for (const request of requests) {
    await ctx.db.delete("authRequests", request._id);
  }

  const codes = await ctx.db
    .query("authorizationCodes")
    .withIndex("by_expires_at", (q) => q.lt("expiresAt", args.now))
    .take(BATCH);
  for (const code of codes) {
    await ctx.db.delete("authorizationCodes", code._id);
  }

  const { previewClientMaxAgeMs } = args;
  const previewClients =
    previewClientMaxAgeMs === undefined
      ? []
      : await idlePreviewClients(ctx, args.now - previewClientMaxAgeMs);
  const expired = await expiredClients(ctx, args.now);
  // A row can be in both lists.
  const clients = new Map([...previewClients, ...expired].map((client) => [client._id, client]));
  for (const client of clients.values()) {
    await ctx.db.delete("clients", client._id);
  }

  const signIns = await ctx.db
    .query("signIns")
    .withIndex("by_at", (q) => q.lt("at", args.now - args.signInRetentionMs))
    .take(BATCH);
  for (const signIn of signIns) {
    await ctx.db.delete("signIns", signIn._id);
  }

  const counts = {
    authRequests: requests.length,
    authorizationCodes: codes.length,
    previewClients: previewClients.length,
    expiredClients: expired.length,
    signIns: signIns.length,
  };
  if (Object.values(counts).some((count) => count === BATCH)) {
    await ctx.scheduler.runAfter(0, internal.lifecycle.continueCleanup, {
      now: args.now,
      ...(previewClientMaxAgeMs === undefined ? {} : { previewClientMaxAgeMs }),
      signInRetentionMs: args.signInRetentionMs,
    });
  }
  return counts;
}

/**
 * Deletes what has run out: expired requests and codes, preview clients nobody used for
 * `previewClientMaxAgeMs` when the host passes it, clients past their removal date, and audit rows
 * older than `signInRetentionMs`. The host schedules this daily from a cron; a production or
 * development client has no removal date and is never touched.
 * The counts are this call's batch: a full batch schedules the next one, so one call drains
 * everything older than `now`.
 */
export const cleanup = mutation({
  args: vCleanupArgs,
  returns: vCleanupCounts,
  handler: async (ctx, args) => await cleanupBatch(ctx, args),
});

/** The next batch of a `cleanup` call that filled a batch. */
export const continueCleanup = internalMutation({
  args: vCleanupArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await cleanupBatch(ctx, args);
    return null;
  },
});
