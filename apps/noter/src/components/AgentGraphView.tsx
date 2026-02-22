import { useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";

export type AgentGraphNode = Node<{ label: string; path: string }>;
export type AgentGraphEdge = Edge;

type AgentGraphViewProps = {
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
  onOpenFile: (path: string) => void;
};

export function AgentGraphView({
  nodes,
  edges,
  onOpenFile,
}: AgentGraphViewProps) {
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: AgentGraphNode) => {
      event.preventDefault();
      onOpenFile(node.data.path);
    },
    [onOpenFile],
  );

  return (
    <div className="h-full w-full rounded-md border border-border/50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView={nodes.length > 0}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={handleNodeClick}
      >
        <Background gap={16} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
