"use node";

import { internalAction } from "../_generated/server";
import { v, Infer } from "convex/values";
import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { z } from "zod";
import { GithubTreeData } from "../schema";
import { executeReadFile } from "../agent/tools";
import type { ToolContext } from "../agent/tools";
import { buildSystemPrompt } from "../agent/systemPrompt";
import { runAgentGraph } from "../agent/graph";
import { applyRedaction, getProdAccessMode } from "../infraReadPolicy";
import type { MessageDoc } from "@convex-dev/agent/validators";
import { saveMessage } from "@convex-dev/agent";
import {
  buildCommitProposalPayload,
  buildProdReadProposalPayload,
  buildProdReadResultPayload,
  buildToolActivityPayload,
} from "./metadata";

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

function selectAssistantMessageId(
  messages: MessageDoc[] | undefined,
): string | undefined {
  if (!messages) return undefined;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg.tool && msg.message?.role === "assistant") {
      return msg._id;
    }
  }
  return undefined;
}

export const generateResponse = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const threadContext = await ctx.runQuery(
      internal.chat.index.getThreadContextForAction,
      { threadId: args.threadId },
    );
    if (!threadContext) {
      throw new Error("Thread not found");
    }

    // Load vault context if available
    let vault: {
      _id: Id<"vaults">;
      ghRepoOwner: string;
      ghRepoName: string;
      userId: Id<"users">;
      treeData: Infer<typeof GithubTreeData>;
    } | null = null;
    let githubAccessToken: string | null = null;

    if (threadContext.vaultId) {
      const v = await ctx.runQuery(internal.vault.getById, {
        id: threadContext.vaultId,
      });
      if (v) {
        vault = v;
        const githubConnection = await ctx.runQuery(
          internal.providerConnections.getByUserAndKind,
          {
            userId: v.userId,
            kind: "github",
          },
        );
        if (githubConnection?.kind === "github") {
          githubAccessToken = githubConnection.auth.credential;
        }
      }
    }

    const hasToolAccess = Boolean(vault && githubAccessToken);

    // Gather context for the system prompt
    let fileContent: string | undefined;
    let repoTree: string[] | undefined;

    if (vault) {
      repoTree = vault.treeData.tree
        .filter((t) => t.type === "blob")
        .map((t) => t.path);
    }

    if (threadContext.filePath && vault && githubAccessToken) {
      try {
        fileContent = await executeReadFile(
          {
            ctx,
            threadId: args.threadId,
            vaultId: vault._id,
            owner: vault.ghRepoOwner,
            repo: vault.ghRepoName,
            userId: vault.userId,
            accessToken: githubAccessToken,
          },
          { path: threadContext.filePath },
        );
      } catch {
        // File content is optional context — don't fail the request
      }
    }

    const systemPrompt = buildSystemPrompt({
      owner: vault?.ghRepoOwner,
      repo: vault?.ghRepoName,
      branch: threadContext.branch,
      filePath: threadContext.filePath,
      fileContent,
      repoTree,
      toolsEnabled: Boolean(hasToolAccess),
    });

    await ctx.runMutation(internal.chat.index.saveThreadSystemPrompt, {
      threadId: args.threadId,
      systemPrompt,
    });

    const toolCtx: ToolContext | undefined =
      hasToolAccess && vault && githubAccessToken
        ? {
            ctx,
            threadId: args.threadId,
            vaultId: vault._id,
            owner: vault.ghRepoOwner,
            repo: vault.ghRepoName,
            userId: vault.userId,
            accessToken: githubAccessToken,
          }
        : undefined;

    const result = await runAgentGraph({
      ctx,
      toolCtx,
      systemPrompt,
      threadId: args.threadId,
      promptMessageId: args.promptMessageId,
      model: MODEL,
      userId: threadContext.userId,
    });

    const assistantMessageId = selectAssistantMessageId(result.savedMessages);
    if (!assistantMessageId) {
      return null;
    }

    if (result.prodReadProposal) {
      const summary = result.prodReadProposal.summary;
      await ctx.runMutation(components.agent.messages.updateMessage, {
        messageId: assistantMessageId,
        patch: {
          message: { role: "assistant", content: summary },
        },
      });

      const payload = buildProdReadProposalPayload(
        {
          ...result.prodReadProposal,
          status: "proposed",
        },
        result.toolActivity.length > 0 ? result.toolActivity : undefined,
      );

      await ctx.runMutation(internal.chat.index.saveMessageMetadataInternal, {
        messageId: assistantMessageId,
        threadId: args.threadId,
        type: payload.type,
        payloadJson: JSON.stringify(payload),
      });
      return null;
    }

    if (result.commitProposal) {
      const summary = `I've prepared the changes and propose committing them with the message: "${result.commitProposal}"`;
      await ctx.runMutation(components.agent.messages.updateMessage, {
        messageId: assistantMessageId,
        patch: {
          message: { role: "assistant", content: summary },
        },
      });

      const payload = buildCommitProposalPayload({
        message: result.commitProposal,
        tools: result.toolActivity.length > 0 ? result.toolActivity : undefined,
      });

      await ctx.runMutation(internal.chat.index.saveMessageMetadataInternal, {
        messageId: assistantMessageId,
        threadId: args.threadId,
        type: payload.type,
        payloadJson: JSON.stringify(payload),
      });
      return null;
    }

    if (result.toolActivity.length > 0) {
      const payload = buildToolActivityPayload(result.toolActivity);
      await ctx.runMutation(internal.chat.index.saveMessageMetadataInternal, {
        messageId: assistantMessageId,
        threadId: args.threadId,
        type: payload.type,
        payloadJson: JSON.stringify(payload),
      });
    }

    return null;
  },
});

