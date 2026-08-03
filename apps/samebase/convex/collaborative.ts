import { ChangeSet, Text } from "@codemirror/state";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import { hasOrganizationAccess, requireOrganizationAccessContext } from "./organizationAccess";
import { assertConnectedVault, isLiveConnectedVault } from "./vault/state";
import {
  STALE_BASE_VERSION_ERROR_CODE,
  buildStaleBaseVersionErrorMessage,
} from "../shared/stagingErrors";

// Keep this many recent updates per file for clients to catch up.
// Older updates are pruned since the content is already applied to staging.
const MAX_UPDATES_TO_KEEP = 200;
const CLEANUP_BATCH_SIZE = 500;
const { array, boolean, id, number, object, string } = v;

type CollaborativeAccessCtx = Pick<QueryCtx | MutationCtx, "db">;

type PullUpdateResult = {
  clientID: string;
  changes: string;
  version: number;
  userId: Id<"users">;
};

type PushUpdatesResult = {
  success: boolean;
  newVersion: number;
};

async function getLiveCollaborativeVault(
  ctx: CollaborativeAccessCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
  },
) {
  const vault = await ctx.db.get(args.vaultId);
  if (!isLiveConnectedVault(vault)) {
    return null;
  }
  const ownership = await requireOrganizationAccessContext(ctx.db, args.userId);
  if (!hasOrganizationAccess(ownership, vault)) {
    return null;
  }
  return vault;
}

async function assertVaultAllowsCollaborativeWrites(
  ctx: Pick<MutationCtx, "db">,
  args: { userId: Id<"users">; vaultId: Id<"vaults"> },
): Promise<void> {
  const vault = assertConnectedVault(await ctx.db.get(args.vaultId));
  const ownership = await requireOrganizationAccessContext(ctx.db, args.userId);
  if (!hasOrganizationAccess(ownership, vault)) {
    throw new Error("Unauthorized");
  }
}

// MARK: Public

export const getDocument = query({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
    branch: string(),
    filePath: string(),
  },
  returns: object({
    version: number(),
    content: string(),
    exists: boolean(),
  }),
  handler: async (ctx, args) => {
    console.log("getDocument:", args.filePath);
    const vault = await getLiveCollaborativeVault(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });
    if (!vault) {
      return {
        version: 0,
        content: "",
        exists: false,
      };
    }

    // Check if there's staged content for this file
    const staging = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch).eq("filePath", args.filePath),
      )
      .first();

    if (staging) {
      console.log("getDocument: found staging with version", staging.version);
      return {
        version: staging.version,
        content: staging.content,
        exists: true,
      };
    }

    console.log("getDocument: no staging found");
    // No staging found - return empty document
    return {
      version: 0,
      content: "",
      exists: false,
    };
  },
});

export const pullUpdates = query({
  access: "access_files_read",
  args: {
    repositoryFullName: string(),
    branch: string(),
    filePath: string(),
    version: number(),
  },
  returns: array(
    object({
      clientID: string(),
      changes: string(),
      version: number(),
      userId: id("users"),
    }),
  ),
  handler: async (ctx, args): Promise<PullUpdateResult[]> => {
    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId: ctx.viewer.userId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    const updates = await ctx.db
      .query("vaultStagedFileUpdates")
      .withIndex("by_vaultId_and_branch_and_filePath_and_version", (q) =>
        q
          .eq("vaultId", vault._id)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath)
          .gt("version", args.version),
      )
      .collect();

    return updates.map((update) => ({
      clientID: update.clientId,
      changes: update.changes,
      version: update.version,
      userId: update.editUserId,
    }));
  },
});

