"use node";

import { Octokit } from "@octokit/rest";
import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { getUserId } from "./common";
import { readPublishedFileFormat } from "../shared/publishedFiles";

const { number, object, optional, string } = v;

const publishRepositoryFileArgsValidator = object({
  owner: string(),
  repoName: string(),
  branch: string(),
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

/**
 * Publish the committed repository version so `/p/...` never points at
 * uncommitted staging state that only exists inside the editor session.
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

    const githubConnection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId,
        kind: "github",
      },
    );
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected.");
    }

    const octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });

    let sourceCommitSha: string | undefined;
    let content: string;

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

      sourceCommitSha = branchResponse.data.commit.sha;

      if (
        Array.isArray(fileResponse.data) ||
        fileResponse.data.type !== "file"
      ) {
        throw new Error("Only committed files can be published.");
      }

      content = decodeGithubFileContent({
        content: fileResponse.data.content,
        encoding: fileResponse.data.encoding,
      });
    } catch (error) {
      const status = readGitHubErrorStatus(error);
      if (status === 404) {
        throw new Error("The repository file could not be found on GitHub.");
      }
      throw error;
    }

    return await ctx.runMutation(
      internal.publishedFiles.upsertPublishedSnapshotInternal,
      {
        userId,
        vaultId: vault._id,
        owner: args.owner,
        repoName: args.repoName,
        sourceBranch: args.branch,
        sourceCommitSha,
        filePath: args.filePath,
        content,
        format,
        now: Date.now(),
      },
    );
  },
});
