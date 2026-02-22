import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ChatInput } from "@/components/ChatInput";

export type AgentGraphNodeData = {
  label: string;
  path: string;
  kind: "agent" | "tool";
};

export type AgentGraphNode = Node<AgentGraphNodeData>;
export type AgentGraphEdge = Edge;

type AgentGraphViewProps = {
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
  onOpenFile: (path: string) => void;
  vaultId?: Id<"vaults">;
};

type AgentNodeMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_NODE_MESSAGES = 6;
const EDGE_COLORS = ["#f59e0b", "#6366f1", "#10b981", "#0ea5e9"];

type NodeChatState = {
  threadId: string | null;
  messages: AgentNodeMessage[];
};

function AgentNode({
  data,
  vaultId,
  onOpenFile,
  messages,
  threadId,
  onAppendMessage,
  onSetThreadId,
}: NodeProps<AgentGraphNode> & {
  vaultId?: Id<"vaults">;
  onOpenFile: (path: string) => void;
  messages: AgentNodeMessage[];
  threadId: string | null;
  onAppendMessage: (message: AgentNodeMessage) => void;
  onSetThreadId: (threadId: string) => void;
}) {
  const sendAgentMessage = useAction(api.agentGraphActions.sendAgentMessage);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAgent = data.kind === "agent";
  const isDisabled = !isAgent || !vaultId || sending;
  const headerLabel = isAgent ? "AGENT" : "TOOLBOX";
  const subtitle = isAgent ? "System prompt file" : "Tool definitions";

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isDisabled || !vaultId) return;
    setSending(true);
    setInput("");
    setError(null);
    onAppendMessage({ role: "user", content: trimmed });

    try {
      const result = await sendAgentMessage({
        vaultId,
        agentPath: data.path,
        message: trimmed,
        threadId: threadId ?? undefined,
      });
      onSetThreadId(result.threadId);
      onAppendMessage({ role: "assistant", content: result.response });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send message.";
      setError(message);
      setInput(trimmed);
    } finally {
      setSending(false);
    }
  }, [
    data.path,
    input,
    isDisabled,
    sendAgentMessage,
    threadId,
    vaultId,
    onAppendMessage,
    onSetThreadId,
  ]);

  return (
    <div className="relative w-80 rounded-lg border border-border/70 bg-background shadow-sm">
      <Handle
        type="target"
        position={Position.Left}
        className="h-2 w-2 rounded-full border border-background bg-foreground/70"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="h-2 w-2 rounded-full border border-background bg-foreground/70"
      />
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">
          {headerLabel}
        </span>
      </div>
      <div className="border-b border-border/60 px-3 py-2">
        <button
          type="button"
          onClick={() => onOpenFile(data.path)}
          className="text-left text-sm font-semibold text-foreground hover:underline"
        >
          {data.label}
        </button>
        <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
      </div>
      {isAgent && (
        <>
          <div className="border-b border-border/60 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">
                INSTRUCTIONS
              </span>
              <button
                type="button"
                onClick={() => onOpenFile(data.path)}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                Edit
              </button>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Uses {data.label} as the system prompt for this agent.
            </div>
          </div>
          <div className="px-3 py-2">
            {messages.length > 0 && (
              <div className="mb-2 max-h-32 space-y-2 overflow-auto text-xs">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={
                      message.role === "assistant"
                        ? "rounded-md bg-muted/70 px-2 py-1 text-muted-foreground"
                        : "rounded-md border border-border/70 px-2 py-1 text-foreground"
                    }
                  >
                    <span className="font-medium">
                      {message.role === "assistant" ? "Agent" : "You"}
                    </span>
                    {": "}
                    <span className="whitespace-pre-wrap">
                      {message.content}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <ChatInput
              value={input}
              onValueChange={setInput}
              onSend={() => void handleSend()}
              disabled={isDisabled}
              rows={2}
              textareaClassName="min-h-[2.75rem] text-xs"
              sendButtonClassName="h-7 w-7"
            />
            {error && (
              <div className="mt-1 text-[11px] text-red-600">{error}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function AgentGraphView({
  nodes,
  edges,
  onOpenFile,
  vaultId,
}: AgentGraphViewProps) {
  const [nodeChatState, setNodeChatState] = useState<
    Record<string, NodeChatState>
  >({});

  const appendNodeMessage = useCallback(
    (nodeId: string, message: AgentNodeMessage) => {
      setNodeChatState((prev) => {
        const current = prev[nodeId] ?? { threadId: null, messages: [] };
        const nextMessages = [...current.messages, message];
        const trimmed =
          nextMessages.length > MAX_NODE_MESSAGES
            ? nextMessages.slice(nextMessages.length - MAX_NODE_MESSAGES)
            : nextMessages;
        return {
          ...prev,
          [nodeId]: {
            ...current,
            messages: trimmed,
          },
        };
      });
    },
    [],
  );

  const setNodeThreadId = useCallback((nodeId: string, threadId: string) => {
    setNodeChatState((prev) => {
      const current = prev[nodeId] ?? { threadId: null, messages: [] };
      if (current.threadId === threadId) {
        return prev;
      }
      return {
        ...prev,
        [nodeId]: {
          ...current,
          threadId,
        },
      };
    });
  }, []);

  const nodeTypes = useMemo(
    () => ({
      agentNode: (props: NodeProps<AgentGraphNode>) => {
        const chatState = nodeChatState[props.id] ?? {
          threadId: null,
          messages: [],
        };
        return (
          <AgentNode
            {...props}
            vaultId={vaultId}
            onOpenFile={onOpenFile}
            messages={chatState.messages}
            threadId={chatState.threadId}
            onAppendMessage={(message) => appendNodeMessage(props.id, message)}
            onSetThreadId={(threadId) => setNodeThreadId(props.id, threadId)}
          />
        );
      },
    }),
    [appendNodeMessage, nodeChatState, onOpenFile, setNodeThreadId, vaultId],
  );
  const styledEdges = useMemo(
    () =>
      edges.map((edge, index) => ({
        ...edge,
        style: {
          strokeDasharray: "6 6",
          stroke: EDGE_COLORS[index % EDGE_COLORS.length],
          strokeWidth: 2,
          ...(edge.style ?? {}),
        },
      })),
    [edges],
  );

  return (
    <div className="h-full w-full rounded-md border border-border/50">
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        fitView={nodes.length > 0}
        nodesDraggable={false}
        nodesConnectable={false}
        nodeTypes={nodeTypes}
      >
        <Background gap={16} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
