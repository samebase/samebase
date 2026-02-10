"use node";

import { internalAction } from "./_generated/server";
import { v, Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { GithubTreeData } from "./schema";
import { executeReadFile } from "./agent/tools";
import type { ToolContext } from "./agent/tools";
import { buildSystemPrompt } from "./agent/systemPrompt";
import { runAgentGraph } from "./agent/graph";

const MODEL = "claude-sonnet-4-20250514";

export const generateResponse = internalAction({
  args: {
    conversationId: v.id("chatConversations"),
    vaultId: v.optional(v.id("vaults")),
    filePath: v.optional(v.string()),
    branch: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const messages = await ctx.runQuery(internal.chat.loadMessagesForAction, {
      conversationId: args.conversationId,
    });

    // Load vault context if available
    let vault: {
      _id: Id<"vaults">;
      ghRepoOwner: string;
      ghRepoName: string;
      userId: Id<"users">;
      treeData: Infer<typeof GithubTreeData>;
    } | null = null;
    let user: {
      _id: Id<"users">;
      githubAccessToken?: string;
    } | null = null;

    if (args.vaultId) {
      const v = await ctx.runQuery(internal.vault.getById, {
        id: args.vaultId,
      });
      if (v) {
        vault = v;
        user = await ctx.runQuery(internal.users.getById, {
          userId: v.userId,
        });
      }
    }

    const hasToolAccess = vault && user?.githubAccessToken;

    // Gather context for the system prompt
    let fileContent: string | undefined;
    let repoTree: string[] | undefined;

    if (vault) {
      repoTree = vault.treeData?.tree
        ?.filter((t: { type?: string }) => t.type === "blob")
        ?.map((t: { path?: string }) => t.path)
        ?.filter((p: string | undefined): p is string => !!p);
    }

    if (args.filePath && vault && user?.githubAccessToken) {
      try {
        fileContent = await executeReadFile(
          {
            ctx,
            vaultId: vault._id,
            owner: vault.ghRepoOwner,
            repo: vault.ghRepoName,
            userId: user._id,
            accessToken: user.githubAccessToken,
          },
          { path: args.filePath },
        );
      } catch {
        // File content is optional context — don't fail the request
      }
    }

    const systemPrompt = buildSystemPrompt({
      owner: vault?.ghRepoOwner,
      repo: vault?.ghRepoName,
      branch: args.branch,
      filePath: args.filePath,
      fileContent,
      repoTree,
    });

    await ctx.runMutation(internal.chat.saveSystemPrompt, {
      conversationId: args.conversationId,
      systemPrompt,
    });

    if (!hasToolAccess || !vault || !user?.githubAccessToken) {
      // No tools — run graph without tool context (tools won't be bound)
      const result = await runAgentGraph({
        systemPrompt,
        messages,
        model: MODEL,
      });

      await ctx.runMutation(internal.chat.saveAssistantMessage, {
        conversationId: args.conversationId,
        content: result.text,
        model: MODEL,
      });
      return null;
    }

    // Build tool context
    const toolCtx: ToolContext = {
      ctx,
      vaultId: vault._id,
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
      userId: user._id,
      accessToken: user.githubAccessToken,
    };

    const result = await runAgentGraph({
      toolCtx,
      systemPrompt,
      messages,
      model: MODEL,
    });

    if (result.commitProposal) {
      // Save as a commit proposal message (same metadata shape as before)
      await ctx.runMutation(internal.chat.saveAssistantMessage, {
        conversationId: args.conversationId,
        content: `I've prepared the changes and propose committing them with the message: "${result.commitProposal}"`,
        model: MODEL,
        metadata: JSON.stringify({
          type: "commit_proposal",
          message: result.commitProposal,
          tools: result.toolActivity,
        }),
      });
    } else {
      const metadata =
        result.toolActivity.length > 0
          ? JSON.stringify({
              type: "tool_activity",
              tools: result.toolActivity,
            })
          : undefined;

      await ctx.runMutation(internal.chat.saveAssistantMessage, {
        conversationId: args.conversationId,
        content: result.text,
        model: MODEL,
        metadata,
      });
    }

    return null;
  },
});
