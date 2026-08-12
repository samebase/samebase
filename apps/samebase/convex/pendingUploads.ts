import { v, type Infer } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { findVaultForUser } from "./organizationAccess";

export const PENDING_UPLOAD_RESERVATION_MS = 10 * 60_000;
export const ACTION_BLOB_RESERVATION_MS = 35 * 60_000;
export const VAULT_ACTION_LEASE_MS = 35 * 60_000;
const HTTP_UPLOAD_ATTEMPT_FENCE_MS = 35 * 60_000;
const STORAGE_SCAN_BATCH_SIZE = 100;
const PENDING_UPLOAD_MARKER_PREFIX = "; samebase-upload=";

const MEDIA_TYPE_PATTERN = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;

export const vVaultActionOperation = v.union(
  v.literal("cache_repository_files"),
  v.literal("commit_staged_files"),
  v.literal("create_draft_pull_request"),
  v.literal("pull_from_github"),
  v.literal("rename_staged_file"),
  v.literal("restore_compare_file"),
  v.literal("stage_repository_file"),
);
export type VaultActionOperation = Infer<typeof vVaultActionOperation>;

export function normalizePendingUploadContentType(value: string): string {
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return MEDIA_TYPE_PATTERN.test(mediaType) ? mediaType : "application/octet-stream";
}

export function buildPendingUploadStorageContentType(args: {
  originalContentType: string;
  uploadId: string;
}): string {
  return `${args.originalContentType}${PENDING_UPLOAD_MARKER_PREFIX}${encodeURIComponent(args.uploadId)}`;
}

export function readPendingUploadMarker(contentType: string | undefined): string | null {
  if (contentType === undefined) {
    return null;
  }
  const markerIndex = contentType.indexOf(PENDING_UPLOAD_MARKER_PREFIX);
  if (markerIndex === -1) {
    return null;
  }
  const encodedUploadId = contentType.slice(markerIndex + PENDING_UPLOAD_MARKER_PREFIX.length);
  if (encodedUploadId.length === 0 || encodedUploadId.includes(";")) {
    return null;
  }
  try {
    return decodeURIComponent(encodedUploadId);
  } catch {
    return null;
  }
}

export async function isStorageReferenced(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
): Promise<boolean> {
  const [stagedFile, observedBlob] = await Promise.all([
    ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_storageId", (query) => query.eq("storageId", storageId))
      .first(),
    ctx.db
      .query("observations_vaultFiles_blobs")
      .withIndex("by_storageId", (query) => query.eq("storageId", storageId))
      .first(),
  ]);
  return stagedFile !== null || observedBlob !== null;
}

export async function isStorageReservedOrReferenced(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
): Promise<boolean> {
  const [pendingUpload, referenced] = await Promise.all([
    ctx.db
      .query("vaultPendingUploads")
      .withIndex("by_storageId", (query) => query.eq("storageId", storageId))
      .first(),
    isStorageReferenced(ctx, storageId),
  ]);
  return pendingUpload !== null || referenced;
}

export async function cleanupExpiredPendingUploadPage(
  ctx: MutationCtx,
  upload: Doc<"vaultPendingUploads">,
): Promise<"done" | "more"> {
  if (Date.now() < upload.expiresAt) {
    throw new Error("Pending upload capability has not expired.");
  }

  if (upload.storageId !== undefined) {
    const storage = await ctx.db.system.get("_storage", upload.storageId);
    if (storage !== null && !(await isStorageReferenced(ctx, upload.storageId))) {
      await ctx.storage.delete(upload.storageId);
    }
  }

  const marker = buildPendingUploadStorageContentType({
    originalContentType: upload.originalContentType,
    uploadId: upload._id,
  });
  const page = await ctx.db.system
    .query("_storage")
    .withIndex("by_creation_time", (query) =>
      query.gte("_creationTime", upload._creationTime).lte("_creationTime", upload.expiresAt),
    )
    .paginate({ cursor: upload.storageScanCursor ?? null, numItems: STORAGE_SCAN_BATCH_SIZE });

  for (const storage of page.page) {
    if (storage.contentType !== marker || (await isStorageReferenced(ctx, storage._id))) {
      continue;
    }
    await ctx.storage.delete(storage._id);
  }

  if (!page.isDone) {
    await ctx.db.patch(upload._id, { storageScanCursor: page.continueCursor });
    return "more";
  }

  await ctx.db.delete(upload._id);
  return "done";
}

