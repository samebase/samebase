"use node";

import { internalAction } from "./_generated/server";
import { v, Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { z } from "zod";
import { GithubTreeData } from "./schema";
import { executeReadFile } from "./agent/tools";
import type { ToolContext } from "./agent/tools";
import { buildSystemPrompt } from "./agent/systemPrompt";
import { runAgentGraph } from "./agent/graph";
import { applyRedaction, getProdAccessMode } from "./infraReadPolicy";

const MODEL = "claude-sonnet-4-20250514";

const allowedDataTableSchema = z.enum([
  "vaults",
  "vaultInfrastructure",
  "vaultDomains",
  "codespaces",
  "fileStaging",
  "aiProdAccessRequests",
  "aiProdAccessAudit",
]);
type AllowedDataTable = z.infer<typeof allowedDataTableSchema>;

const paramsJsonSchema = z.record(z.string(), z.unknown());
const optionalPositiveNumberSchema = z
  .number()
  .finite()
  .positive()
  .transform((value) => Math.floor(value));

function hashText(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash >>> 0).toString(16);
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    const result = paramsJsonSchema.safeParse(parsed);
    if (result.success) return result.data;
    return {};
  } catch {
    return {};
  }
}

function parseOptionalPositiveNumber(value: unknown): number | undefined {
  const result = optionalPositiveNumberSchema.safeParse(value);
  if (!result.success) return undefined;
  return result.data;
}

