import { Graph, layout, type EdgeLabel, type GraphLabel, type NodeLabel } from "@dagrejs/dagre";
import { resourceTypeUI } from "@samebase/alchemy-kit/ui";
import { Clock } from "lucide-react";
import { Fragment, type ReactNode, useId, useMemo, useState } from "react";
import { AlchemyIsometricIcon } from "@/components/AlchemyIsometricIcon";
import { KitIcon } from "@/components/KitIcon";
import type { DiagramBox, StageDiagram } from "@samebase/alchemy-kit/stack";

const BOX_WIDTH = 248;

/** The space between two boxes of a column, or of a row, which a phone has less room for. */
const NODE_GAP = { LR: 32, TB: 24 } as const;

/**
Border and padding, the icon row, the link row, the bindings with the space above them, and the
"N more" row of a box, in pixels.
*/
const boxHeight = (box: DiagramBox) =>
  72 +
  (box.link ? 24 : 0) +
  (box.bindings.length > 0 ? 8 + box.bindings.length * 20 : 0) +
  (box.folded.length > 0 ? 20 : 0);

/** The space around the boxes of a namespace frame, and above them for its name. */
const FRAME_PADDING = 12;
const FRAME_TITLE = 24;

/** The smallest zoom of each layout but the narrowest: below it, the card shows a narrower layout. */
const MIN_ZOOM = 0.6;

/** The Alchemy statuses of a row after its last apply finished. */
const SETTLED = new Set(["created", "updated"]);

