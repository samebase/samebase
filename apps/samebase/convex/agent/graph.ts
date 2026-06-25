"use node";

import { Agent } from "@convex-dev/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { components } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MessageDoc } from "@convex-dev/agent/validators";

function createModel(provider: string, model: string) {
  switch (provider) {
    case "anthropic":
      return anthropic(model);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

function createAppAgent(provider: string, model: string) {
  return new Agent(components.agent, {
    name: "samebase-chat",
    languageModel: createModel(provider, model),
    maxSteps: 12,
  });
}

export interface GraphResult {
  /** The final text content from the assistant */
  text: string;
  /** Messages saved by the agent during this invocation */
  savedMessages?: MessageDoc[];
}

function summarizeSavedMessages(savedMessages?: MessageDoc[]) {
  if (!savedMessages || savedMessages.length === 0) return [];
  return savedMessages.slice(-6).map((message) => ({
    id: message._id,
    role: message.message?.role,
    tool: message.tool,
    status: message.status,
    textLength: message.text?.length ?? 0,
  }));
}

/**
 * Runs the Samebase agent turn using the official Convex Agent runtime.
 *
 * Returns the final assistant text saved by the Agent component.
 */
export async function runAgentGraph(opts: {
  ctx: ActionCtx;
  systemPrompt: string;
  threadId: string;
  promptMessageId: string;
  provider?: string;
  model?: string;
  userId?: Id<"users">;
}): Promise<GraphResult> {
  const {
    ctx,
    systemPrompt,
    threadId,
    promptMessageId,
    provider = "anthropic",
    model = "claude-sonnet-4-20250514",
    userId,
  } = opts;

  const agent = createAppAgent(provider, model);

  const result = await agent.streamText(
    ctx,
    { userId, threadId },
    {
      system: systemPrompt,
      promptMessageId,
    },
    {
      saveStreamDeltas: true,
    },
  );

  const savedMessages = result.savedMessages;
  let text = "(No response)";
  let foundAssistant = false;
  let foundAssistantText = false;
  if (savedMessages && savedMessages.length > 0) {
    for (let i = savedMessages.length - 1; i >= 0; i -= 1) {
      const msg = savedMessages[i];
      if (!msg.tool && msg.message?.role === "assistant") {
        foundAssistant = true;
        if (typeof msg.text === "string" && msg.text.trim()) {
          text = msg.text;
          foundAssistantText = true;
          break;
        }
      }
    }
  } else {
    console.log("agentGraph:runAgentGraph:noSavedMessages", {
      threadId,
      promptMessageId,
    });
  }

  if (!foundAssistantText) {
    let fallbackText: string | undefined;
    try {
      fallbackText = await result.text;
    } catch (error) {
      console.log("agentGraph:runAgentGraph:textReadFailed", {
        threadId,
        promptMessageId,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
    if (fallbackText && fallbackText.trim()) {
      text = fallbackText;
    }
    console.log(
      foundAssistant
        ? "agentGraph:runAgentGraph:assistantTextMissing"
        : "agentGraph:runAgentGraph:missingAssistantMessage",
      {
        threadId,
        promptMessageId,
        fallbackLength: fallbackText?.length ?? 0,
        savedMessages: summarizeSavedMessages(savedMessages),
      },
    );
  }

  return {
    text,
    savedMessages,
  };
}
