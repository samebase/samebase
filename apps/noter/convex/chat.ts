import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { z } from "zod";
import { components, internal } from "./_generated/api";
import { getUserId } from "./common";
import { isAdminUser } from "./users";
import {
  listMessages,
  saveMessage,
  syncStreams,
  toUIMessages,
  type UIMessage,
} from "@convex-dev/agent";
import { vStreamArgs } from "@convex-dev/agent/validators";
import type { Id } from "./_generated/dataModel";
import type { MessageDoc } from "@convex-dev/agent/validators";
import {
  ProdAccessAuditAction,
  ProdAccessProvider,
  ProdAccessRedactionLevel,
  ProdAccessResourceKind,
  ProdAccessScope,
  ProdAccessStatus,
} from "./schema";

const { string, optional, object, union, literal, number, id, boolean } = v;

function hashText(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash >>> 0).toString(16);
}

const toolActivityItemSchema = z.object({
  tool: z.string(),
  input: z.unknown(),
});

type ToolActivityItem = z.infer<typeof toolActivityItemSchema>;

type ToolActivityPayload = {
  type: "tool_activity";
  tools: ToolActivityItem[];
};

type CommitProposalPayload = {
  type: "commit_proposal";
  message: string;
  committed?: boolean;
  tools?: ToolActivityItem[];
};

type ProdReadProposalPayload = {
  type: "prod_read_proposal";
  requestId: string;
  scope: "vault" | "global";
  provider: "convex" | "netlify";
  resourceKind:
    | "deployment_status"
    | "logs"
    | "data_query"
    | "project_inventory"
    | "site_inventory";
  toolName: string;
  paramsPreview: string;
  summary: string;
  status?:
    | "proposed"
    | "approved"
    | "rejected"
    | "executed"
    | "failed"
    | "expired";
  error?: string;
  tools?: ToolActivityItem[];
};

type ProdReadResultPayload = {
  type: "prod_read_result";
  requestId: string;
  provider: "convex" | "netlify";
  resourceKind:
    | "deployment_status"
    | "logs"
    | "data_query"
    | "project_inventory"
    | "site_inventory";
  endpoint?: string;
  redactionLevel?: "default" | "strict" | "raw_fallback";
  rowCount?: number;
  logLineCount?: number;
  error?: string;
};

type MessageMetadata =
  | ToolActivityPayload
  | CommitProposalPayload
  | ProdReadProposalPayload
  | ProdReadResultPayload;

const metadataTypeSchema = z.object({
  type: z.string(),
});

const commitProposalPayloadSchema = z
  .object({
    type: z.literal("commit_proposal"),
    message: z.string(),
    committed: z.boolean().optional(),
    tools: z.array(toolActivityItemSchema).optional(),
  })
  .catchall(z.unknown());

const prodReadProposalPayloadSchema = z
  .object({
    type: z.literal("prod_read_proposal"),
    requestId: z.string(),
    scope: z.enum(["vault", "global"]),
    provider: z.enum(["convex", "netlify"]),
    resourceKind: z.enum([
      "deployment_status",
      "logs",
      "data_query",
      "project_inventory",
      "site_inventory",
    ]),
    toolName: z.string(),
    paramsPreview: z.string(),
    summary: z.string(),
    status: z
      .enum([
        "proposed",
        "approved",
        "rejected",
        "executed",
        "failed",
        "expired",
      ])
      .optional(),
    error: z.string().optional(),
    tools: z.array(toolActivityItemSchema).optional(),
  })
  .catchall(z.unknown());

const toolActivityPayloadSchema = z
  .object({
    type: z.literal("tool_activity"),
    tools: z.array(toolActivityItemSchema),
  })
  .catchall(z.unknown());

const prodReadResultPayloadSchema = z
  .object({
    type: z.literal("prod_read_result"),
    requestId: z.string(),
    provider: z.enum(["convex", "netlify"]),
    resourceKind: z.enum([
      "deployment_status",
      "logs",
      "data_query",
      "project_inventory",
      "site_inventory",
    ]),
    endpoint: z.string().optional(),
    redactionLevel: z.enum(["default", "strict", "raw_fallback"]).optional(),
    rowCount: z.number().optional(),
    logLineCount: z.number().optional(),
    error: z.string().optional(),
  })
  .catchall(z.unknown());

