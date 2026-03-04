import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { components, internal } from "../_generated/api";
import { getUserId } from "../common";
import { getConnectionByUserAndKind } from "../providerConnections";
import { isAdminUser } from "../users";
import {
  listMessages,
  saveMessage,
  syncStreams,
  toUIMessages,
  type UIMessage,
} from "@convex-dev/agent";
import {
  vStreamArgs,
  vStreamDelta,
  vStreamMessage,
} from "@convex-dev/agent/validators";
import {
  ProdAccessAuditAction,
  ProdAccessProvider,
  ProdAccessRedactionLevel,
  ProdAccessResourceKind,
  ProdAccessScope,
  ProdAccessStatus,
} from "../schema";
import {
  parseCommitPayload,
  parseMetadataPayload,
  parseProdReadProposalPayload,
  type MessageMetadata,
} from "./metadata";
import { assertProdReadAccess, hashText } from "./prodAccess";
import { ensureThreadAccess, getThreadById } from "./threads";

const {
  string,
  optional,
  object,
  union,
  literal,
  number,
  id,
  boolean,
  array,
  null: vNull,
  any: vAny,
} = v;

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
    vNull(),
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
      draftMessage: optional(string()),
      draftUpdatedAt: optional(number()),
    }),
    vNull(),
  ),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const thread = await getThreadById(ctx, args.threadId);
    ensureThreadAccess(userId, thread);
    return {
      threadId: thread.threadId,
      systemPrompt: thread.systemPrompt,
      vaultId: thread.vaultId,
      repositoryFullName: thread.repositoryFullName,
      branch: thread.branch,
      filePath: thread.filePath,
      draftMessage: thread.draftMessage,
      draftUpdatedAt: thread.draftUpdatedAt,
    };
  },
});

export const deleteThread = mutation({
  args: { threadId: string() },
  returns: vNull(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const thread = await getThreadById(ctx, args.threadId);
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

    await ctx.db.delete(thread._id);

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
    const thread = await getThreadById(ctx, args.threadId);
    ensureThreadAccess(userId, thread);

    await ctx.db.patch(thread._id, {
      vaultId: args.vaultId ?? thread.vaultId,
      filePath: args.filePath ?? thread.filePath,
      branch: args.branch ?? thread.branch,
      draftMessage: "",
      draftUpdatedAt: Date.now(),
    });

    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId: args.threadId,
      userId,
      prompt: args.content,
    });

    await ctx.scheduler.runAfter(0, internal.chat.actions.generateResponse, {
      threadId: args.threadId,
      promptMessageId: messageId,
    });

    return messageId;
  },
});

export const updateThreadDraft = mutation({
  args: {
    threadId: string(),
    draftMessage: string(),
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const thread = await getThreadById(ctx, args.threadId);
    ensureThreadAccess(userId, thread);

    await ctx.db.patch(thread._id, {
      draftMessage: args.draftMessage,
      draftUpdatedAt: Date.now(),
    });
    return null;
  },
});

const listThreadMessagesStreamsValidator = optional(
  union(
    object({
      kind: literal("list"),
      messages: array(vStreamMessage),
    }),
    object({
      kind: literal("deltas"),
      deltas: array(vStreamDelta),
    }),
  ),
);

const listThreadMessagesReturnValidator = object({
  page: array(vAny()),
  isDone: boolean(),
  continueCursor: union(string(), vNull()),
  streams: listThreadMessagesStreamsValidator,
});

export const listThreadMessages = query({
  args: {
    threadId: string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  returns: listThreadMessagesReturnValidator,
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const thread = await getThreadById(ctx, args.threadId);
    ensureThreadAccess(userId, thread);

    const paginated = await listMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });

    const metadataByMessageId = new Map<string, MessageMetadata>();
    for (const msg of paginated.page) {
      const row = await ctx.db
        .query("chatMessageMetadata")
        .withIndex("by_messageId", (q) => q.eq("messageId", msg._id))
        .first();
      if (!row) continue;
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
    const thread = await getThreadById(ctx, args.threadId);
    ensureThreadAccess(userId, thread);

    await assertProdReadAccess(ctx, {
      requesterUserId: userId,
      scope: args.scope,
      vaultId: args.vaultId,
    });

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
    const thread = await getThreadById(ctx, args.threadId);
    ensureThreadAccess(args.requesterUserId, thread);

    await assertProdReadAccess(ctx, {
      requesterUserId: args.requesterUserId,
      scope: args.scope,
      vaultId: args.vaultId,
    });

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
  returns: vNull(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const thread = await getThreadById(ctx, args.threadId);
    ensureThreadAccess(userId, thread);

    const request = await ctx.db.get(args.requestId);
    if (!request || request.threadId !== args.threadId) {
      throw new Error("Request not found");
    }

    const user = await ctx.db.get(userId);
    const githubConnection = user
      ? await getConnectionByUserAndKind(ctx.db, user._id, "github")
      : null;
    const githubUsername =
      githubConnection?.kind === "github"
        ? githubConnection.username
        : undefined;
    if (!user || !isAdminUser(githubUsername, user.email)) {
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
      internal.chat.index.updateProdReadProposalMessageStatusInternal,
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
  returns: vNull(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const thread = await getThreadById(ctx, args.threadId);
    ensureThreadAccess(userId, thread);

    const user = await ctx.db.get(userId);
    const githubConnection = user
      ? await getConnectionByUserAndKind(ctx.db, user._id, "github")
      : null;
    const githubUsername =
      githubConnection?.kind === "github"
        ? githubConnection.username
        : undefined;
    if (!user || !isAdminUser(githubUsername, user.email)) {
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
        internal.chat.index.updateProdReadProposalMessageStatusInternal,
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
      internal.chat.index.updateProdReadProposalMessageStatusInternal,
      {
        messageId: args.messageId,
        status: "approved",
        error: undefined,
      },
    );

    await ctx.scheduler.runAfter(
      0,
      internal.chat.actions.executeApprovedProdRead,
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
  returns: vNull(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const thread = await getThreadById(ctx, args.threadId);
    ensureThreadAccess(userId, thread);
    if (!thread.vaultId) {
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
        commitProposalMessageId: args.messageId,
      },
    );

    await ctx.runMutation(
      internal.chat.index.updateCommitProposalMessageCommittedInternal,
      {
        messageId: args.messageId,
        committed: false,
        error: undefined,
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
    vNull(),
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
  returns: vNull(),
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
  returns: vNull(),
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
    error: optional(string()),
  },
  returns: vNull(),
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
        error: args.error,
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
  returns: vNull(),
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
    vNull(),
  ),
  handler: async (ctx, args) => {
    const thread = await getThreadById(ctx, args.threadId);
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
  returns: vNull(),
  handler: async (ctx, args) => {
    const thread = await getThreadById(ctx, args.threadId);
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
  returns: vNull(),
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

export {
  buildCommitProposalPayload,
  buildProdReadProposalPayload,
  buildProdReadResultPayload,
  buildToolActivityPayload,
} from "./metadata";
export type { MessageMetadata, ToolActivityItem } from "./metadata";
export type { MessageDoc } from "@convex-dev/agent/validators";
