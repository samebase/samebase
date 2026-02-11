import { v } from "convex/values";

/**
 * AI Agent component schemas and types
 */

export const ToolDefinition = v.object({
  name: v.string(),
  description: v.string(),
  uiDescription: v.string(),
  inputDisplayKey: v.optional(v.string()),
  parameters: v.object({
    type: v.literal("object"),
    properties: v.any(),
    required: v.optional(v.array(v.string())),
  }),
});

export const ToolCall = v.object({
  toolName: v.string(),
  parameters: v.any(),
  callId: v.string(),
});

export const ToolResult = v.object({
  callId: v.string(),
  success: v.boolean(),
  result: v.optional(v.any()),
  error: v.optional(v.string()),
  metadata: v.optional(v.any()),
});

export const AgentContext = v.object({
  vaultId: v.optional(v.id("vaults")),
  userId: v.id("users"),
  conversationId: v.id("chatConversations"),
  currentFilePath: v.optional(v.string()),
  currentFileContent: v.optional(v.string()),
  repositoryTree: v.optional(v.array(v.string())),
  toolsEnabled: v.boolean(),
});

export const AgentCapabilities = v.object({
  canReadFiles: v.boolean(),
  canWriteFiles: v.boolean(),
  canCreateFiles: v.boolean(),
  canDeleteFiles: v.boolean(),
  canAccessGitHub: v.boolean(),
  canCommit: v.boolean(),
  canListFiles: v.boolean(),
});

export const AgentMessage = v.object({
  role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
  content: v.string(),
  toolCalls: v.optional(v.array(ToolCall)),
  toolResults: v.optional(v.array(ToolResult)),
  metadata: v.optional(v.any()),
});

export const AgentSession = v.object({
  userId: v.id("users"),
  vaultId: v.optional(v.id("vaults")),
  conversationId: v.id("chatConversations"),
  context: AgentContext,
  capabilities: AgentCapabilities,
  systemPrompt: v.string(),
  activeTools: v.array(v.string()),
});