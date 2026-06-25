"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { z } from "zod";
import { buildSystemPrompt } from "../agent/systemPrompt";
import { runAgentGraph } from "../agent/graph";
import { applyRedaction, getProdAccessMode } from "../infraReadPolicy";
import { saveMessage } from "@convex-dev/agent";
import { buildProdReadResultPayload } from "./metadata";
import { isLiveConnectedVault, type ConnectedVault } from "../vault/state";

const MODEL = "claude-sonnet-4-20250514";

const allowedDataTableSchema = z.enum([
  "vaults",
  "vaultConvexDeployments",
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

function parseOptionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseAllowedDataTable(value: unknown): AllowedDataTable {
  return allowedDataTableSchema.parse(value);
}

export const generateResponse = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const threadContext = await ctx.runQuery(internal.chat.index.getThreadContextForAction, {
      threadId: args.threadId,
    });
    if (!threadContext) {
      throw new Error("Thread not found");
    }

    // Load vault context if available
    let vault: ConnectedVault | null = null;
    if (threadContext.vaultId) {
      const v = await ctx.runQuery(internal.vault.records.getById, {
        id: threadContext.vaultId,
      });
      if (isLiveConnectedVault(v)) {
        vault = v;
      }
    }

    // Gather context for the system prompt
    let repoTree: string[] | undefined;

    if (vault) {
      const contextBranch = threadContext.branch || vault.defaultBranch;
      const branchTree = await ctx.runQuery(internal.vault.branches.getVaultBranchTree, {
        vaultId: vault._id,
        branch: contextBranch,
      });
      if (branchTree) {
        repoTree = branchTree.treeData.tree.filter((t) => t.type === "blob").map((t) => t.path);
      }
    }

    const systemPrompt = buildSystemPrompt({
      owner: vault?.owner,
      repo: vault?.name,
      branch: threadContext.branch,
      filePath: threadContext.filePath,
      repoTree,
    });

    await ctx.runMutation(internal.chat.index.saveThreadSystemPrompt, {
      threadId: args.threadId,
      systemPrompt,
    });

    await runAgentGraph({
      ctx,
      systemPrompt,
      threadId: args.threadId,
      promptMessageId: args.promptMessageId,
      model: MODEL,
      userId: threadContext.userId,
    });

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
    const request = await ctx.runQuery(internal.chat.index.getProdAccessRequestInternal, {
      requestId: args.requestId,
    });
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
      await ctx.runMutation(internal.chat.index.setProdAccessRequestStatusInternal, {
        requestId: request._id,
        status: "expired",
        error,
        approvedBy: request.approvedBy,
        approvedAt: request.approvedAt,
      });
      await ctx.runMutation(internal.chat.index.addProdAccessAuditInternal, {
        requestId: request._id,
        actorUserId: auditActorUserId,
        action: "expired",
        toolName: request.toolName,
        endpoint: fallbackEndpoint,
        argumentHash,
        error,
      });
      await ctx.runMutation(internal.chat.index.updateProdReadProposalMessageStatusInternal, {
        messageId: args.proposalMessageId,
        status: "expired",
        error,
      });

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

      if (request.provider === "convex" && request.resourceKind === "deployment_status") {
        if (!request.vaultId) {
          throw new Error("Vault context is required for Convex deployment status");
        }
        executionResult = await ctx.runAction(internal.infraRead.getConvexDeploymentStatus, {
          vaultId: request.vaultId,
        });
      } else if (request.provider === "convex" && request.resourceKind === "logs") {
        if (!request.vaultId) {
          throw new Error("Vault context is required for Convex logs");
        }
        executionResult = await ctx.runAction(internal.infraRead.getConvexLogs, {
          vaultId: request.vaultId,
          maxLines: parseOptionalPositiveNumber(params["maxLines"]),
        });
      } else if (
        request.provider === "cloudflare" &&
        request.resourceKind === "deployment_status"
      ) {
        if (!request.vaultId) {
          throw new Error("Vault context is required for Cloudflare Worker status");
        }
        executionResult = await ctx.runAction(internal.infraRead.getCloudflareWorkerStatus, {
          vaultId: request.vaultId,
        });
      } else if (request.provider === "cloudflare" && request.resourceKind === "logs") {
        if (!request.vaultId) {
          throw new Error("Vault context is required for Cloudflare logs");
        }
        executionResult = await ctx.runAction(internal.infraRead.getCloudflareLogs, {
          vaultId: request.vaultId,
          maxEntries: parseOptionalPositiveNumber(params["maxEntries"]),
        });
      } else if (request.provider === "convex" && request.resourceKind === "data_query") {
        executionResult = await ctx.runAction(internal.infraRead.getConvexDataQuery, {
          table: parseAllowedDataTable(params["table"]),
          limit: parseOptionalPositiveNumber(params["limit"]),
          vaultId: request.scope === "vault" ? (request.vaultId ?? undefined) : undefined,
        });
      } else if (request.provider === "convex" && request.resourceKind === "project_inventory") {
        executionResult = await ctx.runAction(internal.infraRead.getConvexProjectInventory, {
          limit: parseOptionalPositiveNumber(params["limit"]),
          userId: request.requesterUserId,
        });
      } else if (
        request.provider === "cloudflare" &&
        request.resourceKind === "account_inventory"
      ) {
        executionResult = await ctx.runAction(internal.infraRead.getCloudflareAccountInventory, {
          limit: parseOptionalPositiveNumber(params["limit"]),
          userId: request.requesterUserId,
        });
      } else if (
        request.provider === "cloudflare" &&
        request.resourceKind === "workers_inventory"
      ) {
        const accountId = parseOptionalNonEmptyString(params["accountId"]);
        if (!accountId) {
          throw new Error("Cloudflare accountId is required to list Workers.");
        }
        executionResult = await ctx.runAction(internal.infraRead.getCloudflareWorkersInventory, {
          limit: parseOptionalPositiveNumber(params["limit"]),
          userId: request.requesterUserId,
          accountId,
        });
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

      await ctx.runMutation(internal.chat.index.setProdAccessRequestStatusInternal, {
        requestId: request._id,
        status: "executed",
        error: undefined,
        approvedBy: request.approvedBy,
        approvedAt: request.approvedAt,
        executedAt: Date.now(),
        redactionLevel: redacted.effectiveLevel,
      });
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
      await ctx.runMutation(internal.chat.index.updateProdReadProposalMessageStatusInternal, {
        messageId: args.proposalMessageId,
        status: "executed",
      });

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
      const message = error instanceof Error ? error.message : "Unknown production read error";

      await ctx.runMutation(internal.chat.index.setProdAccessRequestStatusInternal, {
        requestId: request._id,
        status: "failed",
        error: message,
        approvedBy: request.approvedBy,
        approvedAt: request.approvedAt,
        executedAt: Date.now(),
      });
      await ctx.runMutation(internal.chat.index.addProdAccessAuditInternal, {
        requestId: request._id,
        actorUserId: auditActorUserId,
        action: "failed",
        toolName: request.toolName,
        endpoint: fallbackEndpoint,
        argumentHash,
        error: message,
      });
      await ctx.runMutation(internal.chat.index.updateProdReadProposalMessageStatusInternal, {
        messageId: args.proposalMessageId,
        status: "failed",
        error: message,
      });
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
