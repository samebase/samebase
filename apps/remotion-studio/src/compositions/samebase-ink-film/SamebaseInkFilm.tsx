import { loadFont } from "@remotion/google-fonts/CaveatBrush";
import { useMemo } from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { useWebGpuFrame } from "../../webgpu/useWebGpuFrame";
import { createInkRenderer } from "./inkRenderer";

const font = loadFont("normal", { subsets: ["latin"], weights: ["400"] });

/** The lettering is drawn into a canvas, so the renderer starts after the font has loaded. */
async function createRenderer(canvas: HTMLCanvasElement) {
  await font.waitUntilDone();
  return createInkRenderer(canvas);
}

/** The ink and watercolor brand film. The music is local only: `public/media/samebase-ink-film.mp3`. */
export function SamebaseInkFilm() {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const frameInput = useMemo(() => ({ time: frame / fps }), [fps, frame]);
  const canvasRef = useWebGpuFrame(createRenderer, frameInput);

  return (
    <AbsoluteFill style={{ backgroundColor: "#F4ECDC" }}>
      <canvas height={height} ref={canvasRef} width={width} />
      <Audio src={staticFile("media/samebase-ink-film.mp3")} />
    </AbsoluteFill>
  );
}
