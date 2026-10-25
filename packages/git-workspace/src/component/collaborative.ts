import {
  buildStaleBaseVersionErrorMessage,
  STALE_BASE_VERSION_ERROR_CODE,
} from "../stagingErrors.js";
import { ChangeSet, Text } from "@codemirror/state";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host wrappers enforce access.
import { internalMutation, mutation, query } from "./_generated/server.js";
import { readStagedFileKind } from "../stagingChanges.js";

const { array, boolean, number, object, string } = v;
const scope = { repositoryId: string(), branch: string(), filePath: string() };
const MAX_UPDATES_TO_KEEP = 200;
const CLEANUP_BATCH_SIZE = 500;

export const pullUpdates = query({
  args: { ...scope, version: number() },
  returns: array(
    object({ clientID: string(), changes: string(), version: number(), userId: string() }),
  ),
  handler: async (ctx, args) => {
    const updates = await ctx.db
      .query("fileUpdates")
      .withIndex("by_file_and_version", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
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

export const pushUpdates = mutation({
  args: {
    ...scope,
    version: number(),
    userId: string(),
    updates: array(object({ clientId: string(), changes: string() })),
  },
  returns: object({ success: boolean(), newVersion: number() }),
  handler: async (ctx, args) => {
    const staging = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath),
      )
      .unique();
    if (!staging) throw new Error("Staging not found");
    if (staging.fileDeleted) throw new Error("Cannot update content for a deleted staged file.");
    if (readStagedFileKind(staging.kind) === "binary")
      throw new Error("Cannot edit binary staged content as text.");
    let currentVersion = staging.version;
    if (args.version !== currentVersion) return { success: false, newVersion: currentVersion };
    const timestamp = Date.now();
    let doc = Text.of(staging.content.split("\n"));
    for (const update of args.updates) {
      currentVersion++;
      doc = ChangeSet.fromJSON(JSON.parse(update.changes)).apply(doc);
      await ctx.db.insert("fileUpdates", {
        repositoryId: args.repositoryId,
        branch: args.branch,
        filePath: args.filePath,
        version: currentVersion,
        clientId: update.clientId,
        changes: update.changes,
        userId: args.userId,
        timestamp,
      });
    }
    await ctx.db.patch(staging._id, {
      content: doc.toString(),
      version: currentVersion,
      lastEditTime: timestamp,
      lastEditUserId: args.userId,
    });
    if (currentVersion % 50 === 0)
      await ctx.scheduler.runAfter(0, internal.collaborative.pruneOldUpdates, {
        repositoryId: args.repositoryId,
        branch: args.branch,
        filePath: args.filePath,
        currentVersion,
      });
    return { success: true, newVersion: currentVersion };
  },
});

export const pushContentUpdate = mutation({
  args: { ...scope, expectedVersion: number(), newContent: string(), userId: string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staging = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath),
      )
      .unique();
    if (!staging) return null;
    if (staging.fileDeleted) throw new Error("Cannot update content for a deleted staged file.");
    if (readStagedFileKind(staging.kind) === "binary")
      throw new Error("Cannot edit binary staged content as text.");
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
    if (staging.content === args.newContent) return null;
    const oldDoc = Text.of(staging.content.split("\n"));
    const changes = ChangeSet.of(
      { from: 0, to: oldDoc.length, insert: args.newContent },
      oldDoc.length,
    );
    const newVersion = staging.version + 1;
    const timestamp = Date.now();
    await ctx.db.insert("fileUpdates", {
      repositoryId: args.repositoryId,
      branch: args.branch,
      filePath: args.filePath,
      version: newVersion,
      clientId: "agent",
      changes: JSON.stringify(changes.toJSON()),
      userId: args.userId,
      timestamp,
    });
    await ctx.db.patch(staging._id, {
      content: args.newContent,
      version: newVersion,
      lastEditTime: timestamp,
      lastEditUserId: args.userId,
    });
    if (newVersion % 50 === 0)
      await ctx.scheduler.runAfter(0, internal.collaborative.pruneOldUpdates, {
        repositoryId: args.repositoryId,
        branch: args.branch,
        filePath: args.filePath,
        currentVersion: newVersion,
      });
    return null;
  },
});

export const pruneOldUpdates = internalMutation({
  args: { ...scope, currentVersion: number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cutoffVersion = args.currentVersion - MAX_UPDATES_TO_KEEP;
    if (cutoffVersion <= 0) return null;
    const updates = await ctx.db
      .query("fileUpdates")
      .withIndex("by_file_and_version", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath)
          .lte("version", cutoffVersion),
      )
      .take(CLEANUP_BATCH_SIZE);
    for (const update of updates) await ctx.db.delete(update._id);
    if (updates.length === CLEANUP_BATCH_SIZE)
      await ctx.scheduler.runAfter(0, internal.collaborative.pruneOldUpdates, {
        repositoryId: args.repositoryId,
        branch: args.branch,
        filePath: args.filePath,
        currentVersion: args.currentVersion,
      });
    return null;
  },
});
