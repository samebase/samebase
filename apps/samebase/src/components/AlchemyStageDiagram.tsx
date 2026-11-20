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
import { Clock } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useElementSize } from "@/hooks/useElementSize";
import { AlchemyIsometricIcon } from "@/components/AlchemyIsometricIcon";
import type { DiagramBox, StageDiagram } from "@/components/alchemyStageDiagramModel";

const BOX_WIDTH = 248;

/** The space between two boxes of a column, or of a row, which a phone has less room for. */
const NODE_GAP = { LR: 32, TB: 24 } as const;

/** Border and padding, the icon row, the link row, and the "N more" row of a box, in pixels. */
const boxHeight = (box: DiagramBox) => 72 + (box.link ? 24 : 0) + (box.folded.length > 0 ? 20 : 0);

/** The space around the boxes of a namespace frame, and above them for its name. */
const FRAME_PADDING = 12;
const FRAME_TITLE = 24;

/** The smallest zoom of the diagram: below it, a narrow card scrolls the diagram sideways. */
const MIN_ZOOM = 0.6;

type BoxNode = Node<
  { box: DiagramBox; aside: ReactNode; open: boolean; onToggle: () => void },
  "box"
>;
type NamespaceNode = Node<{ name: string }, "namespace">;
type LineEdge = Edge<
  { labels: string[]; dim: boolean; points: { x: number; y: number }[] },
  "line"
>;

/** The Alchemy statuses of a row after its last apply finished. */
const SETTLED = new Set(["created", "updated"]);

