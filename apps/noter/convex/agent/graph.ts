"use node";

import {
  StateGraph,
  MessagesAnnotation,
  MemorySaver,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatAnthropic } from "@langchain/anthropic";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
} from "@langchain/core/messages";
import type { ToolContext } from "./tools";
import { createTools } from "./tools";

const COMMIT_SENTINEL = "__COMMIT_PROPOSAL__:";

function createModel(provider: string, model: string) {
  switch (provider) {
    case "anthropic":
      return new ChatAnthropic({ model, temperature: 0 });
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

export interface GraphResult {
  /** The final text content from the assistant */
  text: string;
  /** If commit_and_push was called, the commit message */
  commitProposal?: string;
  /** Log of tool calls made during this invocation */
  toolActivity: Array<{ tool: string; input: unknown }>;
}

/**
 * Creates and invokes the agent graph for a single request.
 *
 * Returns the final assistant text plus any commit proposal detected.
 */
export async function runAgentGraph(opts: {
  toolCtx?: ToolContext;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  provider?: string;
  model?: string;
}): Promise<GraphResult> {
  const {
    toolCtx,
    systemPrompt,
    messages,
    provider = "anthropic",
    model = "claude-sonnet-4-20250514",
  } = opts;

  const baseLlm = createModel(provider, model);

  // When no tool context, run without tools (simple Q&A mode)
  if (!toolCtx) {
    const inputMessages = [
      new SystemMessage(systemPrompt),
      ...messages.map((m) =>
        m.role === "user"
          ? new HumanMessage(m.content)
          : new AIMessage(m.content),
      ),
    ];
    const response = await baseLlm.invoke(inputMessages);
    const text =
      typeof response.content === "string"
        ? response.content
        : Array.isArray(response.content)
          ? response.content
              .filter((b: { type: string }) => b.type === "text")
              .map((b: { text: string }) => b.text)
              .join("")
          : "";
    return { text: text || "(No response)", toolActivity: [] };
  }

  const tools = createTools(toolCtx);
  const llm = baseLlm.bindTools(tools);
  const toolNode = new ToolNode(tools);

  const toolActivity: Array<{ tool: string; input: unknown }> = [];
  let commitProposal: string | undefined;

  // --- Graph Definition ---

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("agent", async (state) => {
      const response = await llm.invoke(state.messages);
      return { messages: [response] };
    })
    .addNode("tools", async (state) => {
      // Run the tool node
      const result = await toolNode.invoke(state);

      // Track tool activity and detect commit proposals.
      // Also look at the preceding AI message to capture tool call inputs.
      const lastAiMsg = state.messages[state.messages.length - 1];
      const toolCallInputs = new Map<string, unknown>();
      if (lastAiMsg.tool_calls) {
        for (const tc of lastAiMsg.tool_calls) {
          toolCallInputs.set(tc.id ?? tc.name, tc.args);
        }
      }

      for (const msg of result.messages) {
        if (msg._getType() === "tool") {
          toolActivity.push({
            tool: msg.name,
            input: toolCallInputs.get(msg.tool_call_id) ?? {},
          });

          // Detect commit_and_push sentinel
          if (
            typeof msg.content === "string" &&
            msg.content.startsWith(COMMIT_SENTINEL)
          ) {
            commitProposal = msg.content.slice(COMMIT_SENTINEL.length);
          }
        }
      }

      return result;
    })
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", (state) => {
      const lastMessage = state.messages[state.messages.length - 1];

      // If the LLM didn't request any tool calls, we're done
      if (
        !lastMessage.tool_calls ||
        lastMessage.tool_calls.length === 0
      ) {
        return "__end__";
      }

      return "tools";
    })
    .addConditionalEdges("tools", () => {
      // If commit_and_push was called, stop the loop
      if (commitProposal !== undefined) {
        return "__end__";
      }
      // Otherwise loop back to the agent
      return "agent";
    });

  const checkpointer = new MemorySaver();
  const app = graph.compile({ checkpointer });

  // Build initial message list with system prompt
  const inputMessages = [
    new SystemMessage(systemPrompt),
    ...messages.map((m) =>
      m.role === "user"
        ? new HumanMessage(m.content)
        : new AIMessage(m.content),
    ),
  ];

  const result = await app.invoke(
    { messages: inputMessages },
    { configurable: { thread_id: "single" } },
  );

  // Extract the final AI message text
  const allMessages = result.messages;
  let text = "";
  for (let i = allMessages.length - 1; i >= 0; i--) {
    const msg = allMessages[i];
    if (msg._getType() === "ai" && typeof msg.content === "string" && msg.content) {
      text = msg.content;
      break;
    }
    // AIMessage content can also be an array of content blocks
    if (msg._getType() === "ai" && Array.isArray(msg.content)) {
      const textParts = msg.content
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text);
      if (textParts.length > 0) {
        text = textParts.join("");
        break;
      }
    }
  }

  return {
    text: text || "(No response)",
    commitProposal,
    toolActivity,
  };
}
