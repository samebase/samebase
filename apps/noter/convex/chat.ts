import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getUserId } from "./common";

export const createConversation = mutation({
  args: {},
  returns: v.id("chatConversations"),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    return await ctx.db.insert("chatConversations", { userId });
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
    // Filter out messages with commit_proposal metadata (they're UI-only)
    return messages
      .filter((m) => {
        if (!m.metadata) return true;
        try {
          const meta = JSON.parse(m.metadata);
          return meta.type !== "commit_proposal";
        } catch {
          return true;
        }
      })
      .map((m) => ({ role: m.role, content: m.content }));
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
      if (!msg.metadata) continue;
      try {
        const meta = JSON.parse(msg.metadata);
        if (meta.type === "commit_proposal" && !meta.committed) {
          await ctx.db.patch(msg._id, {
            metadata: JSON.stringify({ ...meta, committed: true }),
          });
          break;
        }
      } catch {
        // skip malformed metadata
      }
    }

    return null;
  },
});
