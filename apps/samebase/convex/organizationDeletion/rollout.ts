import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation, type MutationCtx, type QueryCtx } from "../_generated/server";
import { resolveDeploymentProfile } from "../deploymentProfile";
import {
  buildPendingUploadStorageContentType,
  isStorageReservedOrReferenced,
  readPendingUploadMarker,
} from "../pendingUploads";
import { ORGANIZATION_DELETION_STORAGE_ROLLOUT_KEY } from "./model";

export const ORGANIZATION_DELETION_STORAGE_ROLLOUT_SETTLE_MS = 65 * 60_000;
const STORAGE_ROLLOUT_BATCH_SIZE = 50;

type OrganizationDeletionRolloutReadCtx = Pick<QueryCtx, "db">;

async function readStorageRollout(ctx: OrganizationDeletionRolloutReadCtx) {
  return await ctx.db
    .query("workflow_organizationDeletion_storageRollout")
    .withIndex("by_key", (query) => query.eq("key", ORGANIZATION_DELETION_STORAGE_ROLLOUT_KEY))
    .unique();
}

export async function isOrganizationDeletionRolloutReady(
  ctx: OrganizationDeletionRolloutReadCtx,
): Promise<boolean> {
  if (resolveDeploymentProfile().kind !== "production") {
    return true;
  }
  return (await readStorageRollout(ctx))?.state === "ready";
}

async function hasActiveUploadMarker(
  ctx: MutationCtx,
  contentType: string | undefined,
): Promise<boolean> {
  const rawUploadId = readPendingUploadMarker(contentType);
  if (rawUploadId === null) {
    return false;
  }
  const uploadId = ctx.db.normalizeId("vaultPendingUploads", rawUploadId);
  if (uploadId === null) {
    return false;
  }
  const upload = await ctx.db.get(uploadId);
  return (
    upload !== null &&
    contentType ===
      buildPendingUploadStorageContentType({
        originalContentType: upload.originalContentType,
        uploadId: upload._id,
      })
  );
}

const vAdvanceStorageRolloutResult = v.union(
  v.object({ state: v.literal("not_required") }),
  v.object({ state: v.literal("waiting"), readyAt: v.number() }),
  v.object({ state: v.literal("more") }),
  v.object({ state: v.literal("ready") }),
);

export const advanceStorageCleanup = internalMutation({
  args: {},
  returns: vAdvanceStorageRolloutResult,
  handler: async (ctx) => {
    if (resolveDeploymentProfile().kind !== "production") {
      return { state: "not_required" } as const;
    }

    const now = Date.now();
    let rollout = await readStorageRollout(ctx);
    if (rollout === null) {
      const startedAt = now;
      const cutoffAt = startedAt + ORGANIZATION_DELETION_STORAGE_ROLLOUT_SETTLE_MS;
      const rolloutId = await ctx.db.insert("workflow_organizationDeletion_storageRollout", {
        key: ORGANIZATION_DELETION_STORAGE_ROLLOUT_KEY,
        state: "running",
        startedAt,
        cutoffAt,
        updatedAt: now,
      });
      rollout = await ctx.db.get(rolloutId);
      if (rollout === null) {
        throw new Error("Organization deletion storage rollout was not created.");
      }
    }
    if (rollout.state === "ready") {
      return { state: "ready" } as const;
    }
    if (now < rollout.cutoffAt) {
      return { state: "waiting", readyAt: rollout.cutoffAt } as const;
    }

    const page = await ctx.db.system
      .query("_storage")
      .withIndex("by_creation_time", (query) => query.lte("_creationTime", rollout.cutoffAt))
      .paginate({
        cursor: rollout.storageScanCursor ?? null,
        numItems: STORAGE_ROLLOUT_BATCH_SIZE,
      });

    for (const storage of page.page) {
      if (
        (await isStorageReservedOrReferenced(ctx, storage._id)) ||
        (await hasActiveUploadMarker(ctx, storage.contentType))
      ) {
        continue;
      }
      await ctx.storage.delete(storage._id);
    }

    if (!page.isDone) {
      await ctx.db.patch(rollout._id, {
        storageScanCursor: page.continueCursor,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.organizationDeletion.rollout.advanceStorageCleanup,
        {},
      );
      return { state: "more" } as const;
    }

    await ctx.db.replace(rollout._id, {
      key: ORGANIZATION_DELETION_STORAGE_ROLLOUT_KEY,
      state: "ready",
      startedAt: rollout.startedAt,
      cutoffAt: rollout.cutoffAt,
      completedAt: now,
    });
    return { state: "ready" } as const;
  },
});
