import { useCallback, useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { useWebGpuFrame } from "../../webgpu/useWebGpuFrame";
import { readMengerDiveCamera } from "./mengerDiveCamera";
import { createMengerDiveRenderer } from "./mengerDiveRenderer";

export type MengerDiveSpikeProps = {
  antialiasingGridSize: number;
  /** Shifts the dive clock. The seam check renders frame 0 with one clip length of offset. */
  timeOffsetInFrames: number;
};

export function MengerDiveSpike({
  antialiasingGridSize,
  timeOffsetInFrames,
}: MengerDiveSpikeProps) {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const createRenderer = useCallback(
    (canvas: HTMLCanvasElement) => createMengerDiveRenderer({ antialiasingGridSize, canvas }),
    [antialiasingGridSize],
  );
  const camera = useMemo(
    () => readMengerDiveCamera((frame + timeOffsetInFrames) / fps),
    [fps, frame, timeOffsetInFrames],
  );
  const canvasRef = useWebGpuFrame(createRenderer, camera);

  return (
    <AbsoluteFill>
      <canvas height={height} ref={canvasRef} width={width} />
    </AbsoluteFill>
  );
}
