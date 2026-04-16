"use node";

import { Octokit } from "@octokit/rest";
import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, type ActionCtx } from "./_generated/server";
import { getUserId } from "./common";
import { readPublishedFileFormat } from "../shared/publishedFiles";
import {
  PublishedFileFormat as publishedFileFormatValidator,
  PublishedFileRefKind as publishedFileRefKindValidator,
} from "./schema";

const { null: vNull, number, object, optional, string, union } = v;

const publishRepositoryFileArgsValidator = object({
  owner: string(),
  repoName: string(),
  branch: string(),
  filePath: string(),
});

const publishedFileRouteArgsValidator = object({
  owner: string(),
  repoName: string(),
  ref: string(),
  filePath: string(),
});

const publishRepositoryFileResultValidator = object({
  publishedAt: number(),
  updatedAt: number(),
  sourceCommitSha: optional(string()),
});
type PublishRepositoryFileResult = Infer<
  typeof publishRepositoryFileResultValidator
>;

const resolvedPublishedFileResultValidator = union(
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
type ResolvedPublishedFile = Infer<typeof resolvedPublishedFileResultValidator>;

type LoadedBranchFileResult =
  | {
      kind: "success";
      content: string;
      format: Infer<typeof publishedFileFormatValidator>;
      sourceCommitSha: string;
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "unavailable";
    };

function readGitHubErrorStatus(error: unknown): number | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return null;
}

function decodeGithubFileContent(args: {
  content: string;
  encoding: string | undefined;
}): string {
  if (args.encoding !== "base64") {
    throw new Error("GitHub returned an unsupported file encoding.");
  }

  const buffer = Buffer.from(args.content.replace(/\n/g, ""), "base64");
  if (buffer.includes(0)) {
    throw new Error("Only text files can be published right now.");
  }

  return buffer.toString("utf8");
}

async function createGithubClientForUser(args: {
  ctx: ActionCtx;
  userId: Id<"users">;
}): Promise<Octokit | null> {
  const githubConnection = await args.ctx.runQuery(
    internal.providerConnections.getByUserAndKind,
    {
      userId: args.userId,
      kind: "github",
    },
  );
  if (githubConnection?.kind !== "github") {
    return null;
  }

  return new Octokit({
    auth: githubConnection.auth.credential,
  });
}

async function loadCommittedBranchFile(args: {
  ctx: ActionCtx;
  userId: Id<"users">;
  owner: string;
  repoName: string;
  branch: string;
  filePath: string;
}): Promise<LoadedBranchFileResult> {
  const format = readPublishedFileFormat(args.filePath);
  if (!format) {
    return {
      kind: "not_found",
    };
  }

  const octokit = await createGithubClientForUser({
    ctx: args.ctx,
    userId: args.userId,
  });
  if (!octokit) {
    return {
      kind: "unavailable",
    };
  }

  try {
    const [branchResponse, fileResponse] = await Promise.all([
      octokit.rest.repos.getBranch({
        owner: args.owner,
        repo: args.repoName,
        branch: args.branch,
      }),
      octokit.rest.repos.getContent({
        owner: args.owner,
        repo: args.repoName,
        path: args.filePath,
        ref: args.branch,
      }),
    ]);

    if (Array.isArray(fileResponse.data) || fileResponse.data.type !== "file") {
      throw new Error("Only committed files can be published.");
    }

    return {
      kind: "success",
      content: decodeGithubFileContent({
        content: fileResponse.data.content,
        encoding: fileResponse.data.encoding,
      }),
      format,
      sourceCommitSha: branchResponse.data.commit.sha,
    };
  } catch (error) {
    if (readGitHubErrorStatus(error) === 404) {
      return {
        kind: "not_found",
      };
    }
    return {
      kind: "unavailable",
    };
  }
}

function buildResolvedPublishedFile(args: {
  owner: string;
  repoName: string;
  ref: string;
  refKind: Infer<typeof publishedFileRefKindValidator>;
  filePath: string;
  content: string;
  format: Infer<typeof publishedFileFormatValidator>;
  sourceBranch: string;
  sourceCommitSha: string | undefined;
  publishedAt: number;
  updatedAt: number;
}): ResolvedPublishedFile {
  return {
    owner: args.owner,
    repoName: args.repoName,
    ref: args.ref,
    refKind: args.refKind,
    filePath: args.filePath,
    content: args.content,
    format: args.format,
    sourceBranch: args.sourceBranch,
    sourceCommitSha: args.sourceCommitSha,
    publishedAt: args.publishedAt,
    updatedAt: args.updatedAt,
  };
}

/**
 * Publishing creates the public branch permission and captures the first exact
 * commit snapshot. After that, `/p/<branch>/...` resolves the latest branch
 * content live while `/p/<sha>/...` remains immutable.
 */
