import {
  MENGER_DEPTH_TRANSITION_MODEL,
  createMengerDepthTransitionModel,
  type MengerDepthTransitionModel,
  type MengerDepthTransitionStage,
} from "../src/mengerDepthTransition.ts";
import {
  MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
  createMengerHoverState,
  createMengerHoverTopology,
  normalizeMengerHoverRevealRadius,
  projectMengerHoverLineToVisibleFacePlanes,
  readMengerHoverState,
  writeMengerHoverState,
} from "../src/mengerHover.ts";
import { describe, expect, it } from "vite-plus/test";

const DEPTH_TWO_STAGE = MENGER_DEPTH_TRANSITION_MODEL.stages[0];
const defaultDepthThreeStage = MENGER_DEPTH_TRANSITION_MODEL.stages[1];
if (!defaultDepthThreeStage) {
  throw new Error("The default Menger hover model must include depth three.");
}
const DEPTH_THREE_STAGE: MengerDepthTransitionStage = defaultDepthThreeStage;

// The depth-two z-axis channel at parent face coords (0, 1): hole center
// (x, y) = (0.5 / 3, 1.5 / 3) on the z = 1 face.
const CHANNEL = 2 * 9 + 1;
const CENTER_A = 0.5 / 3;
const CENTER_B = 1.5 / 3;

function readChannelState(probe: { x: number; y: number; z: number } | null, lastProbe = probe) {
  const state = readMengerHoverState(
    MENGER_DEPTH_TRANSITION_MODEL,
    probe,
    lastProbe,
    MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
  ).stages[0]?.[CHANNEL];
  if (!state) {
    throw new Error("The probed channel must resolve to depth-two state.");
  }

  return state;
}

function withDepthThreeMoves(moves: typeof DEPTH_THREE_STAGE.moves): MengerDepthTransitionModel {
  const stages: MengerDepthTransitionModel["stages"] = [
    DEPTH_TWO_STAGE,
    { ...DEPTH_THREE_STAGE, moves },
  ];
  return {
    ...MENGER_DEPTH_TRANSITION_MODEL,
    stages,
  };
}

function readMoveLinks(
  topology: ReturnType<typeof createMengerHoverTopology>,
  stageIndex: number,
  moveIndex: number,
) {
  const stage = topology.stages[stageIndex];
  if (!stage) {
    throw new Error("The topology stage must exist.");
  }
  const offset = stage.moveBlockerLinkOffsets[moveIndex] ?? 0;
  const count = stage.moveBlockerLinkCounts[moveIndex] ?? 0;
  return stage.blockerLinks.slice(offset, offset + count);
}

