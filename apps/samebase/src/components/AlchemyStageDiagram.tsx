import { resourceTypeUI, type ResourceCategory } from "@samebase/alchemy-kit/ui";
import { createElement, type ReactNode, useId, useState } from "react";
import {
  type DiagramBox,
  layoutDiagram,
  type StageDiagram,
} from "@/components/alchemyStageDiagramModel";

/** The palette of each category in `index.css`. Categories without one of their own use `other`. */
const ICON_PALETTES = {
  compute: "iso-compute",
  database: "iso-database",
  storage: "iso-storage",
  queue: "iso-queue",
  email: "iso-email",
  network: "iso-other",
  dns: "iso-other",
  eventing: "iso-other",
  ai: "iso-other",
  auth: "iso-other",
  security: "iso-other",
  observability: "iso-other",
  cdn: "iso-other",
  media: "iso-other",
  config: "iso-other",
  billing: "iso-other",
  other: "iso-other",
} satisfies Record<ResourceCategory, string>;

/** The palette of each provider prefix in `index.css`. It takes precedence over the category. */
const PROVIDER_PALETTES = [["Convex.", "iso-convex"]] as const;

const COS = Math.cos(Math.PI / 6);

/** The isometric projection of a point: x to the lower right, y to the lower left, z up. */
const project = (x: number, y: number, z: number) => [(x - y) * COS, (x + y) / 2 - z] as const;

const points = (corners: [number, number, number][]) =>
  corners
    .map(([x, y, z]) =>
      project(x, y, z)
        .map((n) => n.toFixed(3))
        .join(","),
    )
    .join(" ");

const TOP = { fill: "var(--iso-top)" };
const LEFT = { fill: "var(--iso-left)" };
const RIGHT = { fill: "var(--iso-right)" };

function Slab({ x, y, z, w, d, h }: Record<"x" | "y" | "z" | "w" | "d" | "h", number>) {
  return (
    <>
      <polygon
        points={points([
          [x, y + d, z],
          [x + w, y + d, z],
          [x + w, y + d, z + h],
          [x, y + d, z + h],
        ])}
        style={LEFT}
      />
      <polygon
        points={points([
          [x + w, y, z],
          [x + w, y + d, z],
          [x + w, y + d, z + h],
          [x + w, y, z + h],
        ])}
        style={RIGHT}
      />
      <polygon
        points={points([
          [x, y, z + h],
          [x + w, y, z + h],
          [x + w, y + d, z + h],
          [x, y + d, z + h],
        ])}
        style={TOP}
      />
    </>
  );
}

/** An upright cylinder of radius `r` on the point (0, 0, z), with `bands` rings clipped to its side. */
function Cylinder({
  z,
  r,
  h,
  bands,
  id,
}: {
  z: number;
  r: number;
  h: number;
  bands: number;
  id: string;
}) {
  const rx = r * Math.SQRT2 * COS;
  const ry = (r * Math.SQRT2) / 2;
  const [bx, by] = project(0, 0, z);
  const [tx, ty] = project(0, 0, z + h);
  const side = `M${tx - rx} ${ty}V${by}A${rx} ${ry} 0 0 0 ${bx + rx} ${by}V${ty}Z`;
  return (
    <>
      <defs>
        <linearGradient id={`${id}g`} x1={bx - rx} x2={bx + rx} gradientUnits="userSpaceOnUse">
          <stop offset=".5" style={{ stopColor: "var(--iso-left)" }} />
          <stop offset=".5" style={{ stopColor: "var(--iso-right)" }} />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <path d={side} />
        </clipPath>
      </defs>
      <path d={side} fill={`url(#${id}g)`} />
      <g clipPath={`url(#${id}c)`}>
        {Array.from({ length: bands }, (_, index) => {
          const [, y] = project(0, 0, z + (h * (index + 1)) / (bands + 1));
          return (
            <path
              key={index}
              d={`M${bx - rx - 1} ${y}A${rx} ${ry} 0 0 0 ${bx + rx + 1} ${y}`}
              fill="none"
              strokeWidth={r * 0.12}
              style={{ stroke: "var(--iso-top)" }}
            />
          );
        })}
      </g>
      <ellipse cx={tx} cy={ty} rx={rx} ry={ry} style={TOP} />
    </>
  );
}

/** The Lucide icon of `box`, upright on the centre of the top face square at (x, y, z) with side `size`. */
function Mark({
  box,
  x,
  y,
  z,
  size,
}: { box: DiagramBox } & Record<"x" | "y" | "z" | "size", number>) {
  const [cx, cy] = project(x + size / 2, y + size / 2, z);
  const unit = (size * 0.85) / 24;
  return (
    <g
      transform={`translate(${cx - 12 * unit} ${cy - 13 * unit}) scale(${unit})`}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: "var(--iso-ink)" }}
    >
      {box.icon.map(([tag, attributes], index) =>
        createElement(tag, { key: index, ...attributes }),
      )}
    </g>
  );
}

