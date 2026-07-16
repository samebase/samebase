"use node";

import type { ActionCtx } from "./_generated/server";
import { v, Infer } from "convex/values";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./functions";
import { runAgentGraph } from "./agent/graph";
import { saveMessage } from "@convex-dev/agent";
import { Octokit } from "@octokit/rest";
import { isRecord } from "./jsonUtils";
import { assertConnectedVault, type ConnectedVault } from "./vault/state";

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
  vaultId: Id<"vaults">,
  threadId?: string,
): Promise<string> {
  if (threadId) {
    const existing = await ctx.runQuery(components.agent.threads.getThread, {
      threadId,
    });
    if (existing?.userId === userId) {
      const context = await ctx.runQuery(api.chat.index.getThreadContext, {
        threadId: existing._id,
      });
      const contextVaultId = isRecord(context) ? context.vaultId : undefined;
      if (contextVaultId === vaultId) {
        return existing._id;
      }
    }
  }

  return ctx.runMutation(api.chat.index.createThread, { vaultId });
}

function requireThreadBranch(branch: string | undefined): string {
  if (!branch) {
    throw new Error("Thread branch is required for branch-sensitive agent work");
  }
  return branch;
}

function readDefaultBranch(repoData: unknown): string {
  if (!isRecord(repoData)) {
    return "main";
  }

  const defaultBranch = repoData.default_branch;
  if (typeof defaultBranch === "string" && defaultBranch.length > 0) {
    return defaultBranch;
  }

  return "main";
}

async function resolveFallbackBranch(args: {
  vault: {
    githubOwner: string;
    githubName: string;
  };
  githubAccessToken?: string;
}): Promise<string> {
  if (!args.githubAccessToken) {
    return "main";
  }

  const octokit = new Octokit({ auth: args.githubAccessToken });
  const repo = await octokit.rest.repos.get({
    owner: args.vault.githubOwner,
    repo: args.vault.githubName,
  });
  return readDefaultBranch(repo.data);
}

async function loadAgentPrompt(args: {
  ctx: ActionCtx;
  vault: ConnectedVault;
  githubAccessToken?: string;
  agentPath: string;
  branch: string;
}): Promise<string> {
  const { ctx, vault, githubAccessToken, agentPath, branch } = args;

  const staging = await ctx.runQuery(internal.fileStaging.getByOriginalPath, {
    vaultId: vault._id,
    originalFilePath: agentPath,
    branch,
  });
  if (staging && typeof staging.content === "string") {
    return staging.content;
  }

  if (!githubAccessToken) {
    throw new Error("Prompt not found in staging or repo; connect GitHub to fetch missing content");
  }

  const octokit = new Octokit({ auth: githubAccessToken });
  const file = await octokit.rest.repos.getContent({
    owner: vault.githubOwner,
    repo: vault.githubName,
    path: agentPath,
    ref: branch,
  });
  if (Array.isArray(file.data) || file.data.type !== "file") {
    throw new Error(`Error: ${agentPath} is a directory, not a file`);
  }
  return Buffer.from(file.data.content, "base64").toString("utf-8");
}

export const sendAgentMessage = action({
  access: "access_admin",
  args: sendAgentMessageArgs,
  returns: sendAgentMessageReturns,
  handler: async (ctx, args: SendAgentMessageArgs) => {
    const userId = ctx.viewer.userId;
    const leaseId = await ctx.runMutation(internal.agent.actionLease.acquire, { userId });
    if (leaseId === null) {
      throw new Error("Account deletion is in progress");
    }

    try {
      console.log("agentGraph:sendAgentMessage:start", {
        vaultId: args.vaultId,
        agentPath: args.agentPath,
        hasThreadId: Boolean(args.threadId),
        userId,
      });

      const vault = await ctx.runQuery(internal.vault.records.getById, {
        id: args.vaultId,
      });

      if (!vault) {
        throw new Error("Vault not found");
      }

      if (vault.userId !== userId) {
        throw new Error("You do not have access to this vault");
      }
      const connectedVault = assertConnectedVault(vault);

      const user = await ctx.runQuery(internal.users.getById, {
        userId,
      });

      if (!user) {
        throw new Error("User not found");
      }
      const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId,
        kind: "github",
      });
      const githubAccessToken =
        githubConnection?.kind === "github" ? githubConnection.auth.credential : undefined;
      const resolvedThreadId = await resolveThreadId(ctx, userId, args.vaultId, args.threadId);
      const threadContext = await ctx.runQuery(internal.chat.index.getThreadContextForAction, {
        threadId: resolvedThreadId,
      });
      const fallbackBranch =
        threadContext?.branch ??
        (await resolveFallbackBranch({
          vault: connectedVault,
          githubAccessToken,
        }));
      const threadBranch = requireThreadBranch(threadContext?.branch ?? fallbackBranch);
      if (!threadContext?.branch) {
        await ctx.runMutation(internal.chat.index.setThreadBranchInternal, {
          threadId: resolvedThreadId,
          branch: threadBranch,
        });
      }

      let systemPrompt: string;
      try {
        systemPrompt = await loadAgentPrompt({
          ctx,
          vault: connectedVault,
          githubAccessToken,
          agentPath: args.agentPath,
          branch: threadBranch,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load agent prompt";
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
    } finally {
      await ctx.runMutation(internal.agent.actionLease.release, { leaseId });
    }
  },
});
