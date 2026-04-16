import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { getUserId } from "./common";
import {
  PublishedFileFormat as publishedFileFormatValidator,
  PublishedFileRefKind as publishedFileRefKindValidator,
} from "./schema";

const { id, null: vNull, number, object, optional, string, union } = v;

const publishedFileRouteArgsValidator = object({
  owner: string(),
  repoName: string(),
  ref: string(),
  filePath: string(),
});

const publishedFileStateArgsValidator = object({
  owner: string(),
  repoName: string(),
  branch: string(),
  filePath: string(),
});

const upsertPublishedFileReferencesInternalArgsValidator = object({
  userId: id("users"),
  vaultId: id("vaults"),
  owner: string(),
  repoName: string(),
  sourceBranch: string(),
  sourceCommitSha: optional(string()),
  filePath: string(),
  content: string(),
  format: publishedFileFormatValidator,
  now: number(),
});

const publishedFileRecordValidator = object({
  userId: id("users"),
  vaultId: id("vaults"),
  ghRepoOwner: string(),
  ghRepoName: string(),
  sourceBranch: string(),
  sourceCommitSha: optional(string()),
  refKind: publishedFileRefKindValidator,
  ref: string(),
  filePath: string(),
  content: string(),
  format: publishedFileFormatValidator,
  publishedAt: number(),
  updatedAt: number(),
});

const publishedFileRecordResultValidator = union(
  vNull(),
  publishedFileRecordValidator,
);
type PublishedFileRecordResult = Infer<
  typeof publishedFileRecordResultValidator
>;

const upsertPublishedFileReferencesInternalResultValidator = object({
  publishedAt: number(),
  updatedAt: number(),
  sourceCommitSha: optional(string()),
});
type UpsertPublishedFileReferencesInternalResult = Infer<
  typeof upsertPublishedFileReferencesInternalResultValidator
>;

const nullValidator = vNull();

export const getActivePublishedFileRecordByRoute = internalQuery({
  args: publishedFileRouteArgsValidator,
  returns: publishedFileRecordResultValidator,
  handler: async (ctx, args): Promise<PublishedFileRecordResult> => {
    const record = await ctx.db
      .query("publishedFileLinks")
      .withIndex("by_owner_repo_ref_path", (q) =>
        q
          .eq("ghRepoOwner", args.owner)
          .eq("ghRepoName", args.repoName)
          .eq("ref", args.ref)
          .eq("filePath", args.filePath),
      )
      .unique();

    if (!record || typeof record.unpublishedAt === "number") {
      return null;
    }

    return {
      userId: record.userId,
      vaultId: record.vaultId,
      ghRepoOwner: record.ghRepoOwner,
      ghRepoName: record.ghRepoName,
      sourceBranch: record.sourceBranch,
      sourceCommitSha: record.sourceCommitSha,
      refKind: record.refKind,
      ref: record.ref,
      filePath: record.filePath,
      content: record.content,
      format: record.format,
      publishedAt: record.publishedAt,
      updatedAt: record.updatedAt,
    };
  },
});

export const getActivePublishedBranchRecordForOwner = internalQuery({
  args: publishedFileStateArgsValidator,
  returns: publishedFileRecordResultValidator,
  handler: async (ctx, args): Promise<PublishedFileRecordResult> => {
    const record = await ctx.db
      .query("publishedFileLinks")
      .withIndex("by_owner_repo_ref_path", (q) =>
        q
          .eq("ghRepoOwner", args.owner)
          .eq("ghRepoName", args.repoName)
          .eq("ref", args.branch)
          .eq("filePath", args.filePath),
      )
      .unique();

    if (
      !record ||
      typeof record.unpublishedAt === "number" ||
      record.refKind !== "branch"
    ) {
      return null;
    }

    return {
      userId: record.userId,
      vaultId: record.vaultId,
      ghRepoOwner: record.ghRepoOwner,
      ghRepoName: record.ghRepoName,
      sourceBranch: record.sourceBranch,
      sourceCommitSha: record.sourceCommitSha,
      refKind: record.refKind,
      ref: record.ref,
      filePath: record.filePath,
      content: record.content,
      format: record.format,
      publishedAt: record.publishedAt,
      updatedAt: record.updatedAt,
    };
  },
});

export const upsertPublishedFileReferencesInternal = internalMutation({
  args: upsertPublishedFileReferencesInternalArgsValidator,
  returns: upsertPublishedFileReferencesInternalResultValidator,
  handler: async (
    ctx,
    args,
  ): Promise<UpsertPublishedFileReferencesInternalResult> => {
    async function upsertReference(referenceArgs: {
      ref: string;
      refKind: Infer<typeof publishedFileRefKindValidator>;
    }): Promise<number> {
      const existingRecord = await ctx.db
        .query("publishedFileLinks")
        .withIndex("by_owner_repo_ref_path", (q) =>
          q
            .eq("ghRepoOwner", args.owner)
            .eq("ghRepoName", args.repoName)
            .eq("ref", referenceArgs.ref)
            .eq("filePath", args.filePath),
        )
        .unique();

      const publishedAt =
        existingRecord && typeof existingRecord.unpublishedAt !== "number"
          ? existingRecord.publishedAt
          : args.now;

      const nextRecord = {
        userId: args.userId,
        vaultId: args.vaultId,
        ghRepoOwner: args.owner,
        ghRepoName: args.repoName,
        sourceBranch: args.sourceBranch,
        sourceCommitSha: args.sourceCommitSha,
        refKind: referenceArgs.refKind,
        ref: referenceArgs.ref,
        filePath: args.filePath,
        content: args.content,
        format: args.format,
        publishedAt,
        updatedAt: args.now,
        unpublishedAt: undefined,
      } as const;

      if (existingRecord) {
        await ctx.db.patch(existingRecord._id, nextRecord);
        return publishedAt;
      }

      await ctx.db.insert("publishedFileLinks", nextRecord);
      return publishedAt;
    }

    const branchPublishedAt = await upsertReference({
      ref: args.sourceBranch,
      refKind: "branch",
    });

    if (args.sourceCommitSha) {
      await upsertReference({
        ref: args.sourceCommitSha,
        refKind: "commit",
      });
    }

    return {
      publishedAt: branchPublishedAt,
      updatedAt: args.now,
      sourceCommitSha: args.sourceCommitSha,
    };
  },
});

export const unpublishRepositoryFile = mutation({
  args: publishedFileStateArgsValidator,
  returns: nullValidator,
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const repositoryFullName = `${args.owner}/${args.repoName}`;
    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName,
      userId,
      branch: args.branch,
    });

    if (!vault || vault.branchNotFound) {
      throw new Error("Repository branch not found");
    }

    const matchingRecords = await ctx.db
      .query("publishedFileLinks")
      .withIndex("by_vault_and_file_path", (q) =>
        q.eq("vaultId", vault._id).eq("filePath", args.filePath),
      )
      .collect();
    const now = Date.now();

    await Promise.all(
      matchingRecords
        .filter((record) => record.sourceBranch === args.branch)
        .map((record) =>
          ctx.db.patch(record._id, {
            unpublishedAt: now,
            updatedAt: now,
          }),
        ),
    );

    return null;
  },
});