export const pushUpdates = mutation({
  access: "access_files_write",
  args: {
    repositoryFullName: string(),
    branch: string(),
    filePath: string(),
    version: number(),
    updates: array(
      object({
        clientId: string(),
        changes: string(),
      }),
    ),
  },
  returns: object({
    success: boolean(),
    newVersion: number(),
  }),
  handler: async (ctx, args): Promise<PushUpdatesResult> => {
    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId: ctx.viewer.userId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    // Get current staging record
    const staging = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q.eq("vaultId", vault._id).eq("branch", args.branch).eq("filePath", args.filePath),
      )
      .first();

    if (!staging) {
      throw new Error("Staging not found");
    }

    let currentVersion = staging.version;

    // Simple version check - reject if versions don't match
    if (args.version !== currentVersion) {
      return {
        success: false,
        newVersion: currentVersion,
      };
    }

    // Apply updates
    const timestamp = Date.now();
    console.log("pushUpdates: applying", args.updates.length, "updates");

    // Store the updates for other clients to pull and apply them to content
    let currentDoc = Text.of(staging.content.split("\n"));

    for (const update of args.updates) {
      currentVersion++;

      // Store the update for other clients to pull
      const inserted = await ctx.db.insert("vaultStagedFileUpdates", {
        vaultId: vault._id,
        branch: args.branch,
        filePath: args.filePath,
        version: currentVersion,
        clientId: update.clientId,
        changes: update.changes,
        editUserId: ctx.viewer.userId,
        timestamp,
      });

      console.log("pushUpdates: inserted update", inserted, "for version", currentVersion);

      // Apply the changes to the document using CodeMirror's proper methods
      const changeSet = ChangeSet.fromJSON(JSON.parse(update.changes));
      currentDoc = changeSet.apply(currentDoc);
    }

    // Convert back to string
    const updatedContent = currentDoc.toString();

    // Update the staging record with new content and version
    await ctx.db.patch(staging._id, {
      content: updatedContent,
      version: currentVersion,
      lastEditTime: timestamp,
      lastEditUserId: ctx.viewer.userId,
    });

    // Periodically prune old collaborative updates to prevent unbounded growth.
    // Only run every 50 versions to avoid scheduling too often.
    if (currentVersion % 50 === 0) {
      await ctx.scheduler.runAfter(0, internal.collaborative.pruneOldUpdates, {
        vaultId: vault._id,
        branch: args.branch,
        filePath: args.filePath,
        currentVersion,
      });
    }

    return {
      success: true,
      newVersion: currentVersion,
    };
  },
});

// MARK: Internal

/**
 * Push a full-content replacement through the collaborative editing stream.
 * Used by the AI agent to make edits that appear in real-time for open editors.
 */
export const pushContentUpdate = internalMutation({
  args: {
    vaultId: id("vaults"),
    filePath: string(),
    branch: string(),
    expectedVersion: number(),
    newContent: string(),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertVaultAllowsCollaborativeWrites(ctx, args);

    const staging = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch).eq("filePath", args.filePath),
      )
      .first();

    if (!staging) {
      // No staging record means no editor is open, nothing to sync.
      return null;
    }

    if (staging.version !== args.expectedVersion) {
      const error = new Error(
        buildStaleBaseVersionErrorMessage({
          expectedVersion: args.expectedVersion,
          actualVersion: staging.version,
        }),
      );
      error.name = STALE_BASE_VERSION_ERROR_CODE;
      throw error;
    }

    const oldContent = staging.content;
    if (oldContent === args.newContent) {
      return null;
    }

    const currentVersion = staging.version;
    const newVersion = currentVersion + 1;
    const timestamp = Date.now();

    // Build a ChangeSet that replaces the entire document
    const oldDoc = Text.of(oldContent.split("\n"));
    const changeSet = ChangeSet.of(
      { from: 0, to: oldDoc.length, insert: args.newContent },
      oldDoc.length,
    );

    // Insert into the collaborative update stream so open editors pick it up
    await ctx.db.insert("vaultStagedFileUpdates", {
      vaultId: args.vaultId,
      branch: args.branch,
      filePath: args.filePath,
      version: newVersion,
      clientId: "agent",
      changes: JSON.stringify(changeSet.toJSON()),
      editUserId: args.userId,
      timestamp,
    });

    // Update staging to match
    await ctx.db.patch(staging._id, {
      content: args.newContent,
      version: newVersion,
      lastEditTime: timestamp,
      lastEditUserId: args.userId,
    });

    if (newVersion % 50 === 0) {
      await ctx.scheduler.runAfter(0, internal.collaborative.pruneOldUpdates, {
        vaultId: args.vaultId,
        branch: args.branch,
        filePath: args.filePath,
        currentVersion: newVersion,
      });
    }

    return null;
  },
});

/**
 * Push a precomputed incremental ChangeSet through the collaborative stream.
 * Used by the AI agent when it can express a localized edit as exact ranges.
 */
