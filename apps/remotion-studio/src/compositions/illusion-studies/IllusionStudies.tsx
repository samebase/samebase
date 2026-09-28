import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { useWebGpuFrame } from "../../webgpu/useWebGpuFrame";
import { type CubeOrHoleBlock, readCubeOrHoleFrame } from "./cubeOrHoleTimeline";
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

/** Study 2: a cube-shaped hole that reads as a cube until a slow orthographic orbit shows the hole. */
export function StudyCubeOrHole({ block }: { block: CubeOrHoleBlock }) {
  const time = useCurrentFrame() / useVideoConfig().fps;
  const frame = useMemo(() => readCubeOrHoleFrame(time, block, sampleGrid), [block, time]);
  return <StudyCanvas frame={frame} />;
}
