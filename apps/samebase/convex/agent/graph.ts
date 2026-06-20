"use node";

import { Agent, stepCountIs } from "@convex-dev/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { components } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { isRecord, toErrorMessage } from "../jsonUtils";
import type { ToolContext } from "./tools";
import { createTools } from "./tools";
import type { MessageDoc } from "@convex-dev/agent/validators";
import { requestIdSchema } from "../../shared/chatMetadata";

const COMMIT_SENTINEL = "__COMMIT_PROPOSAL__:";
const PROD_READ_SENTINEL = "__PROD_READ_PROPOSAL__:";
const PROD_READ_PROPOSAL_SCHEMA = z.object({
  requestId: requestIdSchema,
  scope: z.enum(["vault", "global"]),
  provider: z.enum(["convex", "cloudflare"]),
  resourceKind: z.enum([
    "deployment_status",
    "logs",
    "data_query",
    "project_inventory",
    "account_inventory",
    "workers_inventory",
  ]),
  toolName: z.string(),
  paramsPreview: z.string(),
  summary: z.string(),
});
type ProdReadProposal = z.infer<typeof PROD_READ_PROPOSAL_SCHEMA>;

type AgentStreamTextArgs = Parameters<typeof Agent.prototype.streamText>[2];
type StepSnapshot = Parameters<NonNullable<AgentStreamTextArgs["onStepFinish"]>>[0];
type ToolCallSnapshot = StepSnapshot["toolCalls"][number];

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

function formatToolCallError(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error === undefined) {
    return undefined;
  }
  return toErrorMessage(error, "Unknown tool call error");
}

function summarizeToolInput(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "content" && typeof value === "string") {
      summary.contentLength = value.length;
      summary.contentRedacted = true;
      continue;
    }
    if (key === "replacements" && Array.isArray(value)) {
      summary.replacementsCount = value.length;
      summary.replacementsPreview = value.slice(0, 3).map((replacement) => {
        if (!isRecord(replacement)) {
          return replacement;
        }
        return {
          oldTextLength:
            typeof replacement["oldText"] === "string" ? replacement["oldText"].length : undefined,
          newTextLength:
            typeof replacement["newText"] === "string" ? replacement["newText"].length : undefined,
        };
      });
      continue;
    }
    summary[key] = value;
  }
  return summary;
}

function getMissingRequiredToolKeys(call: ToolCallSnapshot): string[] {
  const input = isRecord(call.input) ? call.input : null;
  const hasPath =
    input !== null && typeof input["path"] === "string" && input["path"].trim().length > 0;
  const hasContent = input !== null && typeof input["content"] === "string";
  const hasReplacements =
    input !== null && Array.isArray(input["replacements"]) && input["replacements"].length > 0;

  switch (call.toolName) {
    case "read_file":
    case "delete_file":
      return hasPath ? [] : ["path"];
    case "edit_file":
    case "create_file": {
      const missing: string[] = [];
      if (!hasPath) {
        missing.push("path");
      }
      if (!hasContent) {
        missing.push("content");
      }
      return missing;
    }
    case "replace_in_file": {
      const missing: string[] = [];
      if (!hasPath) {
        missing.push("path");
      }
      if (!hasReplacements) {
        missing.push("replacements");
      }
      return missing;
    }
    default:
      return [];
  }
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
 * Runs the Samebase agent turn using the official Convex Agent runtime.
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

  const agent = createAppAgent(provider, model);
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
      const missingKeys = getMissingRequiredToolKeys(call);
      const invalid = "invalid" in call && typeof call.invalid === "boolean" ? call.invalid : false;
      const error = "error" in call ? formatToolCallError(call.error) : undefined;

      toolActivity.push({
        tool: call.toolName,
        input: call.input,
      });

      if (
        call.toolName === "edit_file" ||
        call.toolName === "replace_in_file" ||
        call.toolName === "create_file" ||
        call.toolName === "read_file" ||
        call.toolName === "delete_file"
      ) {
        console.log("agentGraph:runAgentGraph:fileToolCall", {
          threadId,
          promptMessageId,
          tool: call.toolName,
          input: summarizeToolInput(call.input),
          invalid,
          error,
          missingKeys,
        });
      }
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

  const totalToolCalls = steps.reduce((count, step) => count + step.toolCalls.length, 0);
  const totalToolResults = steps.reduce((count, step) => count + step.toolResults.length, 0);
  if (tools && (totalToolCalls > 0 || totalToolResults > 0)) {
    console.log("agentGraph:runAgentGraph:stepSummary", {
      threadId,
      promptMessageId,
      stepCount: steps.length,
      totalToolCalls,
      totalToolResults,
      perStep: steps.map((step, index) => ({
        index,
        finishReason: step.finishReason,
        toolCalls: step.toolCalls.length,
        toolResults: step.toolResults.length,
      })),
    });
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
