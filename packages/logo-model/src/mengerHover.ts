import {
  type MengerDepthTransitionModel,
  type MengerDepthTransitionStage,
  type MengerHoleAxis,
} from "./mengerDepthTransition.ts";

export const MENGER_HOVER_MIN_REVEAL_RADIUS = 0.05;
export const MENGER_HOVER_MAX_REVEAL_RADIUS = 1;
export const MENGER_HOVER_DEFAULT_REVEAL_RADIUS = 0.55;
const MENGER_HOVER_FULL_OPEN_RADIUS_FRACTION = 0.25;

/**
Unit sponge coordinates: the full cube spans [0, 1] on every axis.
outsideDistance is how far the pointer ray passes outside the cube surface in
the same unit scale; probes on the surface use 0. It joins the channel
distance term so influence fades continuously while the pointer skims past
the silhouette instead of collapsing to the resting state at the edge.
*/
export type MengerHoverProbe = {
  outsideDistance: number;
  x: number;
  y: number;
  z: number;
};

/**
offset is the mover's full slide in its own child-cell units: always 0 on the
mover's hole axis and Chebyshev norm 1 across its two tangent axes. The ring
of eight retained siblings around a face-center hole is solid, so every
Chebyshev-1 tangent offset parks the fully open mover inside solid geometry.
The rendered position is from + openness * offset, which keeps the reveal
continuous in both pointer position and openness; the discrete axis-pick
this replaces teleported partially open movers whenever the pointer crossed
a channel diagonal or axis line.
*/
export type MengerHoverMoveState = {
  offset: [number, number, number];
  openness: number;
};

export function normalizeMengerHoverRevealRadius(value: number): number {
  if (!Number.isFinite(value)) {
    return MENGER_HOVER_DEFAULT_REVEAL_RADIUS;
  }

  return Math.min(Math.max(value, MENGER_HOVER_MIN_REVEAL_RADIUS), MENGER_HOVER_MAX_REVEAL_RADIUS);
}

function readChannelAxis(channel: number, faceGridSize: number): MengerHoleAxis {
  const axis = Math.floor(channel / (faceGridSize * faceGridSize));
  switch (axis) {
    case 0:
    case 1:
    case 2:
      return axis;
    default:
      throw new Error("Every Menger hover channel must use one cube axis.");
  }
}

function readChannelFaceCoordinates(channel: number, faceGridSize: number) {
  const axis = readChannelAxis(channel, faceGridSize);
  const channelWithinAxis = channel - axis * faceGridSize * faceGridSize;

  return {
    axis,
    coordinateA: Math.floor(channelWithinAxis / faceGridSize),
    coordinateB: channelWithinAxis % faceGridSize,
  };
}

type ChannelTangentDeltas = {
  deltaA: number;
  deltaB: number;
};

function readChannelTangentDeltas(
  axis: MengerHoleAxis,
  centerA: number,
  centerB: number,
  point: MengerHoverProbe,
): ChannelTangentDeltas {
  switch (axis) {
    case 0:
      return { deltaA: centerA - point.y, deltaB: centerB - point.z };
    case 1:
      return { deltaA: centerA - point.x, deltaB: centerB - point.z };
    case 2:
      return { deltaA: centerA - point.x, deltaB: centerB - point.y };
    default:
      return axis satisfies never;
  }
}

function toChannelOffset(
  axis: MengerHoleAxis,
  offsetA: number,
  offsetB: number,
): [number, number, number] {
  switch (axis) {
    case 0:
      return [0, offsetA, offsetB];
    case 1:
      return [offsetA, 0, offsetB];
    case 2:
      return [offsetA, offsetB, 0];
    default:
      return axis satisfies never;
  }
}

/**
The slide points away from the pointer like the carpet wipe, scaled so the
larger tangent component is exactly 1: the offset rotates continuously around
the sibling ring as the pointer orbits the channel instead of snapping
between four discrete slide lines. The pointer can only cross the degenerate
center while the channel is fully open, so the fallback never shows.
*/
function readChannelSlideOffset(deltas: ChannelTangentDeltas): readonly [number, number] {
  const magnitude = Math.max(Math.abs(deltas.deltaA), Math.abs(deltas.deltaB));
  if (magnitude <= 0) {
    return [1, 0];
  }

  return [deltas.deltaA / magnitude, deltas.deltaB / magnitude];
}

function readChannelState(
  channel: number,
  stage: MengerDepthTransitionStage,
  probe: MengerHoverProbe | null,
  directionProbe: MengerHoverProbe | null,
  revealRadius: number,
): MengerHoverMoveState {
  const faceGridSize = stage.gridSize / 3;
  const { axis, coordinateA, coordinateB } = readChannelFaceCoordinates(channel, faceGridSize);
  const centerA = (coordinateA + 0.5) / faceGridSize;
  const centerB = (coordinateB + 0.5) / faceGridSize;

  // The heal after the pointer leaves keeps the last slide direction, exactly
  // like the carpet's direction pointer; a zero offset here would teleport
  // every easing mover back to its hole in one frame.
  const slidePoint = probe ?? directionProbe;
  const slide =
    slidePoint === null
      ? ([1, 0] as const)
      : readChannelSlideOffset(readChannelTangentDeltas(axis, centerA, centerB, slidePoint));
  const offset = toChannelOffset(axis, slide[0], slide[1]);
  if (probe === null) {
    return { offset, openness: 0 };
  }

  let axisDelta: number;
  switch (axis) {
    case 0:
      axisDelta = Math.min(probe.x, 1 - probe.x);
      break;
    case 1:
      axisDelta = Math.min(probe.y, 1 - probe.y);
      break;
    case 2:
      axisDelta = Math.min(probe.z, 1 - probe.z);
      break;
    default:
      return axis satisfies never;
  }

  const { deltaA, deltaB } = readChannelTangentDeltas(axis, centerA, centerB, probe);
  const radius = normalizeMengerHoverRevealRadius(revealRadius);
  const closeness = 1 - Math.hypot(axisDelta, deltaA, deltaB, probe.outsideDistance) / radius;
  const normalized =
    closeness > 0 ? Math.min(closeness / (1 - MENGER_HOVER_FULL_OPEN_RADIUS_FRACTION), 1) : 0;

  return { offset, openness: normalized * normalized * (3 - 2 * normalized) };
}

/**
Depth-two only for now: the study first has to make the coarse reveal feel
like the carpet before deeper recursion returns. Every cube pair in one
face-on channel shares its openness and slide offset, and a depth-two view
ray only ever crosses its own channel's covers, so no cross-axis blocker
handling exists at this depth.
*/
export function readMengerHoverState(
  model: MengerDepthTransitionModel,
  probe: MengerHoverProbe | null,
  directionProbe: MengerHoverProbe | null,
  revealRadius: number,
): MengerHoverMoveState[] {
  const stage = model.depthTwo;
  const faceGridSize = stage.gridSize / 3;
  const channelCount = 3 * faceGridSize * faceGridSize;
  const channelStates = Array.from({ length: channelCount }, (_, channel) =>
    readChannelState(channel, stage, probe, directionProbe, revealRadius),
  );

  return stage.moves.map((move) => {
    const channelState = channelStates[move.faceColumnChannel];
    if (!channelState) {
      throw new Error("Every depth-two Menger mover must resolve to one hover channel.");
    }

    // The renderer smooths openness per mover in place, so every mover needs
    // its own state object; the offset stays shared because nothing mutates
    // it at this depth.
    return { offset: channelState.offset, openness: channelState.openness };
  });
}
