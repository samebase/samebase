import { useMemo } from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { useWebGpuFrame } from "../../webgpu/useWebGpuFrame";
import { createFilmRenderer } from "./filmRenderer";
import { readFilmFrame } from "./filmTimeline";

/** The riso zine brand film. The music is local only: `public/media/samebase-riso-film.mp3`. */
export function SamebaseRisoFilm() {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const filmFrame = useMemo(() => readFilmFrame(frame / fps), [fps, frame]);
  const canvasRef = useWebGpuFrame(createFilmRenderer, filmFrame);

  return (
    <AbsoluteFill>
      <canvas height={height} ref={canvasRef} width={width} />
      <Audio src={staticFile("media/samebase-riso-film.mp3")} />
    </AbsoluteFill>
  );
}