/** The solid of a box: slabs for compute, queues and email, a cylinder for data, a block otherwise. */
function IsometricIcon({ box }: { box: DiagramBox }) {
  const id = useId();
  const palette =
    PROVIDER_PALETTES.find(([prefix]) => box.resourceType.startsWith(prefix))?.[1] ??
    ICON_PALETTES[box.category];
  const solid =
    box.category === "compute" ? (
      box.convex ? (
        <>
          <Slab x={-6} y={-6} z={-4.6} w={12} d={12} h={1.9} />
          <Slab x={-6} y={-6} z={-2.2} w={12} d={12} h={1.9} />
          <Slab x={-6} y={-6} z={0.2} w={12} d={12} h={1.9} />
          <Mark box={box} x={-4} y={-4} z={2.1} size={8} />
        </>
      ) : (
        <>
          <Slab x={-6} y={-6} z={-3.5} w={12} d={12} h={2.6} />
          <Slab x={-6} y={-6} z={-0.2} w={12} d={12} h={2.6} />
          <Mark box={box} x={-4} y={-4} z={2.4} size={8} />
        </>
      )
    ) : box.category === "database" ? (
      <>
        <Cylinder z={-6} r={6.3} h={10} bands={2} id={id} />
        <Mark box={box} x={-3.2} y={-3.2} z={4} size={6.4} />
      </>
    ) : box.category === "storage" ? (
      <>
        <Cylinder z={-6} r={6.3} h={9} bands={0} id={id} />
        <Mark box={box} x={-3.4} y={-3.4} z={3} size={6.8} />
      </>
    ) : box.category === "queue" ? (
      <>
        <Slab x={-6} y={-6} z={-5} w={12} d={12} h={1.6} />
        <Slab x={-6} y={-6} z={-2.6} w={12} d={12} h={1.6} />
        <Slab x={-6} y={-6} z={-0.2} w={12} d={12} h={1.6} />
        <Mark box={box} x={-4} y={-4} z={1.4} size={8} />
      </>
    ) : box.category === "email" ? (
      <>
        <Slab x={-6} y={-6} z={-2} w={12} d={12} h={2.4} />
        <Mark box={box} x={-4} y={-4} z={0.4} size={8} />
      </>
    ) : (
      <>
        <Slab x={-5.5} y={-5.5} z={-4.5} w={11} d={11} h={7.5} />
        <Mark box={box} x={-3.8} y={-3.8} z={3} size={7.6} />
      </>
    );
  return (
    <svg
      aria-hidden="true"
      viewBox="-11.5 -10 23 22"
      className={`h-[43px] w-11 shrink-0 ${palette}`}
    >
      {solid}
    </svg>
  );
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
or Convex app, and a click on the box opens its details below the diagram. A wide diagram scrolls
inside its frame.

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
  if (diagram.boxes.length === 0) {
    return null;
  }

  const { nodes, frames, lines, width, height } = layoutDiagram(diagram);
  const open = diagram.boxes.find((box) => box.id === selected);

  return (
    <div className="mb-2">
      <div className="overflow-x-auto">
        <div className="relative" style={{ width, height }}>
          {frames.map((frame) => (
            <div
              key={frame.name}
              className="absolute border"
              style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
            >
              <span className="absolute top-1.5 left-2.5 font-mono text-xs text-muted-foreground">
                {frame.name}
              </span>
            </div>
          ))}
          <svg aria-hidden="true" className="absolute inset-0" width={width} height={height}>
            {lines.map((line) => (
              <g key={line.key}>
                <path d={line.d} fill="none" className="stroke-muted-foreground/60" />
                {line.arrow ? (
                  <polygon points={line.arrow} className="fill-muted-foreground" />
                ) : null}
              </g>
            ))}
          </svg>
          {lines.map((line) =>
            line.labels.length === 0 ? null : (
              <span
                key={line.key}
                className="absolute -translate-x-1/2 -translate-y-1/2 bg-background px-1 text-center font-mono text-[11px] leading-[14px] whitespace-pre text-muted-foreground"
                style={{ left: line.label.x, top: line.label.y }}
              >
                {line.labels.join("\n")}
              </span>
            ),
          )}
          {nodes.map(({ box, position }) => (
            <div
              key={box.id}
              className={`absolute flex flex-col border bg-background p-2.5 ${box.id === selected ? "border-foreground" : ""}`}
              style={{ left: position.x, top: position.y, width: position.w, height: position.h }}
            >
              <div className="flex h-[50px] items-center gap-2.5">
                <IsometricIcon box={box} />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    aria-expanded={box.id === selected}
                    className="cursor-pointer text-left font-mono text-[13px] leading-[17px] font-medium after:absolute after:inset-0"
                    onClick={() => setSelected((current) => (current === box.id ? null : box.id))}
                  >
                    <span className="max-lines-2">{box.name}</span>
                  </button>
                  <div className="truncate text-xs text-muted-foreground">{box.typeName}</div>
                </div>
                {asides?.has(box.id) ? (
                  <div className="relative -mr-1.5 flex shrink-0 items-center">
                    {asides.get(box.id)}
                  </div>
                ) : null}
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
            </div>
          ))}
        </div>
      </div>
      {open ? <DiagramBoxDetails box={open} /> : null}
    </div>
  );
}