/**
Positions from dagre, left to right (`LR`) or top to bottom (`TB`): a line between a box with a URL
and a box without one starts at the box with the URL, so boxes with a URL come first. A namespace is
a dagre cluster, drawn as a frame around its boxes. The arrow of a line points at the box that the
other box depends on.
*/
function layoutDiagram(
  { boxes, edges }: StageDiagram,
  { rankdir, columns }: { rankdir: "LR" | "TB"; columns: number },
) {
  const graph = new Graph<GraphLabel, NodeLabel, EdgeLabel>({ compound: true });
  const labels = edges.map((edge) => edge.labels);
  graph.setGraph({
    rankdir,
    nodesep: NODE_GAP[rankdir],
    // A label is 11px monospace text, about 6.7px for each character and 14px for each line.
    ranksep:
      rankdir === "LR"
        ? Math.max(72, Math.max(0, ...labels.flat().map((label) => label.length)) * 6.7 + 48)
        : Math.max(56, Math.max(0, ...labels.map((lines) => lines.length)) * 14 + 32),
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
  // A row of a top to bottom diagram holds at most `columns` boxes: a hidden line from the box
  // `columns` places to the left moves each other box one row down. Moving boxes can fill a lower
  // row, so this runs until no row is too long, at most once for each box.
  for (let pass = 0; rankdir === "TB" && pass < boxes.length; pass++) {
    const rows = new Map<number, string[]>();
    for (const { id } of [...boxes].sort(
      (a, b) => (graph.node(a.id).x ?? 0) - (graph.node(b.id).x ?? 0),
    )) {
      const y = graph.node(id).y ?? 0;
      rows.set(y, [...(rows.get(y) ?? []), id]);
    }
    const extra = [...rows.values()].flatMap((row) =>
      row.slice(columns).map((id, index) => [row[index], id] as const),
    );
    if (extra.length === 0) {
      break;
    }
    for (const [above, below] of extra) {
      graph.setEdge(above, below, {});
    }
    layout(graph);
  }

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
  // A top to bottom line follows the points of dagre, which pass beside the boxes of the rows that
  // the line crosses. A left to right line is a curve straight from box to box.
  const routed = lines.map((line) => ({
    ...line,
    points: rankdir === "TB" ? (graph.edge(line.source, line.target).points ?? []) : [],
  }));
  // The diagram starts at 0, 0.
  const extent = [
    ...placed,
    ...frames,
    ...routed.flatMap((line) => line.points.map((point) => ({ ...point, width: 0, height: 0 }))),
  ];
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
    lines: routed.map((line) => ({ ...line, points: line.points.map(shift) })),
    width: Math.max(...extent.map((node) => node.x + node.width)) - left,
    height: Math.max(...extent.map((node) => node.y + node.height)) - top,
  };
}

/**
The top to bottom layout of a card too narrow for the left to right layout `wide` at `MIN_ZOOM`,
such as on a phone, or null when `wide` fits. A row holds any number of boxes when they fit at
`MIN_ZOOM`, or else as many as fit, fewer when the lines beside the boxes need the room. When no
count fits, such as when a namespace frame sits beside another box, the narrowest layout wins, the
one with more boxes in a row on a tie.
*/
function tallLayout(diagram: StageDiagram, wide: DiagramLayout, cardWidth: number) {
  const fits = (layout: DiagramLayout) => layout.width * MIN_ZOOM + 2 <= cardWidth;
  if (fits(wide)) {
    return null;
  }
  const most = Math.floor(((cardWidth - 2) / MIN_ZOOM + NODE_GAP.TB) / (BOX_WIDTH + NODE_GAP.TB));
  let best = layoutDiagram(diagram, { rankdir: "TB", columns: Infinity });
  for (let columns = most; columns >= 1 && !fits(best); columns--) {
    const tall = layoutDiagram(diagram, { rankdir: "TB", columns });
    if (tall.width < best.width) {
      best = tall;
    }
  }
  return best;
}

type DiagramLayout = ReturnType<typeof layoutDiagram>;

function BoxNodeView({
  data: { box, aside, open, onToggle },
  sourcePosition = Position.Right,
  targetPosition = Position.Left,
}: NodeProps<BoxNode>) {
  const schedule = box.rows.flatMap((row) => row.facts).find((fact) => fact.clock)?.value;
  const unsettled = [
    ...new Set(box.rows.map((row) => row.status).filter((status) => !SETTLED.has(status))),
  ];
  return (
    <div
      className={`relative flex h-full flex-col border bg-background p-2.5 ${open ? "border-foreground" : ""}`}
    >
      <Handle type="target" position={targetPosition} isConnectable={false} className="invisible" />
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
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{box.typeName}</span>
            {schedule ? (
              <span className="shrink-0" title={schedule}>
                <Clock aria-hidden="true" className="size-3" />
                <span className="sr-only">{schedule}</span>
              </span>
            ) : null}
            {unsettled.length > 0 ? (
              <span className="shrink-0 text-amber-700 dark:text-amber-300">
                {unsettled.join(", ")}
              </span>
            ) : null}
          </div>
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
      <Handle type="source" position={sourcePosition} isConnectable={false} className="invisible" />
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

/**
A smooth path through `points`: straight to the middle of the first segment, then a curve through
each inner point to the middle of the next segment, and straight to the last point.
*/
function pathThrough(points: { x: number; y: number }[]) {
  const middle = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    `${(a.x + b.x) / 2},${(a.y + b.y) / 2}`;
  const inner = points.slice(1, -1).map((point, index) => {
    return `Q${point.x},${point.y} ${middle(point, points[index + 2])}`;
  });
  const [first, second] = points;
  const last = points[points.length - 1];
  return `M${first.x},${first.y} L${middle(first, second)} ${inner.join(" ")} L${last.x},${last.y}`;
}

function LineEdgeView({ data, ...props }: EdgeProps<LineEdge>) {
  const points = data?.points ?? [];
  const label = points[Math.floor(points.length / 2)];
  const [path, labelX, labelY] =
    points.length >= 2 ? [pathThrough(points), label.x, label.y] : getBezierPath(props);
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
React Flow always renders hidden texts that say boxes and lines can be selected, moved and deleted
with the keyboard. The diagram is read-only: its buttons and links inside the boxes take the focus.
*/
const READ_ONLY_ARIA_LABELS = {
  "node.a11yDescription.default": "",
  "node.a11yDescription.keyboardDisabled": "",
  "edge.a11yDescription.default": "",
} as const;

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
      {box.rows
        .filter((row) => row.facts.length > 0)
        .map((row) => (
          <Fragment key={row.fqn}>
            {box.rows.length > 1 ? (
              <dt className="col-span-2 mt-1 break-all font-mono">{row.logicalId}</dt>
            ) : null}
            {row.facts.map((fact) => (
              <Fragment key={fact.label}>
                <dt className="text-muted-foreground">{fact.label}</dt>
                <dd className="break-words">{fact.value}</dd>
              </Fragment>
            ))}
          </Fragment>
        ))}
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
A plain wheel or swipe scrolls the page: the diagram neither pans nor zooms. A card too narrow for
the left to right diagram at `MIN_ZOOM` draws it top to bottom, and scrolls it sideways when that is
still too wide.

A box shows a clock when a row has a schedule, and the status of a row whose apply has not finished,
such as `updating`. Its details list the facts of its rows (`resourceFacts`).

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
  const [cardWidth, setCardWidth] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useElementSize(cardRef, ({ widthPx }) => setCardWidth(widthPx));
  const wide = useMemo(
    () => layoutDiagram(diagram, { rankdir: "LR", columns: Infinity }),
    [diagram],
  );
  const tall = useMemo(
    () => (cardWidth === null ? null : tallLayout(diagram, wide, cardWidth)),
    [diagram, wide, cardWidth],
  );
  const { placed, frames, lines, width, height } = tall ?? wide;
  const [targetPosition, sourcePosition] = tall
    ? [Position.Top, Position.Bottom]
    : [Position.Left, Position.Right];

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
      sourcePosition,
      targetPosition,
      className: `transition-opacity ${dim(box.id) ? "opacity-40" : ""}`,
      data: {
        box,
        aside: asides?.get(box.id),
        open: box.id === selected,
        onToggle: () => setSelected((current) => (current === box.id ? null : box.id)),
      },
    })),
  ];
  const edges = lines.map(({ id, source, target, arrow, labels, points }): LineEdge => {
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
      data: { labels, dim: active !== null && !lit, points },
    };
  });
  const open = diagram.boxes.find((box) => box.id === selected);

  if (diagram.boxes.length === 0) {
    return null;
  }

  return (
    <div className="mb-2">
      <div ref={cardRef} className="@container overflow-x-auto">
        <div
          style={{
            width: `max(100%, ${Math.ceil(width * MIN_ZOOM) + 2}px)`,
            height: `clamp(${Math.ceil(height * MIN_ZOOM)}px, ${(height / width) * 100}cqw, ${height + 2}px)`,
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
            deleteKeyCode={null}
            disableKeyboardA11y
            ariaLabelConfig={READ_ONLY_ARIA_LABELS}
            panOnDrag={false}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            proOptions={{ hideAttribution: true }}
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
