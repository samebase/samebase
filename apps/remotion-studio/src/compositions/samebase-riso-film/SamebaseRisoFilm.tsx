import { useMemo } from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { useWebGpuFrame } from "../../webgpu/useWebGpuFrame";
import { landscapeLayout, portraitLayout } from "./filmLayout";
import { createFilmRenderer } from "./filmRenderer";
import { readFilmFrame } from "./filmTimeline";

export type SamebaseRisoFilmProps = {
  /** `landscape` is the 1920x1080 film. `portrait` is the 1080x1350 feed cut. */
  format: "landscape" | "portrait";
};

/** The riso zine brand film. The music is local only: `public/media/samebase-riso-film.mp3`. */
export function SamebaseRisoFilm({ format }: SamebaseRisoFilmProps) {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const layout = format === "portrait" ? portraitLayout : landscapeLayout;
  const filmFrame = useMemo(() => readFilmFrame(frame / fps, layout), [fps, frame, layout]);
  const canvasRef = useWebGpuFrame(createFilmRenderer, filmFrame);

  return (
    <AbsoluteFill>
      <canvas height={height} ref={canvasRef} width={width} />
      <Audio src={staticFile("media/samebase-riso-film.mp3")} />
    </AbsoluteFill>
  );
}