function parseMetadataPayload(payloadJson: string): MessageMetadata | null {
  try {
    const parsed = JSON.parse(payloadJson);
    const typeResult = metadataTypeSchema.safeParse(parsed);
    if (!typeResult.success) return null;
    if (parsed.type === "commit_proposal") {
      const result = commitProposalPayloadSchema.safeParse(parsed);
      return result.success ? result.data : null;
    }
    if (parsed.type === "prod_read_proposal") {
      const result = prodReadProposalPayloadSchema.safeParse(parsed);
      return result.success ? result.data : null;
    }
    if (parsed.type === "tool_activity") {
      const result = toolActivityPayloadSchema.safeParse(parsed);
      return result.success ? result.data : null;
    }
    if (parsed.type === "prod_read_result") {
      const result = prodReadResultPayloadSchema.safeParse(parsed);
      return result.success ? result.data : null;
    }
    return null;
  } catch {
    return null;
  }
}

function parseCommitPayload(payloadJson: string): CommitProposalPayload | null {
  const parsed = parseMetadataPayload(payloadJson);
  return parsed?.type === "commit_proposal" ? parsed : null;
}

function parseProdReadProposalPayload(
  payloadJson: string,
): ProdReadProposalPayload | null {
  const parsed = parseMetadataPayload(payloadJson);
  return parsed?.type === "prod_read_proposal" ? parsed : null;
}

function ensureThreadAccess<T extends { userId: Id<"users"> }>(
  ctxUserId: Id<"users">,
  threadContext: T | null,
): asserts threadContext is T {
  if (!threadContext || threadContext.userId !== ctxUserId) {
    throw new Error("Thread not found");
  }
}

export const createThread = mutation({
  args: {
    vaultId: optional(id("vaults")),
    repositoryFullName: optional(string()),
    branch: optional(string()),
    filePath: optional(string()),
  },
  returns: string(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    if (args.vaultId) {
      const existing = await ctx.db
        .query("agentThreadContext")
        .withIndex("by_userId_and_vaultId", (q) =>
          q.eq("userId", userId).eq("vaultId", args.vaultId),
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          repositoryFullName:
            args.repositoryFullName ?? existing.repositoryFullName,
          branch: args.branch ?? existing.branch,
          filePath: args.filePath ?? existing.filePath,
        });
        return existing.threadId;
      }
    }

    const thread = await ctx.runMutation(
      components.agent.threads.createThread,
      {
        userId,
      },
    );

    await ctx.db.insert("agentThreadContext", {
      threadId: thread._id,
      userId,
      vaultId: args.vaultId,
      repositoryFullName: args.repositoryFullName,
      branch: args.branch,
      filePath: args.filePath,
      systemPrompt: undefined,
      createdAt: Date.now(),
    });

    return thread._id;
  },
});

