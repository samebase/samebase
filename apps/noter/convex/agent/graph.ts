"use node";

import { Agent, stepCountIs } from "@convex-dev/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { components } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { ToolContext } from "./tools";
import { createTools } from "./tools";

const COMMIT_SENTINEL = "__COMMIT_PROPOSAL__:";
const PROD_READ_SENTINEL = "__PROD_READ_PROPOSAL__:";
const PROD_READ_PROPOSAL_SCHEMA = z.object({
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
});
type ProdReadProposal = z.infer<typeof PROD_READ_PROPOSAL_SCHEMA>;

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
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  provider?: string;
  model?: string;
}): Promise<GraphResult> {
  const {
    ctx,
    toolCtx,
    systemPrompt,
    messages,
    provider = "anthropic",
    model = "claude-sonnet-4-20250514",
  } = opts;

  const agent = createNoterAgent(provider, model);
  const tools = toolCtx ? createTools(toolCtx) : undefined;

  const result = await agent.generateText(
    ctx,
    {},
    {
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      tools,
      ...(tools ? { stopWhen: stepCountIs(12) } : {}),
    },
    {
      storageOptions: { saveMessages: "none" },
      contextOptions: { recentMessages: 0 },
    },
  );

  const toolActivity: Array<{ tool: string; input: unknown }> = [];
  let commitProposal: string | undefined;
  let prodReadProposal: ProdReadProposal | undefined;

  for (const step of result.steps) {
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

  const text = result.text.trim().length > 0 ? result.text : "(No response)";

  return {
    text,
    commitProposal,
    prodReadProposal,
    toolActivity,
  };
}
