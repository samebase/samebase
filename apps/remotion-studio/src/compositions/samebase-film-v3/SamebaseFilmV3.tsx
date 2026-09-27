import { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { useWebGpuFrame } from "../../webgpu/useWebGpuFrame";
import { createFilmV3Renderer } from "./filmV3Renderer";
import {
  beatClipStart,
  filmV3Fps,
  type FilmV3Format,
  type FourthDirection,
  readFilmV3Frame,
} from "./filmV3Timeline";

export type SamebaseFilmV3Props = {
  /** `film` is the whole film. `beat` replays the settle, the fourth direction, and the orbit after it. */
  cut: "beat" | "film";
  format: FilmV3Format;
  fourthDirection: FourthDirection;
  /** Antialiasing samples per pixel side. */
  sampleGrid: number;
};

/** The v3 brand film. The music is local only: `public/media/samebase-film-v3.mp3`. */
export function SamebaseFilmV3({ cut, format, fourthDirection, sampleGrid }: SamebaseFilmV3Props) {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const startSeconds = cut === "beat" ? beatClipStart : 0;
  const filmFrame = useMemo(
    () =>
      readFilmV3Frame(startSeconds + frame / fps, {
        format,
        fourthDirection,
        height,
        sampleGrid,
        width,
      }),
    [format, fourthDirection, fps, frame, height, sampleGrid, startSeconds, width],
  );
  const canvasRef = useWebGpuFrame(createFilmV3Renderer, filmFrame);
  const cues = soundCues.filter(({ at }) => at >= startSeconds);

  return (
    <AbsoluteFill>
      <canvas height={height} ref={canvasRef} width={width} />
      <Audio
        src={staticFile("media/samebase-film-v3.mp3")}
        startFrom={Math.round(startSeconds * filmV3Fps)}
        // The track peaks near 0 dBFS; this leaves headroom for the sound effects on top.
        volume={0.84}
      />
      {cues.map(({ at, name, volume }) => (
        <Sequence from={Math.round((at - startSeconds) * filmV3Fps)} key={`${name}-${at}`}>
          <Audio src={staticFile(`media/samebase-film-v3-${name}.mp3`)} volume={volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

/**
Sound effects, placed so that each peak lands on its picture hit. The drag peaks 0.2 s in, the
lift impact 0.12 s in (on the music lift at 17.5 s), and the close click 0.2 s in.
*/
const soundCues = [
  { at: 1.9, name: "drag", volume: 0.36 },
  { at: 4.85, name: "drag", volume: 0.24 },
  { at: 9.45, name: "reveal", volume: 0.5 },
  { at: 17.38, name: "lift", volume: 0.62 },
  { at: 20.8, name: "close", volume: 0.5 },
] as const;
