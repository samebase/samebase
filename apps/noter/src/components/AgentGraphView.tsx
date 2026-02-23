import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  createContext,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ChatInput } from "@/components/ChatInput";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import { useUIMessages } from "@convex-dev/agent/react";
import { Kbd, KbdGroup } from "@/components/ui-custom/kbd";

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
  repositoryFullName?: string;
  branch?: string;
  filePath?: string;
};

type AgentNodeMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_NODE_MESSAGES = 6;
const EDGE_COLORS = ["#f59e0b", "#6366f1", "#10b981", "#0ea5e9"];
const DEFAULT_AGENT_NODE_SIZE = { width: 320, height: 320 };
const DEFAULT_TOOL_NODE_SIZE = { width: 240, height: 160 };
const MIN_NODE_WIDTH = 260;
const MIN_NODE_HEIGHT = 240;
const CORNER_HANDLE_INSET = 2;

type AgentGraphChatContextValue = {
  vaultId?: Id<"vaults">;
  onOpenFile: (path: string) => void;
  messages: AgentNodeMessage[];
  onSendMessage: (message: string) => Promise<void>;
  onResizeNode: (
    nodeId: string,
    width: number,
    height: number,
    position?: { x: number; y: number },
  ) => void;
  onCommitResize: (nodeId: string, width: number, height: number) => void;
};

const AgentGraphChatContext = createContext<AgentGraphChatContextValue | null>(
  null,
);

function getNumberStyleValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function mergeGraphNodes(
  current: AgentGraphNode[],
  incoming: AgentGraphNode[],
): AgentGraphNode[] {
  const currentById = new Map(current.map((node) => [node.id, node]));
  return incoming.map((node) => {
    const existing = currentById.get(node.id);
    if (!existing) {
      return node;
    }
    const existingWidth =
      existing.width ?? getNumberStyleValue(existing.style?.width);
    const existingHeight =
      existing.height ?? getNumberStyleValue(existing.style?.height);
    const mergedData = { ...existing.data, ...node.data };
    return {
      ...existing,
      ...node,
      data: mergedData,
      position: existing.position ?? node.position,
      selected: existing.selected ?? node.selected,
      dragging: existing.dragging ?? node.dragging,
      width: existingWidth ?? node.width,
      height: existingHeight ?? node.height,
      style: { ...node.style, ...existing.style },
    };
  });
}

