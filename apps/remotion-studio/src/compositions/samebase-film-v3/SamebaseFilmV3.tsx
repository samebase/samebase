import { useMemo } from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { useWebGpuFrame } from "../../webgpu/useWebGpuFrame";
import { createFilmV3Renderer } from "./filmV3Renderer";
import { beatClipStart, filmV3Fps, type FourthDirection, readFilmV3Frame } from "./filmV3Timeline";

export type SamebaseFilmV3Props = {
  /** `film` is the whole film. `beat` replays the settle, the fourth direction, and the orbit after it. */
  cut: "beat" | "film";
  fourthDirection: FourthDirection;
  /** Antialiasing samples per pixel side. */
  sampleGrid: number;
};

/** The v3 brand film. The music is local only: `public/media/samebase-film-v3.mp3`. */
export function SamebaseFilmV3({ cut, fourthDirection, sampleGrid }: SamebaseFilmV3Props) {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const startSeconds = cut === "beat" ? beatClipStart : 0;
  const filmFrame = useMemo(
    () =>
      readFilmV3Frame(startSeconds + frame / fps, {
        fourthDirection,
        height,
        sampleGrid,
        width,
      }),
    [fourthDirection, fps, frame, height, sampleGrid, startSeconds, width],
  );
  const canvasRef = useWebGpuFrame(createFilmV3Renderer, filmFrame);

  return (
    <AbsoluteFill>
      <canvas height={height} ref={canvasRef} width={width} />
      <Audio
        src={staticFile("media/samebase-film-v3.mp3")}
        startFrom={Math.round(startSeconds * filmV3Fps)}
      />
    </AbsoluteFill>
  );
}
