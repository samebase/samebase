import { d, std } from "typegpu";

/** Enough levels to reach quarter-pixel tunnels at the closest wall of the dive at 1080p. */
export const MENGER_DIVE_MAXIMUM_LEVELS = 16;

const squareTunnelDistance = (point: d.v2f, halfWidth: number): number => {
  "use gpu";
  const delta = std.sub(std.abs(point), d.vec2f(halfWidth));
  return std.length(std.max(delta, d.vec2f(0))) + std.min(std.max(delta.x, delta.y), 0);
};

/**
Signed distance from a point to the solid of the unbounded Menger lattice around the edge midpoint
at the origin. It is positive in empty space and negative inside the solid.

Each level removes the square tunnels where two coordinates are in the middle third of a cell. The
x cells are centered on the origin and the y and z cells start at the origin, so scaling by 3 about
the origin maps level k onto level k - 1. Empty space is the union of all tunnels, so the deepest
tunnel depth is a conservative ray-march step.

`coarsestPeriod` is the cell period of the first level. The ray marcher derives
`closedTunnelWidth` from the pixel footprint. A level with that tunnel width stays closed, and its
tunnels open gradually until the width doubles, so new detail grows in instead of popping in.
*/
export const mengerDiveDistance = (
  point: d.v3f,
  coarsestPeriod: number,
  closedTunnelWidth: number,
): number => {
  "use gpu";
  let period = coarsestPeriod;
  let emptyDepth = d.f32(-1_000_000);
  for (let level = 0; level < MENGER_DIVE_MAXIMUM_LEVELS; level += 1) {
    const tunnelWidth = period / 3;
    if (level > 0 && tunnelWidth <= closedTunnelWidth) {
      break;
    }
    const openness = std.clamp(tunnelWidth / closedTunnelWidth - 1, 0, 1);
    const halfWidth = openness / 6;
    const cellPoint = d.vec3f(
      std.fract(point.x / period + 0.5) - 0.5,
      std.fract(point.y / period) - 0.5,
      std.fract(point.z / period) - 0.5,
    );
    const tunnelDistance = std.min(
      squareTunnelDistance(cellPoint.xy, halfWidth),
      squareTunnelDistance(cellPoint.xz, halfWidth),
      squareTunnelDistance(cellPoint.yz, halfWidth),
    );
    emptyDepth = std.max(emptyDepth, -tunnelDistance * period);
    period = period / 3;
  }
  return emptyDepth;
};