export const pushSerializedChangeSetUpdate = internalMutation({
  args: {
    vaultId: id("vaults"),
    filePath: string(),
    branch: string(),
    expectedVersion: number(),
    serializedChangeSet: string(),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertVaultAllowsCollaborativeWrites(ctx, args);

    const staging = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch).eq("filePath", args.filePath),
      )
      .first();

    if (!staging) {
      throw new Error("pushSerializedChangeSetUpdate failed: staging not found");
    }

    if (staging.version !== args.expectedVersion) {
      const error = new Error(
        buildStaleBaseVersionErrorMessage({
          expectedVersion: args.expectedVersion,
          actualVersion: staging.version,
        }),
      );
      error.name = STALE_BASE_VERSION_ERROR_CODE;
      throw error;
    }

    const currentDoc = Text.of(staging.content.split("\n"));
    let updatedContent: string;
    try {
      const changeSet = ChangeSet.fromJSON(JSON.parse(args.serializedChangeSet));
      updatedContent = changeSet.apply(currentDoc).toString();
    } catch (error) {
      console.error("pushSerializedChangeSetUpdate: invalid serializedChangeSet", error);
      throw new Error("Invalid serializedChangeSet");
    }

    if (updatedContent === staging.content) {
      return null;
    }

    const currentVersion = staging.version;
    const newVersion = currentVersion + 1;
    const timestamp = Date.now();

    await ctx.db.insert("vaultStagedFileUpdates", {
      vaultId: args.vaultId,
      branch: args.branch,
      filePath: args.filePath,
      version: newVersion,
      clientId: "agent",
      changes: args.serializedChangeSet,
      editUserId: args.userId,
      timestamp,
    });

    await ctx.db.patch(staging._id, {
      content: updatedContent,
      version: newVersion,
      lastEditTime: timestamp,
      lastEditUserId: args.userId,
    });

    if (newVersion % 50 === 0) {
      await ctx.scheduler.runAfter(0, internal.collaborative.pruneOldUpdates, {
        vaultId: args.vaultId,
        branch: args.branch,
        filePath: args.filePath,
        currentVersion: newVersion,
      });
    }

    return null;
  },
});

/**
 * Prune old collaborative updates that are no longer needed.
 * Keeps the most recent MAX_UPDATES_TO_KEEP per file, deletes the rest in batches.
 */
export const pruneOldUpdates = internalMutation({
  args: {
    vaultId: id("vaults"),
    branch: string(),
    filePath: string(),
    currentVersion: number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cutoffVersion = args.currentVersion - MAX_UPDATES_TO_KEEP;
    if (cutoffVersion <= 0) return null;

    // Grab a batch of old updates to delete (ascending version order).
    const oldUpdates = await ctx.db
      .query("vaultStagedFileUpdates")
      .withIndex("by_vaultId_and_branch_and_filePath_and_version", (q) =>
        q
          .eq("vaultId", args.vaultId)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath)
          .lte("version", cutoffVersion),
      )
      .take(CLEANUP_BATCH_SIZE);

    for (const update of oldUpdates) {
      await ctx.db.delete(update._id);
    }

    // If we hit the batch limit, schedule another round.
    if (oldUpdates.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.collaborative.pruneOldUpdates, {
        vaultId: args.vaultId,
        branch: args.branch,
        filePath: args.filePath,
        currentVersion: args.currentVersion,
      });
    }

    return null;
  },
});

export const getActiveEditors = query({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
    branch: string(),
    filePath: string(),
  },
  returns: array(
    object({
      userId: id("users"),
      lastActive: number(),
    }),
  ),
  handler: async (ctx, args) => {
    const vault = await getLiveCollaborativeVault(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });
    if (!vault) {
      return [];
    }

    // Get recent updates (within last 30 seconds) to determine active editors.
    // Use .order("desc") and .take() to avoid scanning the entire update history.
    const recentUpdates = await ctx.db
      .query("vaultStagedFileUpdates")
      .withIndex("by_vaultId_and_branch_and_filePath_and_timestamp", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch).eq("filePath", args.filePath),
      )
      .order("desc")
      .take(100);

    const recentTimestamp = Date.now() - 30 * 1000;

    // Group by user and get the most recent activity
    const userActivity = new Map<Id<"users">, number>();
    for (const update of recentUpdates) {
      if (update.timestamp < recentTimestamp) break;
      const currentLatest = userActivity.get(update.editUserId) ?? 0;
      if (update.timestamp > currentLatest) {
        userActivity.set(update.editUserId, update.timestamp);
      }
    }

    return Array.from(userActivity.entries()).map(([userId, lastActive]) => ({
      userId,
      lastActive,
    }));
  },
});