export async function discardPendingUploadBlob(
  ctx: MutationCtx,
  args: {
    uploadId: Id<"vaultPendingUploads">;
    storageId: Id<"_storage">;
    userId: Id<"users">;
    vaultId?: Id<"vaults">;
  },
): Promise<boolean> {
  const upload = await ctx.db.get(args.uploadId);
  if (
    upload === null ||
    upload.purpose !== "browser_media" ||
    upload.userId !== args.userId ||
    (args.vaultId !== undefined && upload.vaultId !== args.vaultId)
  ) {
    return false;
  }
  const metadata = await ctx.db.system.get("_storage", args.storageId);
  if (metadata === null) {
    if (upload.storageId === args.storageId) {
      await ctx.db.patch(upload._id, { storageId: undefined });
    }
    return true;
  }
  const marker = buildPendingUploadStorageContentType({
    originalContentType: upload.originalContentType,
    uploadId: upload._id,
  });
  if (metadata.contentType !== marker && upload.storageId !== args.storageId) {
    throw new Error("Pending upload storage marker does not match its reservation.");
  }
  if (await isStorageReferenced(ctx, args.storageId)) {
    return false;
  }

  await ctx.storage.delete(args.storageId);
  if (upload.storageId === args.storageId) {
    await ctx.db.patch(upload._id, { storageId: undefined });
  }
  return true;
}

export async function requireClaimedPendingUpload(
  ctx: MutationCtx,
  args: {
    uploadId: Id<"vaultPendingUploads">;
    storageId: Id<"_storage">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<Doc<"vaultPendingUploads">> {
  const upload = await ctx.db.get(args.uploadId);
  if (
    upload === null ||
    upload.purpose !== "browser_media" ||
    upload.userId !== args.userId ||
    upload.vaultId !== args.vaultId ||
    upload.storageId !== args.storageId
  ) {
    throw new Error("Pending upload reservation is not active.");
  }
  return upload;
}

export const acquireVaultActionLease = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    userId: v.id("users"),
    operation: vVaultActionOperation,
  },
  returns: v.id("vaultActionLeases"),
  handler: async (ctx, args) => {
    const vault = await findVaultForUser(ctx.db, args);
    if (vault === null) {
      throw new Error("Vault action is not available.");
    }

    const expiresAt = Date.now() + VAULT_ACTION_LEASE_MS;
    const leaseId = await ctx.db.insert("vaultActionLeases", {
      organizationId: vault.organizationId,
      vaultId: vault._id,
      userId: args.userId,
      operation: args.operation,
      expiresAt,
    });
    await ctx.scheduler.runAt(expiresAt, internal.pendingUploads.cleanupExpiredVaultActionLease, {
      leaseId,
    });
    return leaseId;
  },
});

