"use node";

import { action, type ActionCtx } from "./_generated/server";
import { v, Infer } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getUserId } from "./common";
import type { ToolContext } from "./agent/tools";
import { runAgentGraph } from "./agent/graph";
import { saveMessage } from "@convex-dev/agent";
import { Octokit } from "@octokit/rest";

const { object, string, optional, id } = v;

const sendAgentMessageArgs = object({
  vaultId: id("vaults"),
  agentPath: string(),
  message: string(),
  threadId: optional(string()),
});

const sendAgentMessageReturns = object({
  threadId: string(),
  response: string(),
});

type SendAgentMessageArgs = Infer<typeof sendAgentMessageArgs>;

async function resolveThreadId(
  ctx: ActionCtx,
  userId: Id<"users">,
  threadId?: string,
): Promise<string> {
  if (threadId) {
    const existing = await ctx.runQuery(components.agent.threads.getThread, {
      threadId,
    });
    if (existing?.userId === userId) {
      return existing._id;
    }
  }

  const created = await ctx.runMutation(components.agent.threads.createThread, {
    userId,
  });
  return created._id;
}

function buildToolContext(
  ctx: ActionCtx,
  threadId: string,
  vault: {
    _id: Id<"vaults">;
    ghRepoOwner: string;
    ghRepoName: string;
  },
  user: { _id: Id<"users">; githubAccessToken?: string },
): ToolContext {
  if (!user.githubAccessToken) {
    throw new Error("GitHub access token not found");
  }

  return {
    ctx,
    threadId,
    vaultId: vault._id,
    owner: vault.ghRepoOwner,
    repo: vault.ghRepoName,
    userId: user._id,
    accessToken: user.githubAccessToken,
  };
}

async function loadAgentPrompt(args: {
  ctx: ActionCtx;
  vault: Doc<"vaults">;
  user: Doc<"users">;
  agentPath: string;
}): Promise<string> {
  const { ctx, vault, user, agentPath } = args;

  const staging = await ctx.runQuery(internal.fileStaging.getByOriginalPath, {
    vaultId: vault._id,
    originalFilePath: agentPath,
  });
  if (staging && typeof staging.content === "string") {
    return staging.content;
  }

  const treeSha = vault.treeData.tree.find(
    (entry) => entry.path === agentPath,
  )?.sha;
  if (treeSha) {
    const blob = await ctx.runQuery(internal.gitOperations.getBlobBySha, {
      sha: treeSha,
    });
    if (blob && typeof blob.text === "string") {
      return blob.text;
    }
  }

  if (user.githubAccessToken) {
    const octokit = new Octokit({ auth: user.githubAccessToken });
    const file = await octokit.rest.repos.getContent({
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
      path: agentPath,
    });
    if (Array.isArray(file.data) || file.data.type !== "file") {
      throw new Error(`Error: ${agentPath} is a directory, not a file`);
    }
    return Buffer.from(file.data.content, "base64").toString("utf-8");
  }

  throw new Error("GitHub access token not found");
}

export const sendAgentMessage = action({
  args: sendAgentMessageArgs,
  returns: sendAgentMessageReturns,
  handler: async (ctx, args: SendAgentMessageArgs) => {
    const userId = await getUserId(ctx);
    console.log("agentGraph:sendAgentMessage:start", {
      vaultId: args.vaultId,
      agentPath: args.agentPath,
      hasThreadId: Boolean(args.threadId),
      userId,
    });

    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    if (vault.userId !== userId) {
      throw new Error("You do not have access to this vault");
    }

    const user = await ctx.runQuery(internal.users.getById, {
      userId,
    });

    if (!user) {
      throw new Error("User not found");
    }

    const resolvedThreadId = await resolveThreadId(ctx, userId, args.threadId);

    const toolCtx = user.githubAccessToken
      ? buildToolContext(ctx, resolvedThreadId, vault, user)
      : undefined;

    let systemPrompt: string;
    try {
      systemPrompt = await loadAgentPrompt({
        ctx,
        vault,
        user,
        agentPath: args.agentPath,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load agent prompt";
      throw new Error(message);
    }

    if (systemPrompt.startsWith("Error:")) {
      throw new Error(systemPrompt);
    }

    const trimmedPrompt = systemPrompt.trim();
    if (!trimmedPrompt) {
      throw new Error("Agent prompt file is empty");
    }

    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId: resolvedThreadId,
      userId,
      prompt: args.message,
    });

    const result = await runAgentGraph({
      ctx,
      toolCtx,
      systemPrompt,
      threadId: resolvedThreadId,
      promptMessageId: messageId,
      userId,
    });

    console.log("agentGraph:sendAgentMessage:done", {
      threadId: resolvedThreadId,
      responseLength: result.text.length,
    });

    return {
      threadId: resolvedThreadId,
      response: result.text,
    };
  },
});
