import {
  Background,
  type ReactFlowInstance,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { ArrowRight, Expand, GitFork, Maximize, Minus, Network, Plus, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { AlchemyStage } from "../../shared/alchemyStateModel";
import { useElementSize } from "@/hooks/useElementSize";
import { AlchemyResourceGlyph } from "./AlchemyResourceGlyph";
import { stageTopology, type TopologyNode } from "./stageTopology";
import { layoutStageTopology } from "./stageTopologyLayout";
import "./alchemySystemDiagram.css";

type Layer = "bindings" | "dependencies";
type ResourceTile = Node<
  {
    resource: TopologyNode;
    emphasis: "normal" | "selected" | "neighbor" | "muted";
    inspect: (id: string) => void;
  },
  "resource"
>;

function ResourceNode({ data }: NodeProps<ResourceTile>) {
  const { resource, emphasis, inspect } = data;
  return (
    <>
      {Object.values(Position).map((position) => (
        <span key={position}>
          <Handle type="source" id={`out-${position}`} position={position} isConnectable={false} />
          <Handle type="target" id={`in-${position}`} position={position} isConnectable={false} />
        </span>
      ))}
      <button
        type="button"
        className="system-node nodrag nopan"
        data-kind={resource.kind}
        data-emphasis={emphasis}
        aria-label={`Inspect ${resource.name}, ${resource.type}`}
        aria-pressed={emphasis === "selected"}
        onClick={() => inspect(resource.id)}
      >
        <AlchemyResourceGlyph kind={resource.kind} />
        <span className="system-name" title={resource.name}>
          {resource.name}
        </span>
        <span className="system-type">{resource.type}</span>
      </button>
    </>
  );
}
const nodeTypes = { resource: ResourceNode };
const fitOptions = { padding: 0.13, maxZoom: 1.26 };
const layers = [
  { value: "bindings", label: "Worker bindings", icon: Network },
  { value: "dependencies", label: "Deploy dependencies", icon: GitFork },
] as const;

export function AlchemySystemDiagram({
  stage,
  layer: requestedLayer,
  onLayerChange,
}: {
  stage: Pick<AlchemyStage, "resources">;
  layer?: Layer;
  onLayerChange: (layer: Layer) => void;
}) {
  const topology = useMemo(() => stageTopology(stage), [stage]);
  const layer = requestedLayer ?? (topology.bindings.edges.length ? "bindings" : "dependencies");
  const graph = topology[layer];
  const [selected, setSelected] = useState<string>();
  const camera = useRef<ReactFlowInstance<ResourceTile, Edge> | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useElementSize(board, ({ widthPx }) => setNarrow(widthPx > 0 && widthPx < 520));
  const positions = useMemo(
    () => layoutStageTopology(graph.nodes, graph.edges, layer, narrow),
    [graph, layer, narrow],
  );
  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph]);
  const current = selected ? byId.get(selected) : undefined;
  const incident = graph.edges.filter(
    (edge) => edge.source === current?.id || edge.target === current?.id,
  );
  const neighbors = new Set(incident.flatMap((edge) => [edge.source, edge.target]));
  const nodes: ResourceTile[] = graph.nodes.map((resource) => ({
    id: resource.id,
    type: "resource",
    position: positions.get(resource.id)!,
    width: 184,
    height: 108,
    data: {
      resource,
      inspect: setSelected,
      emphasis: !current
        ? "normal"
        : current.id === resource.id
          ? "selected"
          : neighbors.has(resource.id)
            ? "neighbor"
            : "muted",
    },
  }));
  // Several binding names can refer to the same endpoint. Draw one wire and keep each name in the inspector.
  const pairs = new Map<string, { source: string; target: string; labels: string[] }>();
  for (const edge of graph.edges) {
    const key = JSON.stringify([edge.source, edge.target]);
    const pair = pairs.get(key);
    if (pair) pair.labels.push(edge.label);
    else pairs.set(key, { source: edge.source, target: edge.target, labels: [edge.label] });
  }
  const edges: Edge[] = [...pairs].map(([id, { source, target, labels }]) => {
    const from = positions.get(source)!;
    const to = positions.get(target)!;
    const endpoint = byId.get(target)!;
    const vertical = layer === "bindings" && (endpoint.kind === "worker" ? narrow : !narrow);
    const outgoing = vertical
      ? to.y >= from.y
        ? Position.Bottom
        : Position.Top
      : to.x >= from.x
        ? Position.Right
        : Position.Left;
    const incoming =
      source === target
        ? Position.Top
        : {
            [Position.Top]: Position.Bottom,
            [Position.Bottom]: Position.Top,
            [Position.Left]: Position.Right,
            [Position.Right]: Position.Left,
          }[outgoing];
    const highlighted = current && (source === current.id || target === current.id);
    const opacity = current && !highlighted ? 0.16 : 1;
    const service = layer === "bindings" && endpoint.kind === "worker";
    const color = highlighted || service ? "var(--system-accent)" : "var(--system-wire)";
    return {
      id,
      source,
      target,
      sourceHandle: `out-${outgoing}`,
      targetHandle: `in-${incoming}`,
      label: labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0],

      style: {
        stroke: color,
        strokeWidth: service || highlighted ? 2.6 : 1.7,
        opacity,
        strokeDasharray: layer === "dependencies" ? "6 4" : undefined,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 13, height: 13 },
      labelStyle: {
        fill: service ? "var(--system-accent)" : "var(--system-text)",
        fontWeight: 600,
        fontSize: 11.5,
        opacity,
      },
      labelBgStyle: { fill: "var(--system-paper)", opacity },
      labelBgPadding: [5, 3],
      labelBgBorderRadius: 4,
    };
  });
  const config = current
    ? (topology.workerBindings.get(current.id) ?? []).filter((binding) => !binding.endpoint)
    : [];
  if (!graph.nodes.length)
    return (
      <div ref={board} className="text-sm text-muted-foreground">
        This stage has no resources.
      </div>
    );
  return (
    <div className="system-board" ref={board} aria-label="System diagram">
      <header className="system-toolbar">
        <div className="system-layers" role="group" aria-label="Diagram connections">
          {layers.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === layer}
              onClick={() => onLayerChange(value)}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        <span className="system-count">
          {graph.nodes.length} nodes <span>·</span> {graph.edges.length}{" "}
          {graph.edges.length === 1 ? "link" : "links"}
        </span>
      </header>
      <div className="system-canvas">
        <ReactFlow<ResourceTile, Edge>
          key={`${layer}-${narrow}`}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            camera.current = instance;
          }}
          fitView
          fitViewOptions={fitOptions}
          minZoom={0.12}
          maxZoom={2.8}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          onPaneClick={() => setSelected(undefined)}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={19} size={1} color="var(--system-dots)" />
        </ReactFlow>
      </div>
      <footer className="system-legend">
        <span className="system-line" data-layer={layer} aria-hidden="true" />
        {layer === "bindings" ? "Worker → binding target" : "Input → dependent resource"}
        {!graph.edges.length && (
          <span className="system-zero">
            No recorded {layer === "bindings" ? "binding targets" : "dependencies"}
          </span>
        )}
        <div className="system-camera" role="group" aria-label="Diagram controls">
          <button
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => void camera.current?.zoomIn()}
          >
            <Plus size={14} />
          </button>
          <button
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => void camera.current?.zoomOut()}
          >
            <Minus size={14} />
          </button>
          <button
            title="Fit diagram"
            aria-label="Fit diagram"
            onClick={() => void camera.current?.fitView(fitOptions)}
          >
            <Maximize size={14} />
          </button>
          {typeof document !== "undefined" && document.fullscreenEnabled && (
            <button
              title="Toggle full screen"
              aria-label="Toggle full screen"
              onClick={() => {
                if (document.fullscreenElement === board.current) void document.exitFullscreen();
                else void board.current?.requestFullscreen();
              }}
            >
              <Expand size={14} />
            </button>
          )}
        </div>
      </footer>
      {current && (
        <aside className="system-inspector" aria-label="Selected resource">
          <header>
            <span className="system-small-glyph" data-kind={current.kind}>
              <AlchemyResourceGlyph kind={current.kind} />
            </span>
            <div>
              <strong>{current.name}</strong>
              <p>{[current.type, current.detail, current.status].filter(Boolean).join(" · ")}</p>
            </div>
            <button
              className="system-dismiss"
              aria-label="Close resource details"
              onClick={() => setSelected(undefined)}
            >
              <X size={16} />
            </button>
          </header>
          {incident.length > 0 ? (
            <ul className="system-links">
              {incident.map((edge) => {
                const outgoing = edge.source === current.id;
                const peer = byId.get(outgoing ? edge.target : edge.source)!;
                return (
                  <li key={edge.id}>
                    <span>{edge.label || (outgoing ? "Used by" : "Depends on")}</span>
                    <ArrowRight
                      size={13}
                      style={{ transform: !outgoing && edge.label ? "rotate(180deg)" : undefined }}
                    />
                    <button onClick={() => setSelected(peer.id)}>{peer.name}</button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="system-none">
              No recorded {layer === "bindings" ? "binding targets" : "dependencies"} for this
              resource.
            </p>
          )}
          {config.length > 0 && (
            <details className="system-config">
              <summary>Other Worker bindings ({config.length})</summary>
              <dl>
                {config.map((binding, i) => (
                  <div key={`${binding.name}-${i}`}>
                    <dt>{binding.name}</dt>
                    <dd>{binding.label}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </aside>
      )}
    </div>
  );
}