export const publishRepositoryFile = action({
  args: publishRepositoryFileArgsValidator,
  returns: publishRepositoryFileResultValidator,
  handler: async (ctx, args): Promise<PublishRepositoryFileResult> => {
    const format = readPublishedFileFormat(args.filePath);
    if (!format) {
      throw new Error("Only markdown and plain-text files can be published.");
    }

    const userId = await getUserId(ctx);
    const repositoryFullName = `${args.owner}/${args.repoName}`;
    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName,
      userId,
      branch: args.branch,
    });

    if (!vault || vault.branchNotFound) {
      throw new Error("Repository branch not found.");
    }

    const branchFile = await loadCommittedBranchFile({
      ctx,
      userId,
      owner: args.owner,
      repoName: args.repoName,
      branch: args.branch,
      filePath: args.filePath,
    });
    if (branchFile.kind === "not_found") {
      throw new Error("The repository file could not be found on GitHub.");
    }
    if (branchFile.kind !== "success") {
      throw new Error("GitHub is not connected.");
    }

    return await ctx.runMutation(
      internal.publishedFiles.upsertPublishedFileReferencesInternal,
      {
        userId,
        vaultId: vault._id,
        owner: args.owner,
        repoName: args.repoName,
        sourceBranch: args.branch,
        sourceCommitSha: branchFile.sourceCommitSha,
        filePath: args.filePath,
        content: branchFile.content,
        format: branchFile.format,
        now: Date.now(),
      },
    );
  },
});

/**
 * Public branch routes prefer the latest committed branch content, but they
 * fail gracefully to the last synced snapshot when GitHub is temporarily
 * unavailable so a published page does not disappear due to a transient token
 * or network problem.
 */
export const resolvePublishedFile = action({
  args: publishedFileRouteArgsValidator,
  returns: resolvedPublishedFileResultValidator,
  handler: async (ctx, args): Promise<ResolvedPublishedFile> => {
    const record = await ctx.runQuery(
      internal.publishedFiles.getActivePublishedFileRecordByRoute,
      args,
    );
    if (!record) {
      return null;
    }

    if (record.refKind === "commit") {
      return buildResolvedPublishedFile({
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
      });
    }

    const branchFile = await loadCommittedBranchFile({
      ctx,
      userId: record.userId,
      owner: record.ghRepoOwner,
      repoName: record.ghRepoName,
      branch: record.ref,
      filePath: record.filePath,
    });
    if (branchFile.kind === "not_found") {
      return null;
    }

    if (branchFile.kind !== "success") {
      return buildResolvedPublishedFile({
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
      });
    }

    if (
      branchFile.sourceCommitSha === record.sourceCommitSha &&
      branchFile.content === record.content &&
      branchFile.format === record.format
    ) {
      return buildResolvedPublishedFile({
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
      });
    }

    const syncedRecord = await ctx.runMutation(
      internal.publishedFiles.upsertPublishedFileReferencesInternal,
      {
        userId: record.userId,
        vaultId: record.vaultId,
        owner: record.ghRepoOwner,
        repoName: record.ghRepoName,
        sourceBranch: record.sourceBranch,
        sourceCommitSha: branchFile.sourceCommitSha,
        filePath: record.filePath,
        content: branchFile.content,
        format: branchFile.format,
        now: Date.now(),
      },
    );

    return buildResolvedPublishedFile({
      owner: record.ghRepoOwner,
      repoName: record.ghRepoName,
      ref: record.ref,
      refKind: record.refKind,
      filePath: record.filePath,
      content: branchFile.content,
      format: branchFile.format,
      sourceBranch: record.sourceBranch,
      sourceCommitSha: branchFile.sourceCommitSha,
      publishedAt: syncedRecord.publishedAt,
      updatedAt: syncedRecord.updatedAt,
    });
  },
});

export const getPublishedFileState = action({
  args: publishRepositoryFileArgsValidator,
  returns: union(vNull(), publishRepositoryFileResultValidator),
  handler: async (ctx, args): Promise<PublishRepositoryFileResult | null> => {
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

    const record = await ctx.runQuery(
      internal.publishedFiles.getActivePublishedBranchRecordForOwner,
      {
        owner: args.owner,
        repoName: args.repoName,
        branch: args.branch,
        filePath: args.filePath,
      },
    );
    if (!record || record.vaultId !== vault._id) {
      return null;
    }

    const branchFile = await loadCommittedBranchFile({
      ctx,
      userId: record.userId,
      owner: record.ghRepoOwner,
      repoName: record.ghRepoName,
      branch: record.ref,
      filePath: record.filePath,
    });

    if (branchFile.kind === "success") {
      if (
        branchFile.sourceCommitSha === record.sourceCommitSha &&
        branchFile.content === record.content &&
        branchFile.format === record.format
      ) {
        return {
          publishedAt: record.publishedAt,
          updatedAt: record.updatedAt,
          sourceCommitSha: record.sourceCommitSha,
        };
      }

      return await ctx.runMutation(
        internal.publishedFiles.upsertPublishedFileReferencesInternal,
        {
          userId: record.userId,
          vaultId: record.vaultId,
          owner: record.ghRepoOwner,
          repoName: record.ghRepoName,
          sourceBranch: record.sourceBranch,
          sourceCommitSha: branchFile.sourceCommitSha,
          filePath: record.filePath,
          content: branchFile.content,
          format: branchFile.format,
          now: Date.now(),
        },
      );
    }

    return {
      publishedAt: record.publishedAt,
      updatedAt: record.updatedAt,
      sourceCommitSha: record.sourceCommitSha,
    };
  },
});
