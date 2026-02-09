"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are a helpful coding assistant embedded in a collaborative code editor called Noter. You help users with programming questions, code review, debugging, and general software development tasks. Be concise and direct.`;

export const generateResponse = internalAction({
  args: {
    conversationId: v.id("chatConversations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const messages = await ctx.runQuery(internal.chat.loadMessagesForAction, {
      conversationId: args.conversationId,
    });

    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    if (content) {
      await ctx.runMutation(internal.chat.saveAssistantMessage, {
        conversationId: args.conversationId,
        content,
      });
    }
    return null;
  },
});
