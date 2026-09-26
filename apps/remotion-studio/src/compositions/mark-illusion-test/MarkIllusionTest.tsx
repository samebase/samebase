import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { useWebGpuFrame } from "../../webgpu/useWebGpuFrame";
import { createMarkIllusionRenderer } from "./markIllusionRenderer";
import { readMarkIllusionFrame } from "./markIllusionTimeline";

export type MarkIllusionTestProps = {
  /** Warps every frame. At the hold this renders the identity warp for the swap check. */
  forceWarp: boolean;
};

export function MarkIllusionTest({ forceWarp }: MarkIllusionTestProps) {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const frameInput = useMemo(
    () => readMarkIllusionFrame(frame / fps, { forceWarp }),
    [forceWarp, fps, frame],
  );
  const canvasRef = useWebGpuFrame(createMarkIllusionRenderer, frameInput);

  return (
    <AbsoluteFill>
      <canvas height={height} ref={canvasRef} width={width} />
    </AbsoluteFill>
  );
}