export const getThreadForVault = query({
  args: { vaultId: id("vaults") },
  returns: union(
    object({
      threadId: string(),
      systemPrompt: optional(string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const thread = await ctx.db
      .query("agentThreadContext")
      .withIndex("by_userId_and_vaultId", (q) =>
        q.eq("userId", userId).eq("vaultId", args.vaultId),
      )
      .first();
    if (!thread) return null;
    return { threadId: thread.threadId, systemPrompt: thread.systemPrompt };
  },
});

export const getThreadContext = query({
  args: { threadId: string() },
  returns: union(
    object({
      threadId: string(),
      systemPrompt: optional(string()),
      vaultId: optional(id("vaults")),
      repositoryFullName: optional(string()),
      branch: optional(string()),
      filePath: optional(string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const thread = await ctx.db
      .query("agentThreadContext")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();
    ensureThreadAccess(userId, thread);
    return {
      threadId: thread.threadId,
      systemPrompt: thread.systemPrompt,
      vaultId: thread.vaultId,
      repositoryFullName: thread.repositoryFullName,
      branch: thread.branch,
      filePath: thread.filePath,
    };
  },
});

export const deleteThread = mutation({
  args: { threadId: string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const thread = await ctx.db
      .query("agentThreadContext")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();
    ensureThreadAccess(userId, thread);

    await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
      threadId: args.threadId,
    });

    const metadata = await ctx.db
      .query("chatMessageMetadata")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .collect();
    for (const row of metadata) {
      await ctx.db.delete(row._id);
    }

    if (thread) {
      await ctx.db.delete(thread._id);
    }

    return null;
  },
});

export const sendMessage = mutation({
  args: {
    threadId: string(),
    content: string(),
    vaultId: optional(id("vaults")),
    filePath: optional(string()),
    branch: optional(string()),
  },
  returns: string(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const thread = await ctx.db
      .query("agentThreadContext")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();
    ensureThreadAccess(userId, thread);

    if (thread) {
      await ctx.db.patch(thread._id, {
        vaultId: args.vaultId ?? thread.vaultId,
        filePath: args.filePath ?? thread.filePath,
        branch: args.branch ?? thread.branch,
      });
    }

    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId: args.threadId,
      userId,
      prompt: args.content,
    });

    await ctx.scheduler.runAfter(0, internal.chatActions.generateResponse, {
      threadId: args.threadId,
      promptMessageId: messageId,
    });

    return messageId;
  },
});

export const listThreadMessages = query({
  args: {
    threadId: string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const thread = await ctx.db
      .query("agentThreadContext")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();
    ensureThreadAccess(userId, thread);

    const paginated = await listMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });

    const metadataRows = await ctx.db
      .query("chatMessageMetadata")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .collect();

    const metadataByMessageId = new Map<string, MessageMetadata>();
    for (const row of metadataRows) {
      const parsed = parseMetadataPayload(row.payloadJson);
      if (parsed) {
        metadataByMessageId.set(row.messageId, parsed);
      }
    }

    const messagesWithMetadata = paginated.page.map((msg) => ({
      ...msg,
      metadata: metadataByMessageId.get(msg._id),
    }));

    const uiMessages = toUIMessages(messagesWithMetadata).map((msg) => ({
      ...msg,
      metadata: metadataByMessageId.get(msg.id),
    }));
    const streams = await syncStreams(ctx, components.agent, {
      threadId: args.threadId,
      streamArgs: args.streamArgs,
    });

    return { ...paginated, page: uiMessages, streams } satisfies {
      page: UIMessage[];
      isDone: boolean;
      continueCursor: string | null;
      streams: typeof streams | undefined;
    };
  },
});

export const proposeProdRead = mutation({
  args: {
    threadId: string(),
    vaultId: optional(id("vaults")),
    scope: ProdAccessScope,
    provider: ProdAccessProvider,
    resourceKind: ProdAccessResourceKind,
    toolName: string(),
    paramsJson: string(),
    allowRawFallback: optional(boolean()),
  },
  returns: object({
    requestId: id("aiProdAccessRequests"),
  }),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const thread = await ctx.db
      .query("agentThreadContext")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();
    ensureThreadAccess(userId, thread);

    const user = await ctx.db.get(userId);
    if (!user || !isAdminUser(user.githubUsername)) {
      throw new Error("Only admin users can request production reads");
    }

    if (args.scope === "vault") {
      if (!args.vaultId) {
        throw new Error(
          "vaultId is required for vault-scoped production reads",
        );
      }
      const vault = await ctx.db.get(args.vaultId);
      if (!vault || vault.userId !== userId) {
        throw new Error("Vault not found");
      }
    }

    const redactionLevel = args.allowRawFallback ? "raw_fallback" : "default";
    const now = Date.now();
    const requestId = await ctx.db.insert("aiProdAccessRequests", {
      threadId: args.threadId,
      requesterUserId: userId,
      vaultId: args.vaultId,
      scope: args.scope,
      provider: args.provider,
      resourceKind: args.resourceKind,
      toolName: args.toolName,
      paramsJson: args.paramsJson,
      status: "proposed",
      redactionLevel,
      approvedBy: undefined,
      approvedAt: undefined,
      executedAt: undefined,
      expiresAt: now + 10 * 60 * 1000,
      error: undefined,
    });

    await ctx.db.insert("aiProdAccessAudit", {
      requestId,
      actorUserId: userId,
      action: "proposed",
      toolName: args.toolName,
      endpoint: `${args.provider}:${args.resourceKind}`,
      argumentHash: hashText(args.paramsJson),
      rowCount: undefined,
      logLineCount: undefined,
      createdAt: now,
      error: undefined,
    });

    return { requestId };
  },
});

