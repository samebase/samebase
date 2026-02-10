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

    const { data } = await octokit.checks.listForRef({
      owner,
      repo,
      ref,
    });

    return {
      check_runs: data.check_runs.map((run) => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion ?? null,
        html_url: run.html_url ?? "",
      })),
    };
  },
});
