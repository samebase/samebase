import { loadFont } from "@remotion/google-fonts/CaveatBrush";
import { useMemo } from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { useWebGpuFrame } from "../../webgpu/useWebGpuFrame";
import { HEIGHT, WIDTH } from "./inkBrush";
import { createInkRenderer } from "./inkRenderer";
import { PORTRAIT_WIDTH, readPortraitWindow } from "./inkTimeline";

const font = loadFont("normal", { subsets: ["latin"], weights: ["400"] });

/** The lettering is drawn into a canvas, so the renderers start after the font has loaded. */
async function createLandscapeRenderer(canvas: HTMLCanvasElement) {
  await font.waitUntilDone();
  return createInkRenderer(canvas, "landscape");
}

async function createPortraitRenderer(canvas: HTMLCanvasElement) {
  await font.waitUntilDone();
  return createInkRenderer(canvas, "portrait");
}

/** The ink and watercolor brand film. The music is local only: `public/media/samebase-ink-film.mp3`. */
export function SamebaseInkFilm() {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const frameInput = useMemo(() => ({ time: frame / fps }), [fps, frame]);
  const canvasRef = useWebGpuFrame(createLandscapeRenderer, frameInput);

  return (
    <AbsoluteFill style={{ backgroundColor: "#F4ECDC" }}>
      <canvas height={height} ref={canvasRef} width={width} />
      <Audio src={staticFile("media/samebase-ink-film.mp3")} />
    </AbsoluteFill>
  );
}

/**
The 4:5 cut. It paints the same 1920 x 1080 frame with a portrait layout for the lettering, and
shows a window of it that follows each shot, scaled to fill 1080 x 1350.
*/
export function SamebaseInkFilmPortrait() {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const time = frame / fps;
  const frameInput = useMemo(() => ({ time }), [time]);
  const canvasRef = useWebGpuFrame(createPortraitRenderer, frameInput);
  const scale = width / PORTRAIT_WIDTH;

  return (
    <AbsoluteFill style={{ backgroundColor: "#F4ECDC", overflow: "hidden" }}>
      <canvas
        height={HEIGHT}
        ref={canvasRef}
        style={{
          height: HEIGHT * scale,
          left: -readPortraitWindow(time) * scale,
          position: "absolute",
          top: 0,
          width: WIDTH * scale,
        }}
        width={WIDTH}
      />
      <Audio src={staticFile("media/samebase-ink-film.mp3")} />
    </AbsoluteFill>
  );
}
