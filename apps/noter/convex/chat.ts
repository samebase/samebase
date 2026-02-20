import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getUserId } from "./common";
import { isAdminUser } from "./users";
import { z } from "zod";
import {
  ProdAccessAuditAction,
  ProdAccessProvider,
  ProdAccessRedactionLevel,
  ProdAccessResourceKind,
  ProdAccessScope,
  ProdAccessStatus,
} from "./schema";

function hashText(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash >>> 0).toString(16);
}

const metadataTypeSchema = z.object({
  type: z.string(),
});

const prodReadProposalMetadataSchema = z
  .object({
    type: z.literal("prod_read_proposal"),
    requestId: z.string(),
  })
  .catchall(z.unknown());

const commitProposalMetadataSchema = z
  .object({
    type: z.literal("commit_proposal"),
    committed: z.boolean().optional(),
  })
  .catchall(z.unknown());

function parseMetadataWithSchema<T extends z.ZodTypeAny>(
  metadata: string | undefined,
  schema: T,
): z.infer<T> | null {
  if (!metadata) {
    return null;
  }
  try {
    const parsed = JSON.parse(metadata);
    const result = schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export const createConversation = mutation({
  args: { vaultId: v.optional(v.id("vaults")) },
  returns: v.id("chatConversations"),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    // One conversation per user per vault — return existing if found
    if (args.vaultId) {
      const existing = await ctx.db
        .query("chatConversations")
        .withIndex("by_userId_and_vaultId", (q) =>
          q.eq("userId", userId).eq("vaultId", args.vaultId),
        )
        .first();
      if (existing) return existing._id;
    }

    return await ctx.db.insert("chatConversations", {
      userId,
      vaultId: args.vaultId,
    });
  },
});

export const getConversationForVault = query({
  args: { vaultId: v.id("vaults") },
  returns: v.union(
    v.object({
      _id: v.id("chatConversations"),
      _creationTime: v.number(),
      userId: v.id("users"),
      title: v.optional(v.string()),
      vaultId: v.optional(v.id("vaults")),
      systemPrompt: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    return await ctx.db
      .query("chatConversations")
      .withIndex("by_userId_and_vaultId", (q) =>
        q.eq("userId", userId).eq("vaultId", args.vaultId),
      )
      .first();
  },
});

export const deleteConversation = mutation({
  args: { conversationId: v.id("chatConversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }
    // Delete all messages in the conversation
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversationId", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }
    await ctx.db.delete(args.conversationId);
    return null;
  },
});

export const sendMessage = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    content: v.string(),
    vaultId: v.optional(v.id("vaults")),
    filePath: v.optional(v.string()),
    branch: v.optional(v.string()),
  },
  returns: v.id("chatMessages"),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }

    // Set vaultId on the conversation if provided and not already set
    if (args.vaultId && !conversation.vaultId) {
      await ctx.db.patch(args.conversationId, { vaultId: args.vaultId });
    }

    const messageId = await ctx.db.insert("chatMessages", {
      conversationId: args.conversationId,
      role: "user",
      content: args.content,
    });

    const vaultId = args.vaultId ?? conversation.vaultId;
    await ctx.scheduler.runAfter(0, internal.chatActions.generateResponse, {
      conversationId: args.conversationId,
      vaultId: vaultId ?? undefined,
      filePath: args.filePath,
      branch: args.branch,
    });
    return messageId;
  },
});

export const proposeProdRead = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    vaultId: v.optional(v.id("vaults")),
    scope: ProdAccessScope,
    provider: ProdAccessProvider,
    resourceKind: ProdAccessResourceKind,
    toolName: v.string(),
    paramsJson: v.string(),
    allowRawFallback: v.optional(v.boolean()),
  },
  returns: v.object({
    requestId: v.id("aiProdAccessRequests"),
  }),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }

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
      conversationId: args.conversationId,
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
    conversationId: v.id("chatConversations"),
    requesterUserId: v.id("users"),
    vaultId: v.optional(v.id("vaults")),
    scope: ProdAccessScope,
    provider: ProdAccessProvider,
    resourceKind: ProdAccessResourceKind,
    toolName: v.string(),
    paramsJson: v.string(),
    allowRawFallback: v.optional(v.boolean()),
  },
  returns: v.object({
    requestId: v.id("aiProdAccessRequests"),
  }),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== args.requesterUserId) {
      throw new Error("Conversation not found");
    }

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
      conversationId: args.conversationId,
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
    requestId: v.id("aiProdAccessRequests"),
    conversationId: v.id("chatConversations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request || request.conversationId !== args.conversationId) {
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

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversationId", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .collect();
    for (const message of messages) {
      const parsed = parseMetadataWithSchema(
        message.metadata,
        prodReadProposalMetadataSchema,
      );
      if (!parsed) {
        continue;
      }
      if (parsed.requestId !== args.requestId) {
        continue;
      }
      await ctx.db.patch(message._id, {
        metadata: JSON.stringify({
          ...parsed,
          status: "rejected",
          error: "Rejected by user",
        }),
      });
      break;
    }

    return null;
  },
});

