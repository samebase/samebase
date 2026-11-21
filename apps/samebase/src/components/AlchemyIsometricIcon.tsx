import type { IconNode, ResourceCategory } from "@samebase/alchemy-kit/ui";
import { createElement, useId } from "react";

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

/** The Lucide `icon`, upright on the centre of the top face square at (x, y, z) with side `size`. */
function Mark({
  icon,
  x,
  y,
  z,
  size,
}: { icon: IconNode } & Record<"x" | "y" | "z" | "size", number>) {
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
      {icon.map(([tag, attributes], index) => createElement(tag, { key: index, ...attributes }))}
    </g>
  );
}

/**
The solid of a resource type: slabs for compute, queues and email, a cylinder for data, a block
otherwise. A Convex deployment is three slabs, whatever its category.
*/
export function AlchemyIsometricIcon({
  resourceType,
  category,
  icon,
}: {
  resourceType: string;
  category: ResourceCategory;
  icon: IconNode;
}) {
  const id = useId();
  const palette =
    PROVIDER_PALETTES.find(([prefix]) => resourceType.startsWith(prefix))?.[1] ??
    ICON_PALETTES[category];
  const solid =
    resourceType === "Convex.Deployment" ? (
      <>
        <Slab x={-6} y={-6} z={-4.6} w={12} d={12} h={1.9} />
        <Slab x={-6} y={-6} z={-2.2} w={12} d={12} h={1.9} />
        <Slab x={-6} y={-6} z={0.2} w={12} d={12} h={1.9} />
        <Mark icon={icon} x={-4} y={-4} z={2.1} size={8} />
      </>
    ) : category === "compute" ? (
      <>
        <Slab x={-6} y={-6} z={-3.5} w={12} d={12} h={2.6} />
        <Slab x={-6} y={-6} z={-0.2} w={12} d={12} h={2.6} />
        <Mark icon={icon} x={-4} y={-4} z={2.4} size={8} />
      </>
    ) : category === "database" ? (
      <>
        <Cylinder z={-6} r={6.3} h={10} bands={2} id={id} />
        <Mark icon={icon} x={-3.2} y={-3.2} z={4} size={6.4} />
      </>
    ) : category === "storage" ? (
      <>
        <Cylinder z={-6} r={6.3} h={9} bands={0} id={id} />
        <Mark icon={icon} x={-3.4} y={-3.4} z={3} size={6.8} />
      </>
    ) : category === "queue" ? (
      <>
        <Slab x={-6} y={-6} z={-5} w={12} d={12} h={1.6} />
        <Slab x={-6} y={-6} z={-2.6} w={12} d={12} h={1.6} />
        <Slab x={-6} y={-6} z={-0.2} w={12} d={12} h={1.6} />
        <Mark icon={icon} x={-4} y={-4} z={1.4} size={8} />
      </>
    ) : category === "email" ? (
      <>
        <Slab x={-6} y={-6} z={-2} w={12} d={12} h={2.4} />
        <Mark icon={icon} x={-4} y={-4} z={0.4} size={8} />
      </>
    ) : (
      <>
        <Slab x={-5.5} y={-5.5} z={-4.5} w={11} d={11} h={7.5} />
        <Mark icon={icon} x={-3.8} y={-3.8} z={3} size={7.6} />
      </>
    );
  return (
    <svg
      aria-hidden="true"
      viewBox="-11.5 -10 23 22"
      className={`h-[2.6875em] w-[2.75em] shrink-0 ${palette}`}
    >
      {solid}
    </svg>
  );
}
