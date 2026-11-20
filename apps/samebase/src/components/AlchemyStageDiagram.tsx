import { Graph, layout, type EdgeLabel, type GraphLabel, type NodeLabel } from "@dagrejs/dagre";
import { resourceTypeUI } from "@samebase/alchemy-kit/ui";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useReactFlow,
  useStore,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { AlchemyIsometricIcon } from "@/components/AlchemyIsometricIcon";
import type { DiagramBox, StageDiagram } from "@/components/alchemyStageDiagramModel";

const BOX_WIDTH = 248;

/** Border and padding, the icon row, the link row, and the "N more" row of a box, in pixels. */
const boxHeight = (box: DiagramBox) => 72 + (box.link ? 24 : 0) + (box.folded.length > 0 ? 20 : 0);

/** The space around the boxes of a namespace frame, and above them for its name. */
const FRAME_PADDING = 12;
const FRAME_TITLE = 24;

/** The smallest zoom of the diagram: below it, a narrow card scrolls the diagram sideways. */
const MIN_ZOOM = 0.6;

/** The strip below the boxes that holds the React Flow attribution. */
const ATTRIBUTION_HEIGHT = 18;

type BoxNode = Node<
  { box: DiagramBox; aside: ReactNode; open: boolean; onToggle: () => void },
  "box"
>;
type NamespaceNode = Node<{ name: string }, "namespace">;
type LineEdge = Edge<{ labels: string[]; dim: boolean }, "line">;

/**
Positions from dagre, left to right: a line between a box with a URL and a box without one starts
at the box with the URL, so boxes with a URL come first. A namespace is a dagre cluster, drawn as a frame around its boxes. The arrow of a line
points at the box that the other box depends on.
*/
function layoutDiagram({ boxes, edges }: StageDiagram) {
  const graph = new Graph<GraphLabel, NodeLabel, EdgeLabel>({ compound: true });
  const widestLabel = Math.max(0, ...edges.flatMap((edge) => edge.labels.map((l) => l.length)));
  graph.setGraph({
    rankdir: "LR",
    nodesep: 32,
    // A label is 11px monospace text, about 6.7px for each character.
    ranksep: Math.max(72, widestLabel * 6.7 + 48),
  });
  for (const box of boxes) {
    graph.setNode(box.id, { width: BOX_WIDTH, height: boxHeight(box) });
    if (box.namespace.length > 0) {
      const frame = `namespace:${box.namespace.join("/")}`;
      graph.setNode(frame, { width: 0, height: 0 });
      graph.setParent(box.id, frame);
    }
  }
  const lines = edges.map((edge, index) => {
    const dependent = edge.from === edge.b ? edge.b : edge.a;
    const other = dependent === edge.a ? edge.b : edge.a;
    const reversed = boxes[other].urls.length > 0 && boxes[dependent].urls.length === 0;
    const [source, target] = reversed ? [other, dependent] : [dependent, other];
    graph.setEdge(boxes[source].id, boxes[target].id, {});
    return {
      id: `line-${index}`,
      source: boxes[source].id,
      target: boxes[target].id,
      arrow: edge.from === null ? null : reversed ? "start" : "end",
      labels: edge.labels,
    };
  });
  // dagre puts every box without lines in its first column, so a box without lines or a URL gets a
  // hidden line from a box with a URL, of its own namespace when one has a URL.
  const linked = new Set(lines.flatMap((line) => [line.source, line.target]));
  for (const box of boxes.filter((box) => !linked.has(box.id) && box.urls.length === 0)) {
    const entries = boxes.filter((other) => other.urls.length > 0);
    const entry =
      entries.find((other) => other.namespace.join("/") === box.namespace.join("/")) ??
      entries.at(0);
    if (entry) {
      graph.setEdge(entry.id, box.id, {});
    }
  }
  layout(graph);

  // dagre sets `x` and `y`, the centre, of every node in `layout`.
  const placed = boxes.map((box) => {
    const { x = 0, y = 0, width, height } = graph.node(box.id);
    return { box, x: x - width / 2, y: y - height / 2, width, height };
  });
  const frames = [...new Set(boxes.map((box) => box.namespace.join("/")))]
    .filter((name) => name !== "")
    .map((name) => {
      const members = placed.filter((node) => node.box.namespace.join("/") === name);
      const x = Math.min(...members.map((node) => node.x)) - FRAME_PADDING;
      const y = Math.min(...members.map((node) => node.y)) - FRAME_PADDING - FRAME_TITLE;
      return {
        id: `namespace:${name}`,
        name,
        x,
        y,
        width: Math.max(...members.map((node) => node.x + node.width)) + FRAME_PADDING - x,
        height: Math.max(...members.map((node) => node.y + node.height)) + FRAME_PADDING - y,
      };
    });
  // The diagram starts at 0, 0.
  const extent = [...placed, ...frames];
  const left = Math.min(...extent.map((node) => node.x));
  const top = Math.min(...extent.map((node) => node.y));
  const shift = <T extends { x: number; y: number }>(node: T) => ({
    ...node,
    x: node.x - left,
    y: node.y - top,
  });
  return {
    placed: placed.map(shift),
    frames: frames.map(shift),
    lines,
    width: Math.max(...extent.map((node) => node.x + node.width)) - left,
    height: Math.max(...extent.map((node) => node.y + node.height)) - top,
  };
}

