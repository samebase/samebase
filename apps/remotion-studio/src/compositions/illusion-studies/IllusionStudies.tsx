import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { useWebGpuFrame } from "../../webgpu/useWebGpuFrame";
import {
  type CubeOrHoleScene,
  readCubeOrHoleFrame,
  readCubeOrHoleKeyFrame,
} from "./cubeOrHoleTimeline";
import { readEndlessPullbackFrame } from "./endlessPullbackTimeline";
import { createIllusionStudyRenderer, type IllusionStudyFrame } from "./illusionStudyRenderer";

/** Antialiasing samples per pixel side, as in the film. */
const sampleGrid = 4;

function StudyCanvas({ frame }: { frame: IllusionStudyFrame }) {
  const { height, width } = useVideoConfig();
  const canvasRef = useWebGpuFrame(createIllusionStudyRenderer, frame);
  return (
    <AbsoluteFill>
      <canvas height={height} ref={canvasRef} width={width} />
    </AbsoluteFill>
  );
}

/** Study 1: one calm orthographic zoom out of the haze that never stops, as a seamless threefold loop. */
export function StudyEndlessPullback() {
  const time = useCurrentFrame() / useVideoConfig().fps;
  const frame = useMemo(() => readEndlessPullbackFrame(time, sampleGrid), [time]);
  return <StudyCanvas frame={frame} />;
}

/**
Study 2: one swing through the key view. On one side the cube is a hole in a block; on the other it
is a real cube in a room corner. The swap happens on the key view frame, where both look the same.
*/
export function StudyCubeOrHole() {
  const time = useCurrentFrame() / useVideoConfig().fps;
  const frame = useMemo(() => readCubeOrHoleFrame(time, sampleGrid), [time]);
  return <StudyCanvas frame={frame} />;
}

/** The key view of the hole or of the cube: the two pictures are the same. */
export function StudyCubeOrHoleKey({ scene }: { scene: CubeOrHoleScene }) {
  const frame = useMemo(() => readCubeOrHoleKeyFrame(scene, sampleGrid), [scene]);
  return <StudyCanvas frame={frame} />;
}
