import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { useWebGpuFrame } from "../../webgpu/useWebGpuFrame";
import { createMengerScaleRenderer } from "./mengerScaleRenderer";
import { mengerScaleShots, type MengerScaleShotId } from "./mengerScaleShots";

export type MengerScaleStillProps = {
  shot: MengerScaleShotId;
};

/** Logo size of the flat mark in shot 3, in pixels at 1080p. */
const markSize = 132;

export function MengerScaleStill({ shot }: MengerScaleStillProps) {
  const frame = useCurrentFrame();
  const { durationInFrames, height, width } = useVideoConfig();
  const { drift, fieldOfViewDegrees, hazeDistance, showsMark, sunDirection, target } =
    mengerScaleShots[shot];
  const camera = useMemo(() => {
    const [start, end] = drift;
    const amount = frame / (durationInFrames - 1);
    const mix = (index: 0 | 1 | 2) => start[index] + (end[index] - start[index]) * amount;
    return {
      fieldOfViewDegrees,
      hazeDistance,
      position: [mix(0), mix(1), mix(2)] as const,
      sunDirection,
      target,
    };
  }, [drift, durationInFrames, fieldOfViewDegrees, frame, hazeDistance, sunDirection, target]);
  const canvasRef = useWebGpuFrame(createMengerScaleRenderer, camera);

  return (
    <AbsoluteFill>
      <canvas height={height} ref={canvasRef} width={width} />
      {showsMark ? (
        <svg
          height={markSize}
          style={{ bottom: 150, left: (width - markSize) / 2, position: "absolute" }}
          viewBox="0 0 3 3"
          width={markSize}
        >
          <path d="M0 0h3v3H0z M1 1h1v1H1z" fill="#394447" fillRule="evenodd" />
        </svg>
      ) : null}
    </AbsoluteFill>
  );
}
