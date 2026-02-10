// @ts-nocheck
"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getUserId } from "./common";
import { Octokit } from "@octokit/rest";
import type { Doc } from "./_generated/dataModel";

export const getCommitStatus = action({
  args: {
    owner: v.string(),
    repo: v.string(),
    ref: v.string(), // commit SHA or branch name
  },
  returns: v.object({
    check_runs: v.array(
      v.object({
        id: v.number(),
        name: v.string(),
        status: v.string(),
        conclusion: v.union(v.string(), v.null()),
        html_url: v.string(),
      }),
    ),
    statuses: v.array(
      v.object({
        id: v.number(),
        state: v.string(),
        context: v.string(),
        description: v.union(v.string(), v.null()),
        target_url: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, { owner, repo, ref }) => {
    await getUserId(ctx);
    const currentUser: Doc<"users"> | null = await ctx.runQuery(
      internal.users.getAuthUser,
      {},
    );
    if (!currentUser) {
      throw new Error("User not found");
    }

    const octokit: Octokit = new Octokit({
      auth: currentUser.githubAccessToken,
    });

    const [checksResponse, combinedStatusResponse] = await Promise.all([
      octokit.checks.listForRef({
        owner,
        repo,
        ref,
      }),
      octokit.repos.getCombinedStatusForRef({
        owner,
        repo,
        ref,
      }),
    ]);

    return {
      check_runs: checksResponse.data.check_runs.map((run) => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion ?? null,
        html_url: run.html_url ?? "",
      })),
      statuses: combinedStatusResponse.data.statuses.map((status) => ({
        id: status.id,
        state: status.state,
        context: status.context,
        description: status.description ?? null,
        target_url: status.target_url ?? null,
      })),
    };
  },
});
