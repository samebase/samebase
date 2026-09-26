import { useLayoutEffect, useRef } from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { readMengerDiveCamera } from "./mengerDiveCamera";
import { createMengerDiveRenderer, type MengerDiveRenderer } from "./mengerDiveRenderer";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Promise<MengerDiveRenderer> | null>(null);

  // Layout effects run in order during the commit, so the frame effect below always finds the
  // renderer promise and registers its delayRender handle before Remotion can capture the frame.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const renderer = createMengerDiveRenderer({ antialiasingGridSize, canvas });
    rendererRef.current = renderer;
    return () => {
      rendererRef.current = null;
      renderer.then(
        (createdRenderer) => createdRenderer.destroy(),
        () => {},
      );
    };
  }, [antialiasingGridSize]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) {
      return;
    }
    // Every frame is a pure function of its time. Remotion captures it after the GPU finishes.
    const handle = delayRender(`Rendering Menger dive frame ${frame}`);
    renderer
      .then((createdRenderer) =>
        createdRenderer.render(readMengerDiveCamera((frame + timeOffsetInFrames) / fps)),
      )
      .then(
        () => continueRender(handle),
        (error: unknown) => cancelRender(error),
      );
  }, [antialiasingGridSize, fps, frame, timeOffsetInFrames]);

  return (
    <AbsoluteFill>
      <canvas height={height} ref={canvasRef} width={width} />
    </AbsoluteFill>
  );
}