function parseAllowedDataTable(value: unknown): AllowedDataTable {
  return allowedDataTableSchema.parse(value);
}

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
            conversationId: args.conversationId,
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
      toolsEnabled: Boolean(hasToolAccess),
    });

    await ctx.runMutation(internal.chat.saveSystemPrompt, {
      conversationId: args.conversationId,
      systemPrompt,
    });

    if (!hasToolAccess || !vault || !user?.githubAccessToken) {
      // No tools — run graph without tool context (tools won't be bound)
      const result = await runAgentGraph({
        ctx,
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
      conversationId: args.conversationId,
    };

    const result = await runAgentGraph({
      ctx,
      toolCtx,
      systemPrompt,
      messages,
      model: MODEL,
    });

    if (result.prodReadProposal) {
      await ctx.runMutation(internal.chat.saveAssistantMessage, {
        conversationId: args.conversationId,
        content:
          result.prodReadProposal.summary ??
          "I need your approval before running this production read.",
        model: MODEL,
        metadata: JSON.stringify({
          type: "prod_read_proposal",
          requestId: result.prodReadProposal.requestId,
          scope: result.prodReadProposal.scope,
          provider: result.prodReadProposal.provider,
          resourceKind: result.prodReadProposal.resourceKind,
          toolName: result.prodReadProposal.toolName,
          paramsPreview: result.prodReadProposal.paramsPreview,
          status: "proposed",
          tools: result.toolActivity,
        }),
      });
    } else if (result.commitProposal) {
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

export const executeApprovedProdRead = internalAction({
  args: {
    requestId: v.id("aiProdAccessRequests"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.runQuery(
      internal.chat.getProdAccessRequestInternal,
      {
        requestId: args.requestId,
      },
    );
    if (!request) {
      return null;
    }
    if (request.status !== "approved") {
      return null;
    }

    const argumentHash = hashText(request.paramsJson);
    const auditActorUserId = request.approvedBy ?? request.requesterUserId;
    const fallbackEndpoint = `${request.provider}:${request.resourceKind}`;

    const now = Date.now();
    if (request.expiresAt && now > request.expiresAt) {
      const error = "Request approval expired before execution";
      await ctx.runMutation(internal.chat.setProdAccessRequestStatusInternal, {
        requestId: request._id,
        status: "expired",
        error,
        approvedBy: request.approvedBy,
        approvedAt: request.approvedAt,
      });
      await ctx.runMutation(internal.chat.addProdAccessAuditInternal, {
        requestId: request._id,
        actorUserId: auditActorUserId,
        action: "expired",
        toolName: request.toolName,
        endpoint: fallbackEndpoint,
        argumentHash,
        error,
      });
      await ctx.runMutation(
        internal.chat.updateProdReadProposalMessageStatusInternal,
        {
          conversationId: request.conversationId,
          requestId: request._id,
          status: "expired",
          error,
        },
      );
      await ctx.runMutation(internal.chat.saveAssistantMessage, {
        conversationId: request.conversationId,
        content: `Production read expired before execution: ${error}.`,
        model: MODEL,
        metadata: JSON.stringify({
          type: "prod_read_result",
          requestId: request._id,
          provider: request.provider,
          resourceKind: request.resourceKind,
          endpoint: fallbackEndpoint,
          error,
        }),
      });
      return null;
    }

    const params = parseJsonObject(request.paramsJson);

    try {
      let executionResult:
        | {
            summary: string;
            endpoint: string;
            raw: string;
            rowCount?: number;
            logLineCount?: number;
          }
        | undefined;

      if (
        request.provider === "convex" &&
        request.resourceKind === "deployment_status"
      ) {
        if (!request.vaultId) {
          throw new Error(
            "Vault context is required for Convex deployment status",
          );
        }
        executionResult = await ctx.runAction(
          internal.infraRead.getConvexDeploymentStatus,
          {
            vaultId: request.vaultId,
          },
        );
      } else if (
        request.provider === "convex" &&
        request.resourceKind === "logs"
      ) {
        if (!request.vaultId) {
          throw new Error("Vault context is required for Convex logs");
        }
        executionResult = await ctx.runAction(
          internal.infraRead.getConvexLogs,
          {
            vaultId: request.vaultId,
            maxLines: parseOptionalPositiveNumber(params["maxLines"]),
          },
        );
      } else if (
        request.provider === "netlify" &&
        request.resourceKind === "deployment_status"
      ) {
        if (!request.vaultId) {
          throw new Error("Vault context is required for Netlify site status");
        }
        executionResult = await ctx.runAction(
          internal.infraRead.getNetlifySiteStatus,
          {
            vaultId: request.vaultId,
          },
        );
      } else if (
        request.provider === "netlify" &&
        request.resourceKind === "logs"
      ) {
        if (!request.vaultId) {
          throw new Error("Vault context is required for Netlify logs");
        }
        executionResult = await ctx.runAction(
          internal.infraRead.getNetlifyLogs,
          {
            vaultId: request.vaultId,
            maxEntries: parseOptionalPositiveNumber(params["maxEntries"]),
          },
        );
      } else if (
        request.provider === "convex" &&
        request.resourceKind === "data_query"
      ) {
        executionResult = await ctx.runAction(
          internal.infraRead.getConvexDataQuery,
          {
            table: parseAllowedDataTable(params["table"]),
            limit: parseOptionalPositiveNumber(params["limit"]),
            vaultId:
              request.scope === "vault"
                ? request.vaultId ?? undefined
                : undefined,
          },
        );
      } else if (
        request.provider === "convex" &&
        request.resourceKind === "project_inventory"
      ) {
        executionResult = await ctx.runAction(
          internal.infraRead.getConvexProjectInventory,
          {
            limit: parseOptionalPositiveNumber(params["limit"]),
            userId: request.requesterUserId,
          },
        );
      } else if (
        request.provider === "netlify" &&
        request.resourceKind === "site_inventory"
      ) {
        executionResult = await ctx.runAction(
          internal.infraRead.getNetlifySiteInventory,
          {
            limit: parseOptionalPositiveNumber(params["limit"]),
            userId: request.requesterUserId,
          },
        );
      }

      if (!executionResult) {
        throw new Error(
          `Unsupported production read combination: ${request.provider}/${request.resourceKind}`,
        );
      }

      const redacted = applyRedaction({
        raw: executionResult.raw,
        requestedLevel: request.redactionLevel,
        mode: getProdAccessMode(),
      });

      await ctx.runMutation(internal.chat.setProdAccessRequestStatusInternal, {
        requestId: request._id,
        status: "executed",
        error: undefined,
        approvedBy: request.approvedBy,
        approvedAt: request.approvedAt,
        executedAt: Date.now(),
        redactionLevel: redacted.effectiveLevel,
      });
      await ctx.runMutation(internal.chat.addProdAccessAuditInternal, {
        requestId: request._id,
        actorUserId: auditActorUserId,
        action: "executed",
        toolName: request.toolName,
        endpoint: executionResult.endpoint,
        argumentHash,
        rowCount: executionResult.rowCount,
        logLineCount: executionResult.logLineCount,
        error: undefined,
      });
      await ctx.runMutation(
        internal.chat.updateProdReadProposalMessageStatusInternal,
        {
          conversationId: request.conversationId,
          requestId: request._id,
          status: "executed",
        },
      );

      const output = [
        `Production read complete: ${executionResult.summary}.`,
        `Endpoint: \`${executionResult.endpoint}\``,
        "",
        redacted.output,
      ].join("\n");

      await ctx.runMutation(internal.chat.saveAssistantMessage, {
        conversationId: request.conversationId,
        content: output,
        model: MODEL,
        metadata: JSON.stringify({
          type: "prod_read_result",
          requestId: request._id,
          provider: request.provider,
          resourceKind: request.resourceKind,
          endpoint: executionResult.endpoint,
          redactionLevel: redacted.effectiveLevel,
          rowCount: executionResult.rowCount,
          logLineCount: executionResult.logLineCount,
        }),
      });

      return null;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown production read error";

      await ctx.runMutation(internal.chat.setProdAccessRequestStatusInternal, {
        requestId: request._id,
        status: "failed",
        error: message,
        approvedBy: request.approvedBy,
        approvedAt: request.approvedAt,
        executedAt: Date.now(),
      });
      await ctx.runMutation(internal.chat.addProdAccessAuditInternal, {
        requestId: request._id,
        actorUserId: auditActorUserId,
        action: "failed",
        toolName: request.toolName,
        endpoint: fallbackEndpoint,
        argumentHash,
        error: message,
      });
      await ctx.runMutation(
        internal.chat.updateProdReadProposalMessageStatusInternal,
        {
          conversationId: request.conversationId,
          requestId: request._id,
          status: "failed",
          error: message,
        },
      );
      await ctx.runMutation(internal.chat.saveAssistantMessage, {
        conversationId: request.conversationId,
        content: `Production read failed: ${message}.`,
        model: MODEL,
        metadata: JSON.stringify({
          type: "prod_read_result",
          requestId: request._id,
          provider: request.provider,
          resourceKind: request.resourceKind,
          endpoint: fallbackEndpoint,
          error: message,
        }),
      });
      return null;
    }
  },
});
