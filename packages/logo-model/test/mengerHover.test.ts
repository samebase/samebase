import {
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
  settleMengerHoverChannelState,
  writeMengerHoverState,
} from "../src/mengerHover.ts";
import { describe, expect, it } from "vite-plus/test";

const MENGER_DEPTH_TRANSITION_MODEL = createMengerDepthTransitionModel({
  staggerGroupCount: 1,
});
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

function readChannelState(
  probe: { x: number; y: number; z: number } | null,
  lastProbe = probe,
  revealRadius = MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
) {
  const state = readMengerHoverState(MENGER_DEPTH_TRANSITION_MODEL, probe, lastProbe, revealRadius)
    .stages[0]?.[CHANNEL];
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
    expect(near.weightA).toBe(1);
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

  it("fully retreats each cover axis before its direction changes", () => {
    const leftState = readChannelState(
      { x: CENTER_A - 1e-6, y: CENTER_B + 0.04, z: 1 },
      undefined,
      0.05,
    );
    const rightState = readChannelState(
      { x: CENTER_A + 1e-6, y: CENTER_B + 0.04, z: 1 },
      undefined,
      0.05,
    );
    const topState = readChannelState(
      { x: CENTER_A + 0.04, y: CENTER_B - 1e-6, z: 1 },
      undefined,
      0.05,
    );
    const bottomState = readChannelState(
      { x: CENTER_A + 0.04, y: CENTER_B + 1e-6, z: 1 },
      undefined,
      0.05,
    );

    expect(leftState.openness).toBeGreaterThan(0);
    expect(leftState.openness).toBeLessThan(1);
    expect(rightState.openness).toBeCloseTo(leftState.openness, 12);
    expect(leftState.weightA).toBeLessThan(0.001);
    expect(rightState.weightA).toBeLessThan(0.001);
    expect(1 - leftState.openness ** leftState.weightA).toBeLessThan(0.002);
    expect(1 - rightState.openness ** rightState.weightA).toBeLessThan(0.002);

    expect(topState.openness).toBeGreaterThan(0);
    expect(topState.openness).toBeLessThan(1);
    expect(bottomState.openness).toBeCloseTo(topState.openness, 12);
    expect(1 - topState.weightA).toBeLessThan(0.001);
    expect(1 - bottomState.weightA).toBeLessThan(0.001);
    expect(1 - topState.openness ** (1 - topState.weightA)).toBeLessThan(0.002);
    expect(1 - bottomState.openness ** (1 - bottomState.weightA)).toBeLessThan(0.002);
  });

  it("settles through the tangent center before a cover direction changes", () => {
    const current = readChannelState({ x: CENTER_A - 0.04, y: CENTER_B, z: 0.75 });
    const centerTarget = readChannelState({ x: CENTER_A, y: CENTER_B, z: 0.75 });

    expect(current.weightA).toBe(1);
    expect(centerTarget.weightA).toBe(0.5);
    settleMengerHoverChannelState(current, centerTarget, 0.2, 1e-6);
    expect(current.weightA).toBeGreaterThan(0.5);
    expect(current.weightA).toBeLessThan(1);

    const crossedTarget = readChannelState({ x: CENTER_A + 0.04, y: CENTER_B, z: 0.75 });
    const initialSignA = current.signA;
    let signChangedAtWeight: number | null = null;
    let settled = false;
    for (let frame = 0; frame < 200 && !settled; frame += 1) {
      settled = settleMengerHoverChannelState(current, crossedTarget, 0.2, 1e-6);
      if (current.signA !== initialSignA && signChangedAtWeight === null) {
        signChangedAtWeight = current.weightA;
      }
    }

    expect(signChangedAtWeight).toBe(0);
    expect(settled).toBe(true);
    expect(current).toEqual(crossedTarget);
  });

  it("changes direction at full openness before it closes", () => {
    const current = readChannelState(null);
    current.openness = 1;
    const target = readChannelState({ x: CENTER_A + 0.04, y: CENTER_B, z: 0.75 });

    expect(settleMengerHoverChannelState(current, target, 1, 1e-6)).toBe(false);
    expect(current.openness).toBe(1);
    expect(current.signA).toBe(target.signA);
    expect(current.signB).toBe(target.signB);
    expect(current.weightA).toBe(target.weightA);

    expect(settleMengerHoverChannelState(current, target, 1, 1e-6)).toBe(true);
    expect(current).toEqual(target);
  });

  it("changes direction while closed before it opens", () => {
    const current = readChannelState(null);
    const target = readChannelState({ x: CENTER_A + 0.04, y: CENTER_B, z: 0.75 });

    expect(settleMengerHoverChannelState(current, target, 1, 1e-6)).toBe(false);
    expect(current.openness).toBe(0);
    expect(current.signA).toBe(target.signA);
    expect(current.signB).toBe(target.signB);
    expect(current.weightA).toBe(target.weightA);

    expect(settleMengerHoverChannelState(current, target, 1, 1e-6)).toBe(true);
    expect(current).toEqual(target);
  });

  it("retreats a cover before changing direction near closed", () => {
    const current = readChannelState({ x: CENTER_A - 0.04, y: CENTER_B, z: 0.75 });
    const target = readChannelState({ x: CENTER_A + 0.04, y: CENTER_B, z: 0.75 });
    current.openness = 5e-7;

    expect(settleMengerHoverChannelState(current, target, 1, 1e-6)).toBe(false);
    expect(current.signA).toBe(target.signA);
    expect(current.weightA).toBe(0);
    expect(current.weightA).not.toBe(target.weightA);
  });

  it("retreats both covers in sequence when both directions change", () => {
    const current = readChannelState({
      x: CENTER_A - 0.04,
      y: CENTER_B - 0.04,
      z: 0.75,
    });
    const target = readChannelState({
      x: CENTER_A + 0.04,
      y: CENTER_B + 0.04,
      z: 0.75,
    });
    const initialSignA = current.signA;
    const initialSignB = current.signB;
    let signAChangedAtWeight: number | null = null;
    let signBChangedAtWeight: number | null = null;
    let settled = false;
    for (let frame = 0; frame < 300 && !settled; frame += 1) {
      settled = settleMengerHoverChannelState(current, target, 0.2, 1e-6);
      if (current.signA !== initialSignA && signAChangedAtWeight === null) {
        signAChangedAtWeight = current.weightA;
      }
      if (current.signB !== initialSignB && signBChangedAtWeight === null) {
        signBChangedAtWeight = current.weightA;
      }
    }

    expect(signAChangedAtWeight).toBe(0);
    expect(signBChangedAtWeight).toBe(1);
    expect(settled).toBe(true);
    expect(current).toEqual(target);
  });

  it("includes distance from the channel face in three-dimensional falloff", () => {
    const surfaceState = readChannelState({ x: CENTER_A, y: CENTER_B, z: 1 });
    const interiorState = readChannelState({ x: CENTER_A, y: CENTER_B, z: 0.75 });

    expect(surfaceState.openness).toBe(1);
    expect(interiorState.openness).toBeGreaterThan(0);
    expect(interiorState.openness).toBeLessThan(surfaceState.openness);
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

  it("builds the supported depth-five model and topology", () => {
    const model = createMengerDepthTransitionModel({
      maximumDepth: 5,
      retainFinalSettledVoxels: false,
      staggerGroupCount: 1,
    });
    const topology = createMengerHoverTopology(model);

    expect(model.stages[model.stages.length - 1]?.depth).toBe(5);
    expect(topology.stages).toHaveLength(4);
    expect(topology.channelCount).toBe(22_140);
    expect(topology.stages[topology.stages.length - 1]?.blockerLinks).toEqual([]);
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