export const confirmProdRead = mutation({
  args: {
    requestId: v.id("aiProdAccessRequests"),
    conversationId: v.id("chatConversations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }

    const user = await ctx.db.get(userId);
    if (!user || !isAdminUser(user.githubUsername)) {
      throw new Error("Only admin users can approve production reads");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request || request.conversationId !== args.conversationId) {
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

      const messages = await ctx.db
        .query("chatMessages")
        .withIndex("by_conversationId", (q) =>
          q.eq("conversationId", args.conversationId),
        )
        .order("desc")
        .collect();
      for (const message of messages) {
        const parsed = parseMetadataWithSchema(
          message.metadata,
          prodReadProposalMetadataSchema,
        );
        if (!parsed) {
          continue;
        }
        if (parsed.requestId !== args.requestId) {
          continue;
        }
        await ctx.db.patch(message._id, {
          metadata: JSON.stringify({
            ...parsed,
            status: "expired",
            error: "Request approval expired",
          }),
        });
        break;
      }
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

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversationId", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .collect();
    for (const message of messages) {
      const parsed = parseMetadataWithSchema(
        message.metadata,
        prodReadProposalMetadataSchema,
      );
      if (!parsed) {
        continue;
      }
      if (parsed.requestId !== args.requestId) {
        continue;
      }
      await ctx.db.patch(message._id, {
        metadata: JSON.stringify({
          ...parsed,
          status: "approved",
          error: undefined,
        }),
      });
      break;
    }

    await ctx.scheduler.runAfter(
      0,
      internal.chatActions.executeApprovedProdRead,
      {
        requestId: args.requestId,
      },
    );

    return null;
  },
});

export const listMessages = query({
  args: {
    conversationId: v.optional(v.id("chatConversations")),
  },
  returns: v.array(
    v.object({
      _id: v.id("chatMessages"),
      _creationTime: v.number(),
      conversationId: v.id("chatConversations"),
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      model: v.optional(v.string()),
      metadata: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    if (!args.conversationId) return [];
    const userId = await getUserId(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) return [];
    return await ctx.db
      .query("chatMessages")
      .withIndex("by_conversationId", (q) =>
        q.eq("conversationId", args.conversationId!),
      )
      .order("asc")
      .collect();
  },
});

export const listConversations = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("chatConversations"),
      _creationTime: v.number(),
      userId: v.id("users"),
      title: v.optional(v.string()),
      vaultId: v.optional(v.id("vaults")),
      systemPrompt: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    return await ctx.db
      .query("chatConversations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const saveSystemPrompt = internalMutation({
  args: {
    conversationId: v.id("chatConversations"),
    systemPrompt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, {
      systemPrompt: args.systemPrompt,
    });
    return null;
  },
});

export const getConversation = query({
  args: { conversationId: v.id("chatConversations") },
  returns: v.union(
    v.object({
      _id: v.id("chatConversations"),
      _creationTime: v.number(),
      userId: v.id("users"),
      title: v.optional(v.string()),
      vaultId: v.optional(v.id("vaults")),
      systemPrompt: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) return null;
    return conversation;
  },
});

export const getConversationForAction = internalQuery({
  args: { conversationId: v.id("chatConversations") },
  returns: v.union(
    v.object({
      _id: v.id("chatConversations"),
      userId: v.id("users"),
      vaultId: v.optional(v.id("vaults")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) return null;
    return {
      _id: conversation._id,
      userId: conversation.userId,
      vaultId: conversation.vaultId,
    };
  },
});

export const loadMessagesForAction = internalQuery({
  args: {
    conversationId: v.id("chatConversations"),
  },
  returns: v.array(
    v.object({
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversationId", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .collect();
    // Filter out UI-only messages (approval cards/proposals)
    return messages
      .filter((m) => {
        const meta = parseMetadataWithSchema(m.metadata, metadataTypeSchema);
        if (!meta) {
          return true;
        }
        return (
          meta.type !== "commit_proposal" && meta.type !== "prod_read_proposal"
        );
      })
      .map((m) => ({ role: m.role, content: m.content }));
  },
});

export const getProdAccessRequestInternal = internalQuery({
  args: {
    requestId: v.id("aiProdAccessRequests"),
  },
  returns: v.union(
    v.object({
      _id: v.id("aiProdAccessRequests"),
      _creationTime: v.number(),
      conversationId: v.id("chatConversations"),
      requesterUserId: v.id("users"),
      vaultId: v.optional(v.id("vaults")),
      scope: ProdAccessScope,
      provider: ProdAccessProvider,
      resourceKind: ProdAccessResourceKind,
      toolName: v.string(),
      paramsJson: v.string(),
      status: ProdAccessStatus,
      redactionLevel: ProdAccessRedactionLevel,
      approvedBy: v.optional(v.id("users")),
      approvedAt: v.optional(v.number()),
      executedAt: v.optional(v.number()),
      expiresAt: v.optional(v.number()),
      error: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.requestId);
  },
});

export const setProdAccessRequestStatusInternal = internalMutation({
  args: {
    requestId: v.id("aiProdAccessRequests"),
    status: ProdAccessStatus,
    error: v.optional(v.string()),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    executedAt: v.optional(v.number()),
    redactionLevel: v.optional(ProdAccessRedactionLevel),
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
    requestId: v.id("aiProdAccessRequests"),
    actorUserId: v.id("users"),
    action: ProdAccessAuditAction,
    toolName: v.string(),
    endpoint: v.string(),
    argumentHash: v.string(),
    rowCount: v.optional(v.number()),
    logLineCount: v.optional(v.number()),
    error: v.optional(v.string()),
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

export const updateProdReadProposalMessageStatusInternal = internalMutation({
  args: {
    conversationId: v.id("chatConversations"),
    requestId: v.id("aiProdAccessRequests"),
    status: ProdAccessStatus,
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversationId", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .collect();

    for (const message of messages) {
      const parsed = parseMetadataWithSchema(
        message.metadata,
        prodReadProposalMetadataSchema,
      );
      if (!parsed) {
        continue;
      }
      if (parsed.requestId !== args.requestId) {
        continue;
      }
      await ctx.db.patch(message._id, {
        metadata: JSON.stringify({
          ...parsed,
          status: args.status,
          error: args.error,
        }),
      });
      break;
    }

    return null;
  },
});

export const saveAssistantMessage = internalMutation({
  args: {
    conversationId: v.id("chatConversations"),
    content: v.string(),
    model: v.optional(v.string()),
    metadata: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("chatMessages", {
      conversationId: args.conversationId,
      role: "assistant",
      content: args.content,
      model: args.model,
      metadata: args.metadata,
    });
    // Set title from first assistant response if not set
    const conversation = await ctx.db.get(args.conversationId);
    if (conversation && !conversation.title) {
      const firstLine = args.content.slice(0, 60).split("\n")[0];
      await ctx.db.patch(args.conversationId, { title: firstLine });
    }
    return null;
  },
});

export const confirmCommit = mutation({
  args: {
    conversationId: v.id("chatConversations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }
    if (!conversation.vaultId) {
      throw new Error("Conversation is not linked to a vault");
    }

    const vault = await ctx.db.get(conversation.vaultId);
    if (!vault) {
      throw new Error("Vault not found");
    }

    // Schedule the commit
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

    // Find the commit_proposal message and mark it as committed
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversationId", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .collect();

    for (const msg of messages) {
      const meta = parseMetadataWithSchema(
        msg.metadata,
        commitProposalMetadataSchema,
      );
      if (meta && !meta.committed) {
        await ctx.db.patch(msg._id, {
          metadata: JSON.stringify({ ...meta, committed: true }),
        });
        break;
      }
    }

    return null;
  },
});