/**
Positions from dagre, left to right (`LR`) or top to bottom (`TB`): a line between a box with a URL
and a box without one starts at the box with the URL, so boxes with a URL come first. A namespace is
a dagre cluster, drawn as a frame around its boxes. The arrow of a line points at the box that the
other box depends on.
*/
function layoutDiagram(
  { boxes, lines: diagramLines }: StageDiagram,
  { rankdir, columns }: { rankdir: "LR" | "TB"; columns: number },
) {
  const graph = new Graph<GraphLabel, NodeLabel, EdgeLabel>({ compound: true });
  const labels = diagramLines.map((line) => line.labels);
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
  const lines = diagramLines.map((line, index) => {
    const dependent = line.from === line.b ? line.b : line.a;
    const other = dependent === line.a ? line.b : line.a;
    const reversed = other.urls.length > 0 && dependent.urls.length === 0;
    const [source, target] = reversed ? [other, dependent] : [dependent, other];
    graph.setEdge(source.id, target.id, {});
    return {
      id: `line-${index}`,
      source: source.id,
      target: target.id,
      arrow: line.from === null ? null : reversed ? "start" : "end",
      labels: line.labels,
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
  // the line crosses. A left to right line goes from the middle of the right side of one box to the
  // middle of the left side of the other, and the diagram draws it as a curve.
  const middleOfSide = (id: string, side: "left" | "right") => {
    const node = placed.find((candidate) => candidate.box.id === id) ?? placed[0];
    return { x: side === "left" ? node.x : node.x + node.width, y: node.y + node.height / 2 };
  };
  const routed = lines.map((line) => ({
    ...line,
    points:
      rankdir === "TB"
        ? (graph.edge(line.source, line.target).points ?? [])
        : [middleOfSide(line.source, "right"), middleOfSide(line.target, "left")],
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
    rankdir,
    placed: placed.map(shift),
    frames: frames.map(shift),
    lines: routed.map((line) => ({ ...line, points: line.points.map(shift) })),
    width: Math.max(...extent.map((node) => node.x + node.width)) - left,
    height: Math.max(...extent.map((node) => node.y + node.height)) - top,
  };
}

type DiagramLayout = ReturnType<typeof layoutDiagram>;

/** The card width in CSS pixels from which `layout` fits at `MIN_ZOOM`, with the card border. */
const fitsFrom = (layout: DiagramLayout) => Math.ceil(layout.width * MIN_ZOOM) + 2;

/**
The layouts that a card can show, widest first: left to right, then top to bottom with any number of
boxes in a row, then with fewer boxes in a row, down to one. Each keeps only a layout narrower than
the one before it. A card shows the first layout that fits its width at `MIN_ZOOM`, or the last one.
*/
function diagramLayouts(diagram: StageDiagram) {
  const layouts = [
    layoutDiagram(diagram, { rankdir: "LR", columns: Infinity }),
    layoutDiagram(diagram, { rankdir: "TB", columns: Infinity }),
    ...Array.from({ length: diagram.boxes.length - 1 }, (_, index) =>
      layoutDiagram(diagram, { rankdir: "TB", columns: diagram.boxes.length - 1 - index }),
    ),
  ];
  return layouts.filter((layout, index) =>
    layouts.slice(0, index).every((wider) => fitsFrom(layout) < fitsFrom(wider)),
  );
}

/**
A CSS length for the layout that the card shows: `pick(layout)` pixels of that layout, at its zoom.
Layout `i` holds from its own `fitsFrom` up to that of the layout before it, and the last one below
that. Each layout gives a term that is its length while the card width (`100cqw`) is in its range and
0 outside it: `min` with the distance to each end of the range times 100000 cuts it to 0, and `max`
keeps it from going below 0. The sum is the length of the one layout in range.

The zoom of a layout is the card width over the layout width, between `MIN_ZOOM` and 1, as a length:
the CSS pixels of one pixel of the layout. The narrowest layout has no smallest zoom, so it always
fits the card. Each length is in the element's own style, so the browser
places an element as soon as it reads it, also while the rest of the HTML is still on its way.
*/
function across(layouts: DiagramLayout[], pick: (layout: DiagramLayout, index: number) => number) {
  const terms = layouts.map((layout, index) => {
    // The narrowest layout shrinks below `MIN_ZOOM` to the card width: a phone zooms the page instead.
    const zoom =
      index === layouts.length - 1
        ? `min((100cqw - 2px) / ${layout.width}, 1px)`
        : `clamp(${MIN_ZOOM}px, (100cqw - 2px) / ${layout.width}, 1px)`;
    const value = `${pick(layout, index)} * ${zoom}`;
    const ends = [
      ...(index === layouts.length - 1 ? [] : [`(100cqw - ${fitsFrom(layout) - 0.01}px) * 100000`]),
      ...(index === 0 ? [] : [`(${fitsFrom(layouts[index - 1])}px - 100cqw) * 100000`]),
    ];
    return ends.length === 0 ? value : `max(0px, min(${value}, ${ends.join(", ")}))`;
  });
  return `calc(${terms.join(" + ")})`;
}

/** A curve from the first point to the last that leaves and arrives level, as between two box sides. */
function curveBetween(points: { x: number; y: number }[]) {
  const [start] = points;
  const end = points[points.length - 1];
  const bend = Math.abs(end.x - start.x) / 2;
  return `M${start.x},${start.y} C${start.x + bend},${start.y} ${end.x - bend},${end.y} ${end.x},${end.y}`;
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

function DiagramBoxView({
  box,
  aside,
  open,
  dim,
  onToggle,
  onHover,
}: {
  box: DiagramBox;
  aside: ReactNode;
  open: boolean;
  dim: boolean;
  onToggle: () => void;
  onHover: (hovered: boolean) => void;
}) {
  const schedule = box.rows.flatMap((row) => row.facts).find((fact) => fact.clock)?.value;
  const unsettled = [
    ...new Set(box.rows.map((row) => row.status).filter((status) => !SETTLED.has(status))),
  ];
  return (
    <div
      className={`flex h-full flex-col border bg-background p-[0.625em] transition-opacity ${open ? "border-foreground" : ""} ${dim ? "opacity-40" : ""}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div className="flex h-[3.125em] items-center gap-[0.625em]">
        <AlchemyIsometricIcon
          resourceType={box.resourceType}
          category={box.category}
          icon={box.icon}
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={open}
            className="cursor-pointer text-left font-mono text-[0.8125em] leading-[1.3] font-medium after:absolute after:inset-0"
            onClick={onToggle}
          >
            <span className="max-lines-2">{box.name}</span>
          </button>
          <div className="flex items-center gap-[0.5em] text-[0.75em] leading-[1.33] text-muted-foreground">
            <span className="truncate">{box.typeName}</span>
            {schedule ? (
              <span className="shrink-0" title={schedule}>
                <Clock aria-hidden="true" className="size-[1em]" />
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
          className="relative mt-[0.5em] truncate font-mono text-[0.75em] leading-[1.5]"
          href={box.link}
          title={box.link}
          target="_blank"
          rel="noreferrer"
        >
          {new URL(box.link).host}
        </a>
      ) : null}
      {box.bindings.length === 0 ? null : (
        <ul className="mt-[0.667em] text-[0.75em] leading-[1.667]" aria-label="Bindings">
          {box.bindings.map((binding) => (
            <li key={binding.name} className="flex items-center gap-[0.5em]" title={binding.kind}>
              <KitIcon
                icon={binding.icon}
                className="size-[1.167em] shrink-0 text-muted-foreground"
              />
              <span className="sr-only">{binding.kind}</span>
              <span className="font-mono">{binding.name}</span>
              {binding.box || binding.target ? (
                <span className="truncate text-muted-foreground">
                  → {binding.box?.name ?? binding.target}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {box.folded.length === 0 ? null : (
        <span className="mt-[0.333em] text-[0.75em] leading-[1.33] text-muted-foreground">
          {box.folded.length} more
        </span>
      )}
    </div>
  );
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

The server renders the diagram at its final size, with no script: each element has its size and
place in its own style, from the card width (`100cqw`), for the widest layout that fits the card at
`MIN_ZOOM` (`diagramLayouts`, `across`). The text of a box is in em, so it follows the zoom. The
diagram takes no wheel, swipe or pinch, so they scroll and zoom the page.

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
  // An id for the arrow markers of this diagram, from React's id without the characters that a URL
  // fragment would need to escape.
  const id = `diagram-${useId().replace(/[^\w-]/g, "")}`;
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const layouts = useMemo(() => diagramLayouts(diagram), [diagram]);
  if (diagram.boxes.length === 0) {
    return null;
  }

  const active = hovered ?? selected;
  const open = diagram.boxes.find((box) => box.id === selected);
  // Every layout has the same boxes, frames and lines, in the same order.
  const [{ lines, frames }] = layouts;
  const touches = (line: { source: string; target: string }) =>
    line.source === active || line.target === active;
  const near = new Set(lines.flatMap((line) => (touches(line) ? [line.source, line.target] : [])));
  const marker = (lit: boolean) => `url(#${id}-${lit ? "lit" : "dim"})`;
  // The middle of a curve of two points is halfway between them; a top to bottom line has an odd
  // number of points, with the middle one on the line.
  const middle = ({ points }: DiagramLayout["lines"][number]) => {
    const [first, second] = points;
    return points.length === 2
      ? { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
      : (points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 });
  };
  return (
    <div className="mb-2">
      <div className="@container">
        <div
          className="relative"
          style={{
            width: across(layouts, (layout) => layout.width),
            height: across(layouts, (layout) => layout.height),
            fontSize: across(layouts, () => 16),
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelected(null);
            }
          }}
        >
          <svg aria-hidden="true" className="absolute size-0">
            <defs>
              {[false, true].map((lit) => (
                <marker
                  key={String(lit)}
                  id={`${id}-${lit ? "lit" : "dim"}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="12"
                  markerHeight="12"
                  markerUnits="userSpaceOnUse"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M0,1 L9,5 L0,9 Z"
                    className={lit ? "fill-foreground" : "fill-muted-foreground"}
                  />
                </marker>
              ))}
            </defs>
          </svg>
          {layouts.map((layout, index) => (
            // The lines of one layout: 0 by 0 while the card shows another layout.
            <svg
              key={index}
              aria-hidden="true"
              className="pointer-events-none absolute top-0 left-0"
              style={{
                width: across(layouts, (other, at) => (at === index ? other.width : 0)),
                height: across(layouts, (other, at) => (at === index ? other.height : 0)),
              }}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
            >
              {layout.lines.map((line) => {
                const lit = active !== null && touches(line);
                return (
                  <path
                    key={line.id}
                    d={
                      layout.rankdir === "LR" ? curveBetween(line.points) : pathThrough(line.points)
                    }
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                    className={`transition-opacity ${lit ? "stroke-foreground" : "stroke-muted-foreground"} ${active !== null && !lit ? "opacity-30" : ""}`}
                    markerStart={line.arrow === "start" ? marker(lit) : undefined}
                    markerEnd={line.arrow === "end" ? marker(lit) : undefined}
                  />
                );
              })}
            </svg>
          ))}
          {frames.map((frame, number) => (
            <div
              key={frame.id}
              className="absolute border"
              style={{
                left: across(layouts, (layout) => layout.frames[number].x),
                top: across(layouts, (layout) => layout.frames[number].y),
                width: across(layouts, (layout) => layout.frames[number].width),
                height: across(layouts, (layout) => layout.frames[number].height),
              }}
            >
              <span className="absolute top-[0.5em] left-[0.833em] font-mono text-[0.75em] text-muted-foreground">
                {frame.name}
              </span>
            </div>
          ))}
          {lines.map((line, number) =>
            line.labels.length === 0 ? null : (
              <div
                key={line.id}
                className={`absolute -translate-1/2 bg-background px-[0.36em] text-center font-mono text-[0.6875em] leading-[1.27] whitespace-pre text-muted-foreground transition-opacity ${active !== null && !touches(line) ? "opacity-30" : ""}`}
                style={{
                  left: across(layouts, (layout) => middle(layout.lines[number]).x),
                  top: across(layouts, (layout) => middle(layout.lines[number]).y),
                }}
              >
                {line.labels.join("\n")}
              </div>
            ),
          )}
          {diagram.boxes.map((box, number) => (
            <div
              key={box.id}
              className="absolute"
              style={{
                left: across(layouts, (layout) => layout.placed[number].x),
                top: across(layouts, (layout) => layout.placed[number].y),
                width: across(layouts, (layout) => layout.placed[number].width),
                height: across(layouts, (layout) => layout.placed[number].height),
              }}
            >
              <DiagramBoxView
                box={box}
                aside={asides?.get(box.id)}
                open={box.id === selected}
                dim={active !== null && box.id !== active && !near.has(box.id)}
                onToggle={() => setSelected((current) => (current === box.id ? null : box.id))}
                onHover={(over) => setHovered(over ? box.id : null)}
              />
            </div>
          ))}
        </div>
      </div>
      {open ? <DiagramBoxDetails box={open} /> : null}
    </div>
  );
}