export const proposeProdReadInternal = internalMutation({
  args: {
    threadId: string(),
    requesterUserId: id("users"),
    vaultId: optional(id("vaults")),
    scope: ProdAccessScope,
    provider: ProdAccessProvider,
    resourceKind: ProdAccessResourceKind,
    toolName: string(),
    paramsJson: string(),
    allowRawFallback: optional(boolean()),
  },
  returns: object({
    requestId: id("aiProdAccessRequests"),
  }),
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("agentThreadContext")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();
    ensureThreadAccess(args.requesterUserId, thread);

    const user = await ctx.db.get(args.requesterUserId);
    if (!user || !isAdminUser(user.githubUsername)) {
      throw new Error("Only admin users can request production reads");
    }

    if (args.scope === "vault") {
      if (!args.vaultId) {
        throw new Error(
          "vaultId is required for vault-scoped production reads",
        );
      }
      const vault = await ctx.db.get(args.vaultId);
      if (!vault || vault.userId !== args.requesterUserId) {
        throw new Error("Vault not found");
      }
    }

    const redactionLevel = args.allowRawFallback ? "raw_fallback" : "default";
    const now = Date.now();
    const requestId = await ctx.db.insert("aiProdAccessRequests", {
      threadId: args.threadId,
      requesterUserId: args.requesterUserId,
      vaultId: args.vaultId,
      scope: args.scope,
      provider: args.provider,
      resourceKind: args.resourceKind,
      toolName: args.toolName,
      paramsJson: args.paramsJson,
      status: "proposed",
      redactionLevel,
      approvedBy: undefined,
      approvedAt: undefined,
      executedAt: undefined,
      expiresAt: now + 10 * 60 * 1000,
      error: undefined,
    });

    await ctx.db.insert("aiProdAccessAudit", {
      requestId,
      actorUserId: args.requesterUserId,
      action: "proposed",
      toolName: args.toolName,
      endpoint: `${args.provider}:${args.resourceKind}`,
      argumentHash: hashText(args.paramsJson),
      rowCount: undefined,
      logLineCount: undefined,
      createdAt: now,
      error: undefined,
    });

    return { requestId };
  },
});

export const rejectProdRead = mutation({
  args: {
    requestId: id("aiProdAccessRequests"),
    threadId: string(),
    messageId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const thread = await ctx.db
      .query("agentThreadContext")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();
    ensureThreadAccess(userId, thread);

    const request = await ctx.db.get(args.requestId);
    if (!request || request.threadId !== args.threadId) {
      throw new Error("Request not found");
    }

    const user = await ctx.db.get(userId);
    if (!user || !isAdminUser(user.githubUsername)) {
      throw new Error("Only admin users can reject production reads");
    }

    if (request.status !== "proposed" && request.status !== "approved") {
      return null;
    }

    await ctx.db.patch(args.requestId, {
      status: "rejected",
      error: "Rejected by user",
    });

    await ctx.db.insert("aiProdAccessAudit", {
      requestId: args.requestId,
      actorUserId: userId,
      action: "rejected",
      toolName: request.toolName,
      endpoint: `${request.provider}:${request.resourceKind}`,
      argumentHash: hashText(request.paramsJson),
      rowCount: undefined,
      logLineCount: undefined,
      createdAt: Date.now(),
      error: "Rejected by user",
    });

    await ctx.runMutation(
      internal.chat.updateProdReadProposalMessageStatusInternal,
      {
        messageId: args.messageId,
        status: "rejected",
        error: "Rejected by user",
      },
    );

    return null;
  },
});

