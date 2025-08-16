import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./common";

import { ChangeSet, Text } from "@codemirror/state";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

/**
 * Get a document for collaborative editing - similar to the authority's getDocument
 * Returns the current document content and version
 */
export const getDocument = query({
  args: {
    vaultId: v.id("vaults"),
    filePath: v.string(),
  },
  returns: v.object({
    version: v.number(),
    content: v.string(),
    exists: v.boolean(),
  }),
  handler: async (ctx, args) => {
    console.log("getDocument:", args.filePath);

    // Check if there's staged content for this file
    const staging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("filePath", args.filePath),
      )
      .first();

    if (staging) {
      console.log(
        "getDocument: found staging with version",
        staging.version ?? 0,
      );
      return {
        version: staging.version ?? 0,
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

/**
 * Pull updates since a given version - similar to the authority's pullUpdates
 * Returns all updates that happened after the given version
 */
export const pullUpdates = query({
  args: {
    repositoryFullName: v.string(),
    filePath: v.string(),
    version: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    {
      clientID: string;
      changes: string;
      version: number;
      userId: Id<"users">;
    }[]
  > => {
    const userId = await getUserId(ctx);

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    const updates = await ctx.db
      .query("collaborativeUpdates")
      .withIndex("by_file_and_version", (q) =>
        q
          .eq("vaultId", vault._id)
          .eq("filePath", args.filePath)
          .gt("version", args.version),
      )
      .collect();

    return updates.map((update) => ({
      clientID: update.clientId,
      changes: update.changes,
      version: update.version,
      userId: update.userId,
    }));
  },
});

/**
 * Push updates to the server - similar to the authority's pushUpdates
 * Handles operational transformation and conflict resolution
 */
export const pushUpdates = mutation({
  args: {
    repositoryFullName: v.string(),
    filePath: v.string(),
    version: v.number(), // Client's current version
    updates: v.array(
      v.object({
        clientId: v.string(),
        changes: v.string(), // Serialized ChangeSet
      }),
    ),
  },
  returns: v.object({
    success: v.boolean(),
    newVersion: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; newVersion: number }> => {
    const userId = await getUserId(ctx);

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    // Get current staging record
    const staging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_path", (q) =>
        q.eq("vaultId", vault._id).eq("filePath", args.filePath),
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
      const inserted = await ctx.db.insert("collaborativeUpdates", {
        vaultId: vault._id,
        filePath: args.filePath,
        version: currentVersion,
        clientId: update.clientId,
        changes: update.changes,
        userId,
        timestamp,
      });

      console.log(
        "pushUpdates: inserted update",
        inserted,
        "for version",
        currentVersion,
      );

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
      lastEditUserId: userId,
    });

    return {
      success: true,
      newVersion: currentVersion,
    };
  },
});

/**
 * Apply remote updates to the file content in staging
 * This is called internally when updates are pushed
 */
export const applyUpdatesToStaging = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    filePath: v.string(),
    updates: v.array(
      v.object({
        changes: v.string(),
        version: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get current staging record
    const staging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("filePath", args.filePath),
      )
      .first();

    if (!staging) {
      return null;
    }

    // Apply the updates to the actual content using proper CodeMirror functions
    let currentDoc = Text.of(staging.content.split("\n"));

    // Sort updates by version to apply them in order
    const sortedUpdates = args.updates.sort((a, b) => a.version - b.version);

    for (const update of sortedUpdates) {
      try {
        // Parse the serialized ChangeSet from CodeMirror
        const changeSet = ChangeSet.fromJSON(JSON.parse(update.changes));

        // Apply the changes to the document using CodeMirror's proper methods
        currentDoc = changeSet.apply(currentDoc);
      } catch (error) {
        console.error(
          "Error applying update in applyUpdatesToStaging:",
          error,
          "Update:",
          update,
        );
        // Continue with other updates even if one fails
      }
    }

    const latestVersion = Math.max(...args.updates.map((u) => u.version));
    const updatedContent = currentDoc.toString();

    await ctx.db.patch(staging._id, {
      content: updatedContent,
      version: latestVersion,
      lastEditTime: Date.now(),
    });

    return null;
  },
});

/**
 * Get all users currently editing a file (for awareness features)
 */
export const getActiveEditors = query({
  args: {
    vaultId: v.id("vaults"),
    filePath: v.string(),
  },
  returns: v.array(
    v.object({
      userId: v.id("users"),
      lastActive: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    // Get recent updates (within last 30 seconds) to determine active editors
    const recentTimestamp = Date.now() - 30 * 1000;

    const recentUpdates = await ctx.db
      .query("collaborativeUpdates")
      .withIndex("by_file", (q) =>
        q.eq("vaultId", args.vaultId).eq("filePath", args.filePath),
      )
      .filter((q) => q.gt(q.field("timestamp"), recentTimestamp))
      .collect();

    // Group by user and get the most recent activity
    const userActivity = new Map<string, number>();
    for (const update of recentUpdates) {
      const currentLatest = userActivity.get(update.userId) ?? 0;
      if (update.timestamp > currentLatest) {
        userActivity.set(update.userId, update.timestamp);
      }
    }

    return Array.from(userActivity.entries()).map(([userId, lastActive]) => ({
      userId: userId as any, // Type assertion for Convex ID
      lastActive,
    }));
  },
});