export const executeApprovedProdRead = internalAction({
  args: {
    requestId: v.id("aiProdAccessRequests"),
    proposalMessageId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.runQuery(
      internal.chat.index.getProdAccessRequestInternal,
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
      await ctx.runMutation(
        internal.chat.index.setProdAccessRequestStatusInternal,
        {
          requestId: request._id,
          status: "expired",
          error,
          approvedBy: request.approvedBy,
          approvedAt: request.approvedAt,
        },
      );
      await ctx.runMutation(internal.chat.index.addProdAccessAuditInternal, {
        requestId: request._id,
        actorUserId: auditActorUserId,
        action: "expired",
        toolName: request.toolName,
        endpoint: fallbackEndpoint,
        argumentHash,
        error,
      });
      await ctx.runMutation(
        internal.chat.index.updateProdReadProposalMessageStatusInternal,
        {
          messageId: args.proposalMessageId,
          status: "expired",
          error,
        },
      );

      const expiredMessage = `Production read expired before execution: ${error}.`;
      const { messageId } = await saveMessage(ctx, components.agent, {
        threadId: request.threadId,
        message: { role: "assistant", content: expiredMessage },
      });
      const payload = buildProdReadResultPayload({
        requestId: request._id,
        provider: request.provider,
        resourceKind: request.resourceKind,
        endpoint: fallbackEndpoint,
        error,
      });
      await ctx.runMutation(internal.chat.index.saveMessageMetadataInternal, {
        messageId,
        threadId: request.threadId,
        type: payload.type,
        payloadJson: JSON.stringify(payload),
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
        request.provider === "railway" &&
        request.resourceKind === "deployment_status"
      ) {
        if (!request.vaultId) {
          throw new Error("Vault context is required for Railway status");
        }
        executionResult = await ctx.runAction(
          internal.infraRead.getRailwaySiteStatus,
          {
            vaultId: request.vaultId,
          },
        );
      } else if (
        request.provider === "railway" &&
        request.resourceKind === "logs"
      ) {
        if (!request.vaultId) {
          throw new Error("Vault context is required for Railway logs");
        }
        executionResult = await ctx.runAction(
          internal.infraRead.getRailwayLogs,
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
      } else if (
        request.provider === "railway" &&
        request.resourceKind === "site_inventory"
      ) {
        executionResult = await ctx.runAction(
          internal.infraRead.getRailwayProjectInventory,
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

      await ctx.runMutation(
        internal.chat.index.setProdAccessRequestStatusInternal,
        {
          requestId: request._id,
          status: "executed",
          error: undefined,
          approvedBy: request.approvedBy,
          approvedAt: request.approvedAt,
          executedAt: Date.now(),
          redactionLevel: redacted.effectiveLevel,
        },
      );
      await ctx.runMutation(internal.chat.index.addProdAccessAuditInternal, {
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
        internal.chat.index.updateProdReadProposalMessageStatusInternal,
        {
          messageId: args.proposalMessageId,
          status: "executed",
        },
      );

      const output = [
        `Production read complete: ${executionResult.summary}.`,
        `Endpoint: \`${executionResult.endpoint}\``,
        "",
        redacted.output,
      ].join("\n");

      const { messageId } = await saveMessage(ctx, components.agent, {
        threadId: request.threadId,
        message: { role: "assistant", content: output },
      });
      const payload = buildProdReadResultPayload({
        requestId: request._id,
        provider: request.provider,
        resourceKind: request.resourceKind,
        endpoint: executionResult.endpoint,
        redactionLevel: redacted.effectiveLevel,
        rowCount: executionResult.rowCount,
        logLineCount: executionResult.logLineCount,
      });
      await ctx.runMutation(internal.chat.index.saveMessageMetadataInternal, {
        messageId,
        threadId: request.threadId,
        type: payload.type,
        payloadJson: JSON.stringify(payload),
      });

      return null;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown production read error";

      await ctx.runMutation(
        internal.chat.index.setProdAccessRequestStatusInternal,
        {
          requestId: request._id,
          status: "failed",
          error: message,
          approvedBy: request.approvedBy,
          approvedAt: request.approvedAt,
          executedAt: Date.now(),
        },
      );
      await ctx.runMutation(internal.chat.index.addProdAccessAuditInternal, {
        requestId: request._id,
        actorUserId: auditActorUserId,
        action: "failed",
        toolName: request.toolName,
        endpoint: fallbackEndpoint,
        argumentHash,
        error: message,
      });
      await ctx.runMutation(
        internal.chat.index.updateProdReadProposalMessageStatusInternal,
        {
          messageId: args.proposalMessageId,
          status: "failed",
          error: message,
        },
      );
      const failedMessage = `Production read failed: ${message}.`;
      const { messageId } = await saveMessage(ctx, components.agent, {
        threadId: request.threadId,
        message: { role: "assistant", content: failedMessage },
      });
      const payload = buildProdReadResultPayload({
        requestId: request._id,
        provider: request.provider,
        resourceKind: request.resourceKind,
        endpoint: fallbackEndpoint,
        error: message,
      });
      await ctx.runMutation(internal.chat.index.saveMessageMetadataInternal, {
        messageId,
        threadId: request.threadId,
        type: payload.type,
        payloadJson: JSON.stringify(payload),
      });
      return null;
    }
  },
});
