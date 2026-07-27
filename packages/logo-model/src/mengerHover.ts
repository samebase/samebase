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
Each hole opening is covered by TWO coincident cubes, one per tangent axis,
mirroring the carpet's slide rect: cover A retreats by openness ** weightA
cells along the first tangent axis, cover B by openness ** (1 - weightA)
along the second, each toward its sign. The region both covers still hide is
the hole minus a rectangle of exactly the carpet's revealed shape, anchored
at the pointer-facing corner, with revealed area equal to the openness. A
sign only flips while that axis's weight is 0, which parks its cover fully
inside the solid sibling ring, so the flip is never visible.

Tangent axis order matches readChannelTangentDeltas: hole axis 0 pairs
(y, z), hole axis 1 pairs (x, z), hole axis 2 pairs (x, y).
*/
export type MengerHoverMoveState = {
  openness: number;
  signA: 1 | -1;
  signB: 1 | -1;
  weightA: number;
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

function clampUnit(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

type ChannelSlide = {
  signA: 1 | -1;
  signB: 1 | -1;
  weightA: number;
};

/**
The carpet's readSlideAwayFromPointer, restated for the cover pair: the
openness split follows the pointer-to-center offset ratio, and within half a
hole side of the hole the split relaxes toward an even 0.5 so a cardinal
pass does not flip the rect between wide and tall across a knife edge.
*/
function readChannelSlide(deltas: ChannelTangentDeltas, holeSize: number): ChannelSlide {
  const totalDelta = Math.abs(deltas.deltaA) + Math.abs(deltas.deltaB);
  const directionalBlend = clampUnit(totalDelta / (holeSize / 2));
  const directionalWeightA = totalDelta > 0 ? Math.abs(deltas.deltaA) / totalDelta : 0.5;

  return {
    signA: deltas.deltaA >= 0 ? 1 : -1,
    signB: deltas.deltaB >= 0 ? 1 : -1,
    weightA: 0.5 + (directionalWeightA - 0.5) * directionalBlend,
  };
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

  // The heal after the pointer leaves keeps the last slide split and signs,
  // exactly like the carpet's direction pointer, so easing covers retract
  // along the path they came instead of teleporting.
  const slidePoint = probe ?? directionProbe;
  const slide =
    slidePoint === null
      ? { signA: 1 as const, signB: 1 as const, weightA: 0.5 }
      : readChannelSlide(
          readChannelTangentDeltas(axis, centerA, centerB, slidePoint),
          1 / faceGridSize / 3,
        );
  if (probe === null) {
    return { ...slide, openness: 0 };
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

  return { ...slide, openness: normalized * normalized * (3 - 2 * normalized) };
}

/**
Depth-two only for now: the study first has to make the coarse reveal feel
like the carpet before deeper recursion returns. Every opening in one
face-on channel shares its openness, split, and signs, so the rectangles at
both tunnel ends and every interior segment stay aligned and the through
view is the same rectangle. A depth-two view ray only ever crosses its own
channel's covers, so no cross-axis blocker handling exists at this depth.
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
    // its own state object.
    return { ...channelState };
  });
}