export const confirmProdRead = mutation({
  args: {
    requestId: id("aiProdAccessRequests"),
    threadId: string(),
    messageId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const thread = await ctx.db
      .query("agentThreadContext")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();
    ensureThreadAccess(userId, thread);

    const user = await ctx.db.get(userId);
    if (!user || !isAdminUser(user.githubUsername)) {
      throw new Error("Only admin users can approve production reads");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request || request.threadId !== args.threadId) {
      throw new Error("Request not found");
    }

    if (request.status === "executed") {
      return null;
    }

    if (request.status !== "proposed") {
      throw new Error(`Request is not approvable (status: ${request.status})`);
    }

    const now = Date.now();
    if (request.expiresAt && now > request.expiresAt) {
      await ctx.db.patch(args.requestId, {
        status: "expired",
        error: "Request approval expired",
      });

      await ctx.db.insert("aiProdAccessAudit", {
        requestId: args.requestId,
        actorUserId: userId,
        action: "expired",
        toolName: request.toolName,
        endpoint: `${request.provider}:${request.resourceKind}`,
        argumentHash: hashText(request.paramsJson),
        rowCount: undefined,
        logLineCount: undefined,
        createdAt: now,
        error: "Request approval expired",
      });

      await ctx.runMutation(
        internal.chat.updateProdReadProposalMessageStatusInternal,
        {
          messageId: args.messageId,
          status: "expired",
          error: "Request approval expired",
        },
      );
      return null;
    }

    await ctx.db.patch(args.requestId, {
      status: "approved",
      approvedBy: userId,
      approvedAt: now,
      error: undefined,
    });

    await ctx.db.insert("aiProdAccessAudit", {
      requestId: args.requestId,
      actorUserId: userId,
      action: "approved",
      toolName: request.toolName,
      endpoint: `${request.provider}:${request.resourceKind}`,
      argumentHash: hashText(request.paramsJson),
      rowCount: undefined,
      logLineCount: undefined,
      createdAt: now,
      error: undefined,
    });

    await ctx.runMutation(
      internal.chat.updateProdReadProposalMessageStatusInternal,
      {
        messageId: args.messageId,
        status: "approved",
        error: undefined,
      },
    );

    await ctx.scheduler.runAfter(
      0,
      internal.chatActions.executeApprovedProdRead,
      {
        requestId: args.requestId,
        proposalMessageId: args.messageId,
      },
    );

    return null;
  },
});

export const confirmCommit = mutation({
  args: {
    threadId: string(),
    messageId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const thread = await ctx.db
      .query("agentThreadContext")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();
    ensureThreadAccess(userId, thread);
    if (!thread?.vaultId) {
      throw new Error("Thread is not linked to a vault");
    }

    const vault = await ctx.db.get(thread.vaultId);
    if (!vault) {
      throw new Error("Vault not found");
    }

    await ctx.scheduler.runAfter(
      0,
      internal.fileStagingActions.commitAllStaged,
      {
        userId,
        vaultId: vault._id,
        repoOwner: vault.ghRepoOwner,
        repoName: vault.ghRepoName,
      },
    );

    await ctx.runMutation(
      internal.chat.updateCommitProposalMessageCommittedInternal,
      {
        messageId: args.messageId,
        committed: true,
      },
    );

    return null;
  },
});