function AgentNode({ data, id, width, height }: NodeProps<AgentGraphNode>) {
  const graphContext = useContext(AgentGraphChatContext);
  const { getViewport, getNode } = useReactFlow();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startNodeX: number;
    startNodeY: number;
    corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  } | null>(null);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);

  const isAgent = data.kind === "agent";
  const isDisabled = !isAgent || !graphContext?.vaultId || sending;
  const headerLabel = isAgent ? "AGENT" : "TOOLBOX";
  const subtitle = isAgent ? "System prompt file" : "Tool definitions";
  const messages = graphContext?.messages ?? [];
  const canResize = Boolean(graphContext?.onResizeNode) && isAgent;

  const currentWidth =
    typeof width === "number" ? width : DEFAULT_AGENT_NODE_SIZE.width;
  const currentHeight =
    typeof height === "number" ? height : DEFAULT_AGENT_NODE_SIZE.height;

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (
      !trimmed ||
      isDisabled ||
      !graphContext?.vaultId ||
      !graphContext.onSendMessage
    ) {
      return;
    }
    setSending(true);
    setInput("");
    setError(null);

    try {
      await graphContext.onSendMessage(trimmed);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send message.";
      setError(message);
      setInput(trimmed);
    } finally {
      setSending(false);
    }
  }, [input, isDisabled, graphContext]);

  const handleResizeStart = useCallback(
    (
      event: React.PointerEvent<HTMLDivElement>,
      corner: "top-left" | "top-right" | "bottom-left" | "bottom-right",
    ) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsResizing(true);
      const node = getNode(id);
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startW: currentWidth,
        startH: currentHeight,
        startNodeX: node?.position.x ?? 0,
        startNodeY: node?.position.y ?? 0,
        corner,
      };
      lastSizeRef.current = {
        width: currentWidth,
        height: currentHeight,
      };
    },
    [currentHeight, currentWidth, getNode, id],
  );

  const handleResizeMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current || !graphContext?.onResizeNode) return;
      event.preventDefault();
      event.stopPropagation();
      const { startX, startY, startW, startH, corner } = dragRef.current;
      const { zoom } = getViewport();
      const scale = zoom || 1;
      const dx = (event.clientX - startX) / scale;
      const dy = (event.clientY - startY) / scale;

      let nextWidth = startW;
      let nextHeight = startH;
      let nextX = dragRef.current.startNodeX;
      let nextY = dragRef.current.startNodeY;

      const clampWidth = (value: number) => Math.max(MIN_NODE_WIDTH, value);
      const clampHeight = (value: number) => Math.max(MIN_NODE_HEIGHT, value);

      if (corner === "bottom-right") {
        nextWidth = clampWidth(startW + dx);
        nextHeight = clampHeight(startH + dy);
      } else if (corner === "bottom-left") {
        nextWidth = clampWidth(startW - dx);
        nextHeight = clampHeight(startH + dy);
        nextX += startW - nextWidth;
      } else if (corner === "top-right") {
        nextWidth = clampWidth(startW + dx);
        nextHeight = clampHeight(startH - dy);
        nextY += startH - nextHeight;
      } else {
        nextWidth = clampWidth(startW - dx);
        nextHeight = clampHeight(startH - dy);
        nextX += startW - nextWidth;
        nextY += startH - nextHeight;
      }

      lastSizeRef.current = { width: nextWidth, height: nextHeight };
      graphContext.onResizeNode(id, nextWidth, nextHeight, {
        x: nextX,
        y: nextY,
      });
    },
    [graphContext, getViewport, id],
  );

  const handleResizeEnd = useCallback(() => {
    if (!dragRef.current) {
      return;
    }
    dragRef.current = null;
    setIsResizing(false);
    const lastSize = lastSizeRef.current;
    if (!lastSize || !graphContext?.onCommitResize) {
      return;
    }
    graphContext.onCommitResize(id, lastSize.width, lastSize.height);
  }, [graphContext, id]);

  return (
    <div
      className="relative flex h-full w-full flex-col rounded-lg border border-border/70 bg-background p-2 shadow-sm nowheel nopan"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {canResize && (
        <>
          {(
            [
              {
                corner: "top-left",
                className: "cursor-nwse-resize",
                style: {
                  left: CORNER_HANDLE_INSET,
                  top: CORNER_HANDLE_INSET,
                },
                rotation: "rotate-0",
              },
              {
                corner: "top-right",
                className: "cursor-nesw-resize",
                style: {
                  right: CORNER_HANDLE_INSET,
                  top: CORNER_HANDLE_INSET,
                },
                rotation: "rotate-90",
              },
              {
                corner: "bottom-left",
                className: "cursor-nesw-resize",
                style: {
                  bottom: CORNER_HANDLE_INSET,
                  left: CORNER_HANDLE_INSET,
                },
                rotation: "-rotate-90",
              },
              {
                corner: "bottom-right",
                className: "cursor-nwse-resize",
                style: {
                  bottom: CORNER_HANDLE_INSET,
                  right: CORNER_HANDLE_INSET,
                },
                rotation: "rotate-180",
              },
            ] as const
          ).map((handle) => (
            <div
              key={handle.corner}
              onPointerDown={(event) => handleResizeStart(event, handle.corner)}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
              style={handle.style}
              className={
                "absolute z-10 flex h-4 w-4 touch-none items-center justify-center " +
                handle.className +
                " " +
                (isHovered || isResizing ? "opacity-100" : "opacity-0") +
                " transition-opacity"
              }
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 10 10"
                className={`text-muted-foreground/60 ${handle.rotation}`}
              >
                <path
                  d="M0 10L10 0"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                />
                <path
                  d="M0 6L6 0"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                />
                <path
                  d="M0 2L2 0"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                />
              </svg>
            </div>
          ))}
        </>
      )}
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
          onClick={() => graphContext?.onOpenFile(data.path)}
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
                onClick={() => graphContext?.onOpenFile(data.path)}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                Edit
              </button>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Uses {data.label} as the system prompt for this agent.
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-3 py-2">
            {messages.length > 0 && (
              <div className="mb-2 min-h-[2.5rem] flex-1 space-y-2 overflow-y-auto pr-1 text-xs nowheel nopan">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={
                      message.role === "assistant"
                        ? "rounded-md bg-muted/70 px-2 py-1 text-muted-foreground"
                        : "rounded-md border border-border/70 px-2 py-1 text-foreground"
                    }
                  >
                    <div className="font-medium">
                      {message.role === "assistant" ? "Agent" : "You"}
                    </div>
                    <ProsemarkReadOnly
                      value={message.content}
                      className="text-xs"
                    />
                  </div>
                ))}
              </div>
            )}
            <ChatInput
              value={input}
              onValueChange={setInput}
              onSend={() => void handleSend()}
              disabled={isDisabled}
              mode="prosemark"
              rows={2}
              className="nowheel nopan"
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
  repositoryFullName,
  branch,
  filePath,
}: AgentGraphViewProps) {
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const createThread = useMutation(api.chat.index.createThread);
  const sendMessage = useMutation(api.chat.index.sendMessage);
  const setNodeLayout = useMutation(api.agentGraphLayout.setNodeLayout);
  const vaultThread = useQuery(
    api.chat.index.getThreadForVault,
    vaultId ? { vaultId } : "skip",
  );
  const nodeLayouts = useQuery(
    api.agentGraphLayout.getNodeLayouts,
    vaultId ? { vaultId } : "skip",
  );
  const threadId = vaultId ? vaultThread?.threadId ?? pendingThreadId : null;
  const messages = useUIMessages(
    api.chat.index.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );
  const normalizedFilePath = filePath ? filePath : undefined;

  useEffect(() => {
    setPendingThreadId(null);
  }, [vaultId]);

  const layoutById = useMemo(() => {
    if (!nodeLayouts) {
      return null;
    }
    return new Map(nodeLayouts.map((layout) => [layout.nodeId, layout]));
  }, [nodeLayouts]);

  const baseNodes = useMemo(
    () =>
      nodes.map((node) => {
        const layout = layoutById?.get(node.id);
        const defaults =
          node.data.kind === "tool"
            ? DEFAULT_TOOL_NODE_SIZE
            : DEFAULT_AGENT_NODE_SIZE;
        return {
          ...node,
          width: layout?.width ?? node.width ?? defaults.width,
          height: layout?.height ?? node.height ?? defaults.height,
        };
      }),
    [nodes, layoutById],
  );
  const [graphNodes, setGraphNodes, onNodesChange] =
    useNodesState<AgentGraphNode>([]);

  useEffect(() => {
    setGraphNodes((current) => mergeGraphNodes(current, baseNodes));
  }, [baseNodes, setGraphNodes]);

  const nodeMessages = useMemo(() => {
    if (!threadId) return [];
    const filtered = messages.results.flatMap((message) => {
      if (message.role !== "assistant" && message.role !== "user") {
        return [];
      }
      const content = message.text ?? "";
      if (!content.trim()) {
        return [];
      }
      return [{ role: message.role, content }];
    });
    return filtered.length > MAX_NODE_MESSAGES
      ? filtered.slice(filtered.length - MAX_NODE_MESSAGES)
      : filtered;
  }, [messages.results, threadId]);

  const ensureThreadId = useCallback(async () => {
    if (threadId) return threadId;
    if (!vaultId) {
      throw new Error("Vault not available");
    }
    const createdId = await createThread({
      vaultId,
      repositoryFullName: repositoryFullName ?? undefined,
      branch,
      filePath: normalizedFilePath,
    });
    setPendingThreadId(createdId);
    return createdId;
  }, [
    threadId,
    vaultId,
    createThread,
    repositoryFullName,
    branch,
    normalizedFilePath,
  ]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!vaultId) {
        throw new Error("Vault not available");
      }
      const activeThreadId = await ensureThreadId();
      await sendMessage({
        threadId: activeThreadId,
        content,
        vaultId,
        branch,
        filePath: normalizedFilePath,
      });
    },
    [vaultId, ensureThreadId, sendMessage, branch, normalizedFilePath],
  );

  const handleResizeNode = useCallback(
    (
      nodeId: string,
      width: number,
      height: number,
      position?: { x: number; y: number },
    ) => {
      setGraphNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? { ...node, width, height, position: position ?? node.position }
            : node,
        ),
      );
    },
    [setGraphNodes],
  );

  const handleCommitResize = useCallback(
    (nodeId: string, width: number, height: number) => {
      if (!vaultId) {
        return;
      }
      void setNodeLayout({
        vaultId,
        nodeId,
        width,
        height,
      });
    },
    [setNodeLayout, vaultId],
  );

  const nodeTypes = useMemo(() => ({ agentNode: AgentNode }), []);
  const graphContextValue = useMemo(
    () => ({
      vaultId,
      onOpenFile,
      messages: nodeMessages,
      onSendMessage: handleSendMessage,
      onResizeNode: handleResizeNode,
      onCommitResize: handleCommitResize,
    }),
    [
      vaultId,
      onOpenFile,
      nodeMessages,
      handleSendMessage,
      handleResizeNode,
      handleCommitResize,
    ],
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
    <div className="relative h-full w-full rounded-md border border-border/50">
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
        <span>Zoom:</span>
        <KbdGroup>
          <Kbd>Cmd</Kbd>
          <span>/</span>
          <Kbd>Ctrl</Kbd>
        </KbdGroup>
        <span>+ scroll</span>
      </div>
      <AgentGraphChatContext.Provider value={graphContextValue}>
        <ReactFlow
          nodes={graphNodes}
          edges={styledEdges}
          nodesDraggable={false}
          nodesConnectable={false}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          zoomOnScroll={false}
          panOnScroll={false}
          zoomOnPinch={false}
          noWheelClassName="nowheel"
          noPanClassName="nopan"
          onInit={(instance) => {
            void instance.fitView({ padding: 0.2 });
          }}
        >
          <Background gap={16} size={1} />
          <Controls />
        </ReactFlow>
      </AgentGraphChatContext.Provider>
    </div>
  );
}