describe("Menger hover", () => {
  it("extends one visible face across the full pointer plane", () => {
    const projection = projectMengerHoverLineToVisibleFacePlanes(
      { x: 10, y: 8, z: -7 },
      { x: -1, y: 0, z: 0 },
      2,
    );

    expect(projection).toEqual({
      axis: 0,
      point: { x: 1, y: 8, z: -7 },
      sign: 1,
      visibleFaceCount: 1,
    });
  });

  it("joins two visible face planes on their extended edge", () => {
    const edge = projectMengerHoverLineToVisibleFacePlanes(
      { x: 3.5, y: 3.5, z: 5 },
      { x: -1, y: -1, z: 0 },
      2,
    );
    const xFace = projectMengerHoverLineToVisibleFacePlanes(
      { x: 4, y: 3, z: 5 },
      { x: -1, y: -1, z: 0 },
      2,
    );
    const yFace = projectMengerHoverLineToVisibleFacePlanes(
      { x: 3, y: 4, z: 5 },
      { x: -1, y: -1, z: 0 },
      2,
    );

    expect(edge).toEqual({
      axis: 0,
      point: { x: 1, y: 1, z: 5 },
      sign: 1,
      visibleFaceCount: 2,
    });
    expect(xFace).toMatchObject({ axis: 0, point: { x: 1, y: 0, z: 5 } });
    expect(yFace).toMatchObject({ axis: 1, point: { x: 0, y: 1, z: 5 } });
  });

  it("joins three visible face planes at their extended corner", () => {
    const corner = projectMengerHoverLineToVisibleFacePlanes(
      { x: 3, y: 3, z: 3 },
      { x: -1, y: -1, z: -1 },
      2,
    );
    const sectors = [
      projectMengerHoverLineToVisibleFacePlanes({ x: 4, y: 3, z: 3 }, { x: -1, y: -1, z: -1 }, 2),
      projectMengerHoverLineToVisibleFacePlanes({ x: 3, y: 4, z: 3 }, { x: -1, y: -1, z: -1 }, 2),
      projectMengerHoverLineToVisibleFacePlanes({ x: 3, y: 3, z: 4 }, { x: -1, y: -1, z: -1 }, 2),
    ];

    expect(corner).toEqual({
      axis: 0,
      point: { x: 1, y: 1, z: 1 },
      sign: 1,
      visibleFaceCount: 3,
    });
    expect(sectors).toEqual([
      {
        axis: 0,
        point: { x: 1, y: 0, z: 0 },
        sign: 1,
        visibleFaceCount: 3,
      },
      {
        axis: 1,
        point: { x: 0, y: 1, z: 0 },
        sign: 1,
        visibleFaceCount: 3,
      },
      {
        axis: 2,
        point: { x: 0, y: 0, z: 1 },
        sign: 1,
        visibleFaceCount: 3,
      },
    ]);
  });

  it("keeps the face-on projection stable when a second face becomes nearly visible", () => {
    const faceOn = projectMengerHoverLineToVisibleFacePlanes(
      { x: 10, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      2,
    );
    const slightlyTilted = projectMengerHoverLineToVisibleFacePlanes(
      { x: 10, y: 0, z: 0 },
      { x: -1, y: -1e-7, z: 0 },
      2,
    );

    expect(faceOn).toEqual({
      axis: 0,
      point: { x: 1, y: 0, z: 0 },
      sign: 1,
      visibleFaceCount: 1,
    });
    expect(slightlyTilted?.axis).toBe(0);
    expect(slightlyTilted?.visibleFaceCount).toBe(2);
    expect(slightlyTilted?.point.x).toBe(1);
    expect(slightlyTilted?.point.y).toBeCloseTo(-9e-7, 12);
  });

  it("normalizes the pointer reveal radius", () => {
    expect(normalizeMengerHoverRevealRadius(Number.NaN)).toBe(MENGER_HOVER_DEFAULT_REVEAL_RADIUS);
    expect(normalizeMengerHoverRevealRadius(0)).toBe(0.05);
    expect(normalizeMengerHoverRevealRadius(2)).toBe(1);
    expect(normalizeMengerHoverRevealRadius(0.4)).toBe(0.4);
  });

  it("updates one stable channel-state allocation", () => {
    const state = createMengerHoverState(MENGER_DEPTH_TRANSITION_MODEL);
    const stages = state.stages;
    const channels = stages.flat();
    const probe = { x: CENTER_A, y: CENTER_B, z: 1 };

    writeMengerHoverState(
      state,
      MENGER_DEPTH_TRANSITION_MODEL,
      probe,
      probe,
      MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
    );

    expect(state.stages).toBe(stages);
    expect(state.stages.flat().every((channel, index) => channel === channels[index])).toBe(true);
    expect(state.stages[0]?.[CHANNEL]?.openness).toBe(1);
  });

  it("keeps every channel closed without a pointer", () => {
    const state = readMengerHoverState(
      MENGER_DEPTH_TRANSITION_MODEL,
      null,
      null,
      MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
    );

    expect(state.stages).toHaveLength(MENGER_DEPTH_TRANSITION_MODEL.stages.length);
    for (const [stageIndex, stage] of state.stages.entries()) {
      const modelStage = MENGER_DEPTH_TRANSITION_MODEL.stages[stageIndex];
      if (!modelStage) {
        throw new Error("Every Menger hover state must have a model stage.");
      }
      expect(stage).toHaveLength(3 * (modelStage.gridSize / 3) ** 2);
      expect(stage.every((channel) => channel.openness === 0)).toBe(true);
    }
  });

  it("splits the cover pair like the carpet slide", () => {
    const diagonal = readChannelState({ x: CENTER_A - 0.2, y: CENTER_B - 0.2, z: 1 });
    expect(diagonal.weightA).toBeCloseTo(0.5, 5);
    expect(diagonal.signA).toBe(1);
    expect(diagonal.signB).toBe(1);

    const cardinal = readChannelState({ x: CENTER_A - 0.28, y: CENTER_B, z: 1 });
    expect(cardinal.weightA).toBeCloseTo(1, 5);

    const near = readChannelState({ x: CENTER_A - 0.02, y: CENTER_B, z: 1 });
    expect(near.weightA).toBeGreaterThan(0.55);
    expect(near.weightA).toBeLessThan(0.85);
  });

  it("keeps the split continuous across a channel diagonal at partial openness", () => {
    const leftState = readChannelState({ x: CENTER_A - 0.201, y: CENTER_B - 0.199, z: 1 });
    const rightState = readChannelState({ x: CENTER_A - 0.199, y: CENTER_B - 0.201, z: 1 });

    expect(leftState.openness).toBeGreaterThan(0.2);
    expect(leftState.openness).toBeLessThan(1);
    expect(Math.abs(leftState.openness - rightState.openness)).toBeLessThan(0.01);
    expect(Math.abs(leftState.weightA - rightState.weightA)).toBeLessThan(0.05);
    expect(leftState.signA).toBe(rightState.signA);
    expect(leftState.signB).toBe(rightState.signB);
  });

  it("only flips a sign while that axis cover is fully retreated", () => {
    const leftState = readChannelState({ x: CENTER_A - 0.001, y: CENTER_B - 0.3, z: 1 });
    const rightState = readChannelState({ x: CENTER_A + 0.001, y: CENTER_B - 0.3, z: 1 });

    expect(leftState.signA).toBe(1);
    expect(rightState.signA).toBe(-1);
    expect(leftState.weightA).toBeLessThan(0.01);
    expect(rightState.weightA).toBeLessThan(0.01);
  });

  it("links a depth-three ray only to crossed lower-stage covers", () => {
    const rayChannel = 2 * 81 + 1;
    const model = withDepthThreeMoves(
      DEPTH_THREE_STAGE.moves.filter((move) => move.faceColumnChannel === rayChannel),
    );
    const topology = createMengerHoverTopology(model);
    const depthThreeTopology = topology.stages[1];
    if (!depthThreeTopology) {
      throw new Error("Depth three must have topology.");
    }
    const expectedLink = {
      axis: 2,
      channelStateIndex: depthThreeTopology.channelStateOffset + rayChannel,
      minimumA: 1 / 27,
      minimumB: 4 / 27,
      size: 1 / 27,
    };
    const blockerMoveIndexes = DEPTH_TWO_STAGE.moves.flatMap((move, moveIndex) =>
      move.from[0] === 0 && move.from[1] === 1 && move.holeAxis === 0 ? [moveIndex] : [],
    );

    expect(blockerMoveIndexes).toHaveLength(3);
    for (const moveIndex of blockerMoveIndexes) {
      expect(readMoveLinks(topology, 0, moveIndex)).toEqual([expectedLink]);
    }

    const firstBlockerMove = DEPTH_TWO_STAGE.moves[blockerMoveIndexes[0] ?? -1];
    const untouchedMoveIndex = DEPTH_TWO_STAGE.moves.findIndex(
      (move, moveIndex) =>
        move.faceColumnChannel === firstBlockerMove?.faceColumnChannel &&
        !blockerMoveIndexes.includes(moveIndex),
    );
    expect(readMoveLinks(topology, 0, untouchedMoveIndex)).toEqual([]);
  });

  it("keeps four corner paths direct and links four cardinal paths", () => {
    const localChannels = [
      { coordinateA: 6, coordinateB: 6, crossedBlockerCount: 0 },
      { coordinateA: 6, coordinateB: 7, crossedBlockerCount: 3 },
      { coordinateA: 6, coordinateB: 8, crossedBlockerCount: 0 },
      { coordinateA: 7, coordinateB: 6, crossedBlockerCount: 3 },
      { coordinateA: 7, coordinateB: 8, crossedBlockerCount: 3 },
      { coordinateA: 8, coordinateB: 6, crossedBlockerCount: 0 },
      { coordinateA: 8, coordinateB: 7, crossedBlockerCount: 3 },
      { coordinateA: 8, coordinateB: 8, crossedBlockerCount: 0 },
    ];

    for (const { coordinateA, coordinateB, crossedBlockerCount } of localChannels) {
      const channel = coordinateA * 9 + coordinateB;
      const model = withDepthThreeMoves(
        DEPTH_THREE_STAGE.moves.filter((move) => move.faceColumnChannel === channel),
      );
      const topology = createMengerHoverTopology(model);
      const linkedMoveCount = DEPTH_TWO_STAGE.moves.filter(
        (_, moveIndex) => readMoveLinks(topology, 0, moveIndex).length > 0,
      ).length;

      expect(linkedMoveCount).toBe(crossedBlockerCount);
    }
  });

  it("packs depth-four links through both earlier cover stages", () => {
    const model = createMengerDepthTransitionModel({
      maximumDepth: 4,
      staggerGroupCount: 1,
    });
    const topology = createMengerHoverTopology(model);
    const depthFourTopology = topology.stages[2];
    if (!depthFourTopology) {
      throw new Error("Depth four must have topology.");
    }
    const depthTwoLinkedChannels = new Set(
      topology.stages[0]?.blockerLinks.map((link) => link.channelStateIndex),
    );
    const sharedLink = topology.stages[1]?.blockerLinks.find(
      (link) =>
        link.channelStateIndex >= depthFourTopology.channelStateOffset &&
        depthTwoLinkedChannels.has(link.channelStateIndex),
    );
    if (!sharedLink) {
      throw new Error("One depth-four ray must cross both earlier cover stages.");
    }
    const channelStateIndex = sharedLink.channelStateIndex;
    const matchingLinksByStage = topology.stages
      .slice(0, 2)
      .map((stage) =>
        stage.blockerLinks.filter((link) => link.channelStateIndex === channelStateIndex),
      );

    expect(matchingLinksByStage[0]?.length).toBeGreaterThan(0);
    expect(matchingLinksByStage[1]?.length).toBeGreaterThan(0);
    for (const link of matchingLinksByStage.flat()) {
      expect(link).toEqual(sharedLink);
      expect(link.size).toBeCloseTo(1 / 81, 12);
    }
    expect(topology.stages[0]?.maximumBlockerLinksPerMove).toBe(18);
    expect(topology.stages[1]?.maximumBlockerLinksPerMove).toBe(2);
  });

  it("heals along the last slide split after the pointer leaves", () => {
    const probe = { x: CENTER_A - 0.15, y: CENTER_B - 0.1, z: 1 };
    const liveState = readChannelState(probe);
    const healedState = readChannelState(null, probe);

    expect(healedState.openness).toBe(0);
    expect(healedState.weightA).toBe(liveState.weightA);
    expect(healedState.signA).toBe(liveState.signA);
    expect(healedState.signB).toBe(liveState.signB);
  });
});