function BoxNodeView({ data: { box, aside, open, onToggle } }: NodeProps<BoxNode>) {
  return (
    <div
      className={`relative flex h-full flex-col border bg-background p-2.5 ${open ? "border-foreground" : ""}`}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="invisible" />
      <div className="flex h-[50px] items-center gap-2.5">
        <AlchemyIsometricIcon
          resourceType={box.resourceType}
          category={box.category}
          icon={box.icon}
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={open}
            className="cursor-pointer text-left font-mono text-[13px] leading-[17px] font-medium after:absolute after:inset-0"
            onClick={onToggle}
          >
            <span className="max-lines-2">{box.name}</span>
          </button>
          <div className="truncate text-xs text-muted-foreground">{box.typeName}</div>
        </div>
        {aside ? <div className="relative -mr-1.5 flex shrink-0 items-center">{aside}</div> : null}
      </div>
      {box.link ? (
        <a
          className="relative mt-1.5 truncate font-mono text-xs leading-[18px]"
          href={box.link}
          title={box.link}
          target="_blank"
          rel="noreferrer"
        >
          {new URL(box.link).host}
        </a>
      ) : null}
      {box.folded.length === 0 ? null : (
        <span className="mt-1 text-xs leading-4 text-muted-foreground">
          {box.folded.length} more
        </span>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} className="invisible" />
    </div>
  );
}

function NamespaceNodeView({ data: { name } }: NodeProps<NamespaceNode>) {
  return (
    <div className="h-full border">
      <span className="absolute top-1.5 left-2.5 font-mono text-xs text-muted-foreground">
        {name}
      </span>
    </div>
  );
}

function LineEdgeView({ data, ...props }: EdgeProps<LineEdge>) {
  const [path, labelX, labelY] = getBezierPath(props);
  return (
    <>
      <BaseEdge path={path} markerStart={props.markerStart} markerEnd={props.markerEnd} />
      {data && data.labels.length > 0 ? (
        <EdgeLabelRenderer>
          <div
            className={`absolute bg-background px-1 text-center font-mono text-[11px] leading-[14px] whitespace-pre text-muted-foreground transition-opacity ${data.dim ? "opacity-30" : ""}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data.labels.join("\n")}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const NODE_TYPES = { box: BoxNodeView, namespace: NamespaceNodeView };
const EDGE_TYPES = { line: LineEdgeView };

/**
Zooms the diagram to the width of its frame, between `MIN_ZOOM` and full size, at its top left.
It runs again when the frame changes width, such as when a phone turns.
*/
function FitWidth({ width }: { width: number }) {
  const { setViewport } = useReactFlow();
  const frame = useStore((state) => state.width);
  useEffect(() => {
    void setViewport({ x: 1, y: 1, zoom: Math.min(1, Math.max(MIN_ZOOM, (frame - 2) / width)) });
  }, [setViewport, frame, width]);
  return null;
}

function DiagramBoxDetails({ box }: { box: DiagramBox }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border p-3 text-xs">
      <dt className="text-muted-foreground">Type</dt>
      <dd>{box.typeName}</dd>
      <dt className="text-muted-foreground">Status</dt>
      <dd>{[...new Set(box.rows.map((row) => row.status))].join(", ")}</dd>
      {box.urls.length === 0 ? null : (
        <>
          <dt className="text-muted-foreground">URLs</dt>
          <dd className="grid min-w-0">
            {box.urls.map((url) => (
              <a
                key={url}
                className="break-all font-mono"
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                {url}
              </a>
            ))}
          </dd>
        </>
      )}
      {box.folded.length === 0 ? null : (
        <>
          <dt className="text-muted-foreground">Resources</dt>
          <dd className="grid min-w-0">
            {box.folded.map((row) => (
              <span key={row.fqn}>
                <span className="break-all font-mono">{row.logicalId}</span>{" "}
                <span className="text-muted-foreground">
                  {resourceTypeUI(row.resourceType).name}
                </span>
              </span>
            ))}
          </dd>
        </>
      )}
    </dl>
  );
}

/**
The main resources of a stage as boxes, with lines from `downstream`. Each box links to its Worker
or Convex app, and a click on the box opens its details below the diagram. Hovering or opening a box
dims the boxes and lines that do not touch it.

The diagram fits the width of its card, between `MIN_ZOOM` and full size, and its height follows.
A plain wheel or swipe scrolls the page: the diagram neither pans nor zooms, and a card too narrow
for `MIN_ZOOM` scrolls the diagram sideways.

`asides` are controls at the top right of a box, by box id, such as a menu of more links.
*/
export function AlchemyStageDiagram({
  diagram,
  asides,
}: {
  diagram: StageDiagram;
  asides?: ReadonlyMap<string, ReactNode>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const { placed, frames, lines, width, height } = useMemo(() => layoutDiagram(diagram), [diagram]);

  const active = hovered ?? selected;
  const touches = (line: { source: string; target: string }) =>
    line.source === active || line.target === active;
  const near = new Set(lines.flatMap((line) => (touches(line) ? [line.source, line.target] : [])));
  const dim = (id: string) => active !== null && id !== active && !near.has(id);

  const nodes: (BoxNode | NamespaceNode)[] = [
    ...frames.map((frame): NamespaceNode => ({
      id: frame.id,
      type: "namespace",
      position: { x: frame.x, y: frame.y },
      width: frame.width,
      height: frame.height,
      data: { name: frame.name },
    })),
    ...placed.map(({ box, x, y, width: w, height: h }): BoxNode => ({
      id: box.id,
      type: "box",
      position: { x, y },
      width: w,
      height: h,
      className: `transition-opacity ${dim(box.id) ? "opacity-40" : ""}`,
      data: {
        box,
        aside: asides?.get(box.id),
        open: box.id === selected,
        onToggle: () => setSelected((current) => (current === box.id ? null : box.id)),
      },
    })),
  ];
  const edges = lines.map(({ id, source, target, arrow, labels }): LineEdge => {
    const lit = active !== null && touches({ source, target });
    const color = lit ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))";
    const marker = { type: MarkerType.ArrowClosed, width: 14, height: 14, color };
    return {
      id,
      type: "line",
      source,
      target,
      ...(arrow === "start"
        ? { markerStart: marker }
        : arrow === "end"
          ? { markerEnd: marker }
          : {}),
      style: { stroke: color },
      className: `transition-opacity ${active !== null && !lit ? "opacity-30" : ""}`,
      data: { labels, dim: active !== null && !lit },
    };
  });
  const open = diagram.boxes.find((box) => box.id === selected);

  if (diagram.boxes.length === 0) {
    return null;
  }

  return (
    <div className="mb-2">
      <div className="@container overflow-x-auto">
        <div
          className="alchemy-stage-diagram"
          style={{
            width: `max(100%, ${Math.ceil(width * MIN_ZOOM) + 2}px)`,
            height: `calc(clamp(${Math.ceil(height * MIN_ZOOM)}px, ${(height / width) * 100}cqw, ${height + 2}px) + ${ATTRIBUTION_HEIGHT}px)`,
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            minZoom={MIN_ZOOM}
            maxZoom={1}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            panOnDrag={false}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            onNodeMouseEnter={(_event, node) => {
              if (node.type === "box") {
                setHovered(node.id);
              }
            }}
            onNodeMouseLeave={() => setHovered(null)}
            onPaneClick={() => setSelected(null)}
          >
            <FitWidth width={width} />
          </ReactFlow>
        </div>
      </div>
      {open ? <DiagramBoxDetails box={open} /> : null}
    </div>
  );
}
