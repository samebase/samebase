import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
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

const upsertPublishedSnapshotInternalArgsValidator = object({
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

const publishedFileStateResultValidator = union(
  vNull(),
  object({
    publishedAt: number(),
    updatedAt: number(),
    sourceCommitSha: optional(string()),
  }),
);
type PublishedFileState = Infer<typeof publishedFileStateResultValidator>;

const resolvedPublishedFileValidator = union(
  vNull(),
  object({
    owner: string(),
    repoName: string(),
    ref: string(),
    refKind: publishedFileRefKindValidator,
    filePath: string(),
    content: string(),
    format: publishedFileFormatValidator,
    sourceBranch: string(),
    sourceCommitSha: optional(string()),
    publishedAt: number(),
    updatedAt: number(),
  }),
);
type ResolvedPublishedFile = Infer<typeof resolvedPublishedFileValidator>;

const upsertPublishedSnapshotInternalResultValidator = object({
  publishedAt: number(),
  updatedAt: number(),
  sourceCommitSha: optional(string()),
});
type UpsertPublishedSnapshotInternalResult = Infer<
  typeof upsertPublishedSnapshotInternalResultValidator
>;

const nullValidator = vNull();

export const resolvePublishedFile = query({
  args: publishedFileRouteArgsValidator,
  returns: resolvedPublishedFileValidator,
  handler: async (ctx, args): Promise<ResolvedPublishedFile> => {
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
      owner: record.ghRepoOwner,
      repoName: record.ghRepoName,
      ref: record.ref,
      refKind: record.refKind,
      filePath: record.filePath,
      content: record.content,
      format: record.format,
      sourceBranch: record.sourceBranch,
      sourceCommitSha: record.sourceCommitSha,
      publishedAt: record.publishedAt,
      updatedAt: record.updatedAt,
    };
  },
});

export const getPublishedFileState = query({
  args: publishedFileStateArgsValidator,
  returns: publishedFileStateResultValidator,
  handler: async (ctx, args): Promise<PublishedFileState> => {
    const userId = await getUserId(ctx);
    const repositoryFullName = `${args.owner}/${args.repoName}`;
    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName,
      userId,
      branch: args.branch,
    });

    if (!vault || vault.branchNotFound) {
      return null;
    }

    const branchRecords = await ctx.db
      .query("publishedFileLinks")
      .withIndex("by_vault_and_source_branch_and_file_path", (q) =>
        q
          .eq("vaultId", vault._id)
          .eq("sourceBranch", args.branch)
          .eq("filePath", args.filePath),
      )
      .collect();
    const branchRecord = branchRecords.find(
      (record) =>
        record.refKind === "branch" &&
        record.ref === args.branch &&
        typeof record.unpublishedAt !== "number",
    );

    if (!branchRecord) {
      return null;
    }

    return {
      publishedAt: branchRecord.publishedAt,
      updatedAt: branchRecord.updatedAt,
      sourceCommitSha: branchRecord.sourceCommitSha,
    };
  },
});

export const upsertPublishedSnapshotInternal = internalMutation({
  args: upsertPublishedSnapshotInternalArgsValidator,
  returns: upsertPublishedSnapshotInternalResultValidator,
  handler: async (
    ctx,
    args,
  ): Promise<UpsertPublishedSnapshotInternalResult> => {
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