export const getProdAccessRequestInternal = internalQuery({
  args: {
    requestId: id("aiProdAccessRequests"),
  },
  returns: union(
    object({
      _id: id("aiProdAccessRequests"),
      _creationTime: number(),
      threadId: string(),
      requesterUserId: id("users"),
      vaultId: optional(id("vaults")),
      scope: ProdAccessScope,
      provider: ProdAccessProvider,
      resourceKind: ProdAccessResourceKind,
      toolName: string(),
      paramsJson: string(),
      status: ProdAccessStatus,
      redactionLevel: ProdAccessRedactionLevel,
      approvedBy: optional(id("users")),
      approvedAt: optional(number()),
      executedAt: optional(number()),
      expiresAt: optional(number()),
      error: optional(string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.requestId);
  },
});

export const setProdAccessRequestStatusInternal = internalMutation({
  args: {
    requestId: id("aiProdAccessRequests"),
    status: ProdAccessStatus,
    error: optional(string()),
    approvedBy: optional(id("users")),
    approvedAt: optional(number()),
    executedAt: optional(number()),
    redactionLevel: optional(ProdAccessRedactionLevel),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch: {
      status: typeof args.status;
      error?: string;
      approvedBy?: typeof args.approvedBy;
      approvedAt?: number;
      executedAt?: number;
      redactionLevel?: typeof args.redactionLevel;
    } = {
      status: args.status,
    };
    if (args.error !== undefined) patch.error = args.error;
    if (args.approvedBy !== undefined) patch.approvedBy = args.approvedBy;
    if (args.approvedAt !== undefined) patch.approvedAt = args.approvedAt;
    if (args.executedAt !== undefined) patch.executedAt = args.executedAt;
    if (args.redactionLevel !== undefined) {
      patch.redactionLevel = args.redactionLevel;
    }

    await ctx.db.patch(args.requestId, patch);
    return null;
  },
});

export const addProdAccessAuditInternal = internalMutation({
  args: {
    requestId: id("aiProdAccessRequests"),
    actorUserId: id("users"),
    action: ProdAccessAuditAction,
    toolName: string(),
    endpoint: string(),
    argumentHash: string(),
    rowCount: optional(number()),
    logLineCount: optional(number()),
    error: optional(string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("aiProdAccessAudit", {
      requestId: args.requestId,
      actorUserId: args.actorUserId,
      action: args.action,
      toolName: args.toolName,
      endpoint: args.endpoint,
      argumentHash: args.argumentHash,
      rowCount: args.rowCount,
      logLineCount: args.logLineCount,
      createdAt: Date.now(),
      error: args.error,
    });
    return null;
  },
});

export const updateCommitProposalMessageCommittedInternal = internalMutation({
  args: {
    messageId: string(),
    committed: boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("chatMessageMetadata")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .first();
    if (!row) return null;
    const parsed = parseCommitPayload(row.payloadJson);
    if (!parsed) return null;
    await ctx.db.patch(row._id, {
      payloadJson: JSON.stringify({
        ...parsed,
        committed: args.committed,
      }),
    });
    return null;
  },
});

export const saveMessageMetadataInternal = internalMutation({
  args: {
    messageId: string(),
    threadId: string(),
    type: union(
      literal("tool_activity"),
      literal("commit_proposal"),
      literal("prod_read_proposal"),
      literal("prod_read_result"),
    ),
    payloadJson: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("chatMessageMetadata", {
      messageId: args.messageId,
      threadId: args.threadId,
      type: args.type,
      payloadJson: args.payloadJson,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const getThreadContextForAction = internalQuery({
  args: { threadId: string() },
  returns: union(
    object({
      threadId: string(),
      userId: id("users"),
      vaultId: optional(id("vaults")),
      repositoryFullName: optional(string()),
      branch: optional(string()),
      filePath: optional(string()),
      systemPrompt: optional(string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("agentThreadContext")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();
    if (!thread) return null;
    return {
      threadId: thread.threadId,
      userId: thread.userId,
      vaultId: thread.vaultId,
      repositoryFullName: thread.repositoryFullName,
      branch: thread.branch,
      filePath: thread.filePath,
      systemPrompt: thread.systemPrompt,
    };
  },
});

export const saveThreadSystemPrompt = internalMutation({
  args: {
    threadId: string(),
    systemPrompt: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("agentThreadContext")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();
    if (!thread) return null;
    await ctx.db.patch(thread._id, { systemPrompt: args.systemPrompt });
    return null;
  },
});

export const updateProdReadProposalMessageStatusInternal = internalMutation({
  args: {
    messageId: string(),
    status: ProdAccessStatus,
    error: optional(string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("chatMessageMetadata")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .first();
    if (!row) return null;
    const parsed = parseProdReadProposalPayload(row.payloadJson);
    if (!parsed) return null;
    await ctx.db.patch(row._id, {
      payloadJson: JSON.stringify({
        ...parsed,
        status: args.status,
        error: args.error,
      }),
    });
    return null;
  },
});

export function buildToolActivityPayload(
  tools: ToolActivityItem[],
): ToolActivityPayload {
  return { type: "tool_activity", tools };
}

export function buildCommitProposalPayload(args: {
  message: string;
  tools?: ToolActivityItem[];
}): CommitProposalPayload {
  return { type: "commit_proposal", message: args.message, tools: args.tools };
}

export function buildProdReadProposalPayload(
  proposal: Omit<ProdReadProposalPayload, "type">,
  tools?: ToolActivityItem[],
): ProdReadProposalPayload {
  return {
    type: "prod_read_proposal",
    ...proposal,
    ...(tools ? { tools } : {}),
  };
}

export function buildProdReadResultPayload(
  payload: Omit<ProdReadResultPayload, "type">,
): ProdReadResultPayload {
  return { type: "prod_read_result", ...payload };
}

export type { MessageMetadata, ToolActivityItem, MessageDoc };