export const releaseVaultActionLease = internalMutation({
  args: { leaseId: v.id("vaultActionLeases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lease = await ctx.db.get(args.leaseId);
    if (lease !== null) {
      await ctx.db.delete(lease._id);
    }
    return null;
  },
});

export const cleanupExpiredVaultActionLease = internalMutation({
  args: { leaseId: v.id("vaultActionLeases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lease = await ctx.db.get(args.leaseId);
    if (lease === null) {
      return null;
    }
    if (lease.expiresAt > Date.now()) {
      await ctx.scheduler.runAt(
        lease.expiresAt,
        internal.pendingUploads.cleanupExpiredVaultActionLease,
        { leaseId: args.leaseId },
      );
      return null;
    }
    await ctx.db.delete(lease._id);
    return null;
  },
});

const beginHttpUploadResult = v.union(
  v.object({ state: v.literal("unavailable") }),
  v.object({
    state: v.literal("ready"),
    uploadId: v.id("vaultPendingUploads"),
    storageContentType: v.string(),
  }),
);

export const beginHttpUpload = internalMutation({
  args: {
    uploadId: v.string(),
    uploadAttemptId: v.string(),
  },
  returns: beginHttpUploadResult,
  handler: async (ctx, args) => {
    const uploadId = ctx.db.normalizeId("vaultPendingUploads", args.uploadId);
    if (uploadId === null) {
      return { state: "unavailable" } as const;
    }
    const upload = await ctx.db.get(uploadId);
    const now = Date.now();
    if (
      upload === null ||
      upload.purpose !== "browser_media" ||
      upload.storageId !== undefined ||
      now >= upload.expiresAt ||
      (upload.uploadAttemptExpiresAt !== undefined && upload.uploadAttemptExpiresAt > now)
    ) {
      return { state: "unavailable" } as const;
    }
    const [organization, user, vault] = await Promise.all([
      ctx.db.get(upload.organizationId),
      ctx.db.get(upload.userId),
      ctx.db.get(upload.vaultId),
    ]);
    if (
      organization === null ||
      organization.deletion !== undefined ||
      user === null ||
      user.state !== "active" ||
      vault === null ||
      vault.organizationId !== upload.organizationId
    ) {
      return { state: "unavailable" } as const;
    }

    const expiresAt = Math.max(upload.expiresAt, now + HTTP_UPLOAD_ATTEMPT_FENCE_MS);
    await ctx.db.patch(upload._id, {
      expiresAt,
      uploadAttemptId: args.uploadAttemptId,
      uploadAttemptExpiresAt: now + HTTP_UPLOAD_ATTEMPT_FENCE_MS,
    });
    await ctx.scheduler.runAt(expiresAt, internal.pendingUploads.cleanupExpired, { uploadId });
    return {
      state: "ready",
      uploadId,
      storageContentType: buildPendingUploadStorageContentType({
        originalContentType: upload.originalContentType,
        uploadId,
      }),
    } as const;
  },
});

export const recordHttpUploadedBlob = internalMutation({
  args: {
    uploadId: v.id("vaultPendingUploads"),
    uploadAttemptId: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (
      upload === null ||
      upload.purpose !== "browser_media" ||
      upload.uploadAttemptId !== args.uploadAttemptId
    ) {
      await ctx.storage.delete(args.storageId);
      return false;
    }
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    const marker = buildPendingUploadStorageContentType({
      originalContentType: upload.originalContentType,
      uploadId: upload._id,
    });
    if (metadata === null || metadata.contentType !== marker) {
      await ctx.storage.delete(args.storageId);
      return false;
    }
    const now = Date.now();
    const [organization, user, vault] = await Promise.all([
      ctx.db.get(upload.organizationId),
      ctx.db.get(upload.userId),
      ctx.db.get(upload.vaultId),
    ]);
    if (
      now >= upload.expiresAt ||
      organization === null ||
      organization.deletion !== undefined ||
      user === null ||
      user.state !== "active" ||
      vault === null ||
      vault.organizationId !== upload.organizationId
    ) {
      await ctx.storage.delete(args.storageId);
      await ctx.db.delete(upload._id);
      return false;
    }
    await ctx.db.patch(upload._id, {
      storageId: args.storageId,
      uploadAttemptId: undefined,
      uploadAttemptExpiresAt: undefined,
    });
    return true;
  },
});

const actionBlobReservationResult = v.object({
  uploadId: v.id("vaultPendingUploads"),
  storageContentType: v.string(),
});

export const reserveActionBlob = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    userId: v.id("users"),
    contentType: v.string(),
  },
  returns: actionBlobReservationResult,
  handler: async (ctx, args) => {
    const [user, vault] = await Promise.all([ctx.db.get(args.userId), ctx.db.get(args.vaultId)]);
    const organization = vault === null ? null : await ctx.db.get(vault.organizationId);
    if (
      user === null ||
      user.state !== "active" ||
      vault === null ||
      organization === null ||
      organization.deletion !== undefined
    ) {
      throw new Error("Organization is not available.");
    }
    const expiresAt = Date.now() + ACTION_BLOB_RESERVATION_MS;
    const originalContentType = normalizePendingUploadContentType(args.contentType);
    const uploadId = await ctx.db.insert("vaultPendingUploads", {
      organizationId: vault.organizationId,
      vaultId: vault._id,
      userId: args.userId,
      purpose: "action_blob_cache",
      originalContentType,
      expiresAt,
    });
    await ctx.scheduler.runAt(expiresAt, internal.pendingUploads.cleanupExpired, { uploadId });
    return {
      uploadId,
      storageContentType: buildPendingUploadStorageContentType({
        originalContentType,
        uploadId,
      }),
    };
  },
});

