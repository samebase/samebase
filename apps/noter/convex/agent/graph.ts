"use node";

import { Agent, stepCountIs } from "@convex-dev/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { components } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { ToolContext } from "./tools";
import { createTools } from "./tools";
import type { MessageDoc } from "@convex-dev/agent/validators";
import { requestIdSchema } from "../../shared/chatMetadata";

const COMMIT_SENTINEL = "__COMMIT_PROPOSAL__:";
const PROD_READ_SENTINEL = "__PROD_READ_PROPOSAL__:";
const PROD_READ_PROPOSAL_SCHEMA = z.object({
  requestId: requestIdSchema,
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
});
type ProdReadProposal = z.infer<typeof PROD_READ_PROPOSAL_SCHEMA>;

type AgentStreamTextArgs = Parameters<typeof Agent.prototype.streamText>[2];
type StepSnapshot = Parameters<
  NonNullable<AgentStreamTextArgs["onStepFinish"]>
>[0];

function createModel(provider: string, model: string) {
  switch (provider) {
    case "anthropic":
      return anthropic(model);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

function createNoterAgent(provider: string, model: string) {
  return new Agent(components.agent, {
    name: "noter-chat",
    languageModel: createModel(provider, model),
    maxSteps: 12,
  });
}

export interface GraphResult {
  /** The final text content from the assistant */
  text: string;
  /** If commit_and_push was called, the commit message */
  commitProposal?: string;
  /** If a production read was requested, proposal payload */
  prodReadProposal?: ProdReadProposal;
  /** Log of tool calls made during this invocation */
  toolActivity: Array<{ tool: string; input: unknown }>;
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
 * Runs the Noter agent turn using the official Convex Agent runtime.
 *
 * Returns the final assistant text plus detected commit/prod-read proposals.
 */
export async function runAgentGraph(opts: {
  ctx: ActionCtx;
  toolCtx?: ToolContext;
  systemPrompt: string;
  threadId: string;
  promptMessageId: string;
  provider?: string;
  model?: string;
  userId?: Id<"users">;
}): Promise<GraphResult> {
  const {
    ctx,
    toolCtx,
    systemPrompt,
    threadId,
    promptMessageId,
    provider = "anthropic",
    model = "claude-sonnet-4-20250514",
    userId,
  } = opts;

  const agent = createNoterAgent(provider, model);
  const tools = toolCtx ? createTools(toolCtx) : undefined;

  const steps: StepSnapshot[] = [];

  const result = await agent.streamText(
    ctx,
    { userId, threadId },
    {
      system: systemPrompt,
      promptMessageId,
      tools,
      onStepFinish: async (step: StepSnapshot) => {
        steps.push(step);
      },
      ...(tools ? { stopWhen: stepCountIs(12) } : {}),
    },
    {
      saveStreamDeltas: true,
    },
  );

  const toolActivity: Array<{ tool: string; input: unknown }> = [];
  let commitProposal: string | undefined;
  let prodReadProposal: ProdReadProposal | undefined;

  for (const step of steps) {
    for (const call of step.toolCalls) {
      toolActivity.push({
        tool: call.toolName,
        input: call.input,
      });
    }

    for (const toolResult of step.toolResults) {
      if (typeof toolResult.output !== "string") {
        continue;
      }

      if (toolResult.output.startsWith(COMMIT_SENTINEL)) {
        commitProposal = toolResult.output.slice(COMMIT_SENTINEL.length);
        continue;
      }

      if (toolResult.output.startsWith(PROD_READ_SENTINEL)) {
        const payload = toolResult.output.slice(PROD_READ_SENTINEL.length);
        try {
          const parsedUnknown: unknown = JSON.parse(payload);
          const parsed = PROD_READ_PROPOSAL_SCHEMA.safeParse(parsedUnknown);
          if (parsed.success) {
            prodReadProposal = parsed.data;
          }
        } catch {
          // Ignore malformed tool payloads.
        }
      }
    }
  }

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
    commitProposal,
    prodReadProposal,
    toolActivity,
    savedMessages,
  };
}
