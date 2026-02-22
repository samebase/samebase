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

function AgentNode({
  data,
  vaultId,
  onOpenFile,
}: NodeProps<AgentGraphNode> & {
  vaultId?: Id<"vaults">;
  onOpenFile: (path: string) => void;
}) {
  const sendAgentMessage = useAction(api.agentGraphActions.sendAgentMessage);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentNodeMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAgent = data.kind === "agent";
  const isDisabled = !isAgent || !vaultId || sending;

  const pushMessage = useCallback((message: AgentNodeMessage) => {
    setMessages((prev) => {
      const next = [...prev, message];
      if (next.length <= MAX_NODE_MESSAGES) return next;
      return next.slice(next.length - MAX_NODE_MESSAGES);
    });
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isDisabled || !vaultId) return;
    setSending(true);
    setInput("");
    setError(null);
    pushMessage({ role: "user", content: trimmed });

    try {
      const result = await sendAgentMessage({
        vaultId,
        agentPath: data.path,
        message: trimmed,
        threadId: threadId ?? undefined,
      });
      setThreadId(result.threadId);
      pushMessage({ role: "assistant", content: result.response });
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
    pushMessage,
    sendAgentMessage,
    threadId,
    vaultId,
  ]);

  return (
    <div className="rounded-md border border-border bg-background p-3 shadow-sm w-72">
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
      <button
        type="button"
        onClick={() => onOpenFile(data.path)}
        className="text-left text-sm font-medium text-foreground hover:underline"
      >
        {data.label}
      </button>
      {isAgent && (
        <div className="mt-2 space-y-2">
          {messages.length > 0 && (
            <div className="max-h-32 space-y-2 overflow-auto text-xs">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={
                    message.role === "assistant"
                      ? "rounded-md bg-muted px-2 py-1 text-muted-foreground"
                      : "rounded-md border border-border/70 px-2 py-1 text-foreground"
                  }
                >
                  <span className="font-medium">
                    {message.role === "assistant" ? "Agent" : "You"}
                  </span>
                  {": "}
                  <span className="whitespace-pre-wrap">{message.content}</span>
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
            textareaClassName="min-h-[3rem] text-xs"
            sendButtonClassName="h-7 w-7"
          />
          {error && <div className="text-[11px] text-red-600">{error}</div>}
        </div>
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
  const nodeTypes = useMemo(
    () => ({
      agentNode: (props: NodeProps<AgentGraphNode>) => (
        <AgentNode {...props} vaultId={vaultId} onOpenFile={onOpenFile} />
      ),
    }),
    [onOpenFile, vaultId],
  );

  return (
    <div className="h-full w-full rounded-md border border-border/50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