export const releaseActionBlob = internalMutation({
  args: {
    uploadId: v.id("vaultPendingUploads"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (upload === null) {
      return null;
    }
    if (upload.purpose !== "action_blob_cache") {
      throw new Error("Storage reservation has the wrong purpose.");
    }
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (metadata !== null && !(await isStorageReferenced(ctx, args.storageId))) {
      throw new Error("Action storage cannot be released before it is referenced.");
    }
    await ctx.db.delete(upload._id);
    return null;
  },
});

const claimResult = v.union(
  v.object({ state: v.literal("ready"), vaultId: v.id("vaults"), contentType: v.string() }),
  v.object({ state: v.literal("unavailable") }),
);

export const claimUploadedBlob = internalMutation({
  args: {
    uploadId: v.id("vaultPendingUploads"),
    storageId: v.id("_storage"),
    userId: v.id("users"),
  },
  returns: claimResult,
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (upload === null || upload.purpose !== "browser_media" || upload.userId !== args.userId) {
      return { state: "unavailable" } as const;
    }
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    const marker = buildPendingUploadStorageContentType({
      originalContentType: upload.originalContentType,
      uploadId: upload._id,
    });
    if (metadata === null || metadata.contentType !== marker) {
      throw new Error("Pending upload storage marker does not match its reservation.");
    }
    if (upload.storageId !== args.storageId) {
      await ctx.storage.delete(args.storageId);
      return { state: "unavailable" } as const;
    }

    const now = Date.now();
    const [organization, user, vault] = await Promise.all([
      ctx.db.get(upload.organizationId),
      ctx.db.get(upload.userId),
      ctx.db.get(upload.vaultId),
    ]);
    if (
      now >= upload.expiresAt ||
      organization === null ||
      organization.deletion !== undefined ||
      user === null ||
      user.state !== "active" ||
      vault === null ||
      vault.organizationId !== upload.organizationId
    ) {
      await ctx.storage.delete(args.storageId);
      if (upload.storageId === args.storageId) {
        await ctx.db.patch(upload._id, { storageId: undefined });
      }
      return { state: "unavailable" } as const;
    }

    const expiresAt = Math.max(upload.expiresAt, now + HTTP_UPLOAD_ATTEMPT_FENCE_MS);
    if (expiresAt !== upload.expiresAt) {
      await ctx.db.patch(upload._id, { expiresAt });
      await ctx.scheduler.runAt(expiresAt, internal.pendingUploads.cleanupExpired, {
        uploadId: upload._id,
      });
    }

    return {
      state: "ready",
      vaultId: upload.vaultId,
      contentType: upload.originalContentType,
    } as const;
  },
});

export const discardUploadedBlob = internalMutation({
  args: {
    uploadId: v.id("vaultPendingUploads"),
    storageId: v.id("_storage"),
    userId: v.id("users"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => await discardPendingUploadBlob(ctx, args),
});

export const cleanupExpired = internalMutation({
  args: {
    uploadId: v.id("vaultPendingUploads"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (upload === null) {
      return null;
    }
    if (Date.now() < upload.expiresAt) {
      await ctx.scheduler.runAt(upload.expiresAt, internal.pendingUploads.cleanupExpired, {
        uploadId: args.uploadId,
      });
      return null;
    }
    if ((await cleanupExpiredPendingUploadPage(ctx, upload)) === "more") {
      await ctx.scheduler.runAfter(0, internal.pendingUploads.cleanupExpired, {
        uploadId: args.uploadId,
      });
    }
    return null;
  },
});
