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
  },
  returns: v.id("chatMessages"),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }
    const messageId = await ctx.db.insert("chatMessages", {
      conversationId: args.conversationId,
      role: "user",
      content: args.content,
    });
    await ctx.scheduler.runAfter(0, internal.chatActions.generateResponse, {
      conversationId: args.conversationId,
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
    return messages.map((m) => ({ role: m.role, content: m.content }));
  },
});

export const saveAssistantMessage = internalMutation({
  args: {
    conversationId: v.id("chatConversations"),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("chatMessages", {
      conversationId: args.conversationId,
      role: "assistant",
      content: args.content,
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
