import { useMemo } from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { useWebGpuFrame } from "../../webgpu/useWebGpuFrame";
import { createFilmRenderer } from "./filmRenderer";
import { loopDurationInSeconds, loopMusicStart, readLoopFrame } from "./filmTimeline";

/** The seamless social loop: four bars of the finale over an endless isometric pull back. */
export function SamebaseRisoLoop() {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const filmFrame = useMemo(() => readLoopFrame(frame / fps), [fps, frame]);
  const canvasRef = useWebGpuFrame(createFilmRenderer, filmFrame);

  return (
    <AbsoluteFill>
      <canvas height={height} ref={canvasRef} width={width} />
      <Audio
        src={staticFile("media/samebase-riso-film.mp3")}
        trimAfter={(loopMusicStart + loopDurationInSeconds) * fps}
        trimBefore={loopMusicStart * fps}
      />
    </AbsoluteFill>
  );
}
