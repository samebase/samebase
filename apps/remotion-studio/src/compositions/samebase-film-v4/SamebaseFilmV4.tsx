import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  cancelRender,
  continueRender,
  delayRender,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { useWebGpuFrame } from "../../webgpu/useWebGpuFrame";
import { createFilmV3Renderer } from "../samebase-film-v3/filmV3Renderer";
import { css, drawText, fontFor, waitForFilmV3Fonts } from "../samebase-film-v3/filmV3Page";
import type { FilmV3Frame, Rgb } from "../samebase-film-v3/filmV3Timeline";
import {
  type FilmV4Frame,
  type FilmV4Outline,
  lookSeconds,
  readFilmV4Frame,
} from "./filmV4Timeline";

function FilmLayer({ frame, opacity }: { frame: FilmV3Frame; opacity: number }) {
  const { height, width } = useVideoConfig();
  const canvasRef = useWebGpuFrame(createFilmV3Renderer, frame);
  return (
    <AbsoluteFill style={{ opacity }}>
      <canvas height={height} ref={canvasRef} width={width} />
    </AbsoluteFill>
  );
}

/**
The haze rises from the bottom edge, so the words stay readable over the sponge. A tall frame has
its words higher, above the feed controls, so its haze is full from 80 percent of the height down.
*/
function drawVeil(context: CanvasRenderingContext2D, veil: number, pale: Rgb): void {
  const { height, width } = context.canvas;
  const [from, full] = height > width ? [0.52, 0.8] : [0.68, 1];
  const gradient = context.createLinearGradient(0, from * height, 0, full * height);
  gradient.addColorStop(0, css(pale, 0));
  gradient.addColorStop(1, css(pale, 0.9 * veil));
  context.fillStyle = gradient;
  context.fillRect(0, from * height, width, (1 - from) * height);
}

/** A pale line under an ink line, so the outline and its label read on every face tone. */
function drawOutline(
  context: CanvasRenderingContext2D,
  outline: FilmV4Outline,
  { ink, pale }: FilmV4Frame["overlay"],
): void {
  const { cap, drawn, label, labelOpacity, opacity, radius, x, y } = outline;
  // The outline sizes follow the short side, as the camera does.
  const unit = Math.min(context.canvas.height, context.canvas.width);
  context.save();
  context.globalAlpha = opacity;
  context.lineJoin = "round";
  context.beginPath();
  const vertex = (index: number) => {
    const angle = Math.PI / 2 + (index * Math.PI) / 3;
    return [x + radius * Math.cos(angle), y - radius * Math.sin(angle)] as const;
  };
  context.moveTo(...vertex(0));
  const steps = drawn * 6;
  for (let step = 1; step <= Math.ceil(steps); step += 1) {
    // The last traced edge ends part of the way to its vertex.
    const [[fromX, fromY], [toX, toY]] = [vertex(step - 1), vertex(step)];
    const along = Math.min(1, steps - (step - 1));
    context.lineTo(fromX + (toX - fromX) * along, fromY + (toY - fromY) * along);
  }
  context.strokeStyle = css(pale);
  context.lineWidth = 0.012 * unit;
  context.stroke();
  context.strokeStyle = css(ink);
  context.lineWidth = 0.005 * unit;
  context.stroke();
  context.globalAlpha = labelOpacity;
  context.font = fontFor(context, cap);
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.lineWidth = 0.35 * cap;
  context.strokeStyle = css(pale);
  context.strokeText(label, x, y - radius - 0.6 * cap);
  context.fillStyle = css(ink);
  context.fillText(label, x, y - radius - 0.6 * cap);
  context.restore();
}

/** The veil, the outlines, and the words over both renders, drawn once the display font has loaded. */
function OverlayLayer({ outlines, overlay, texts, veil }: Omit<FilmV4Frame, "layers">) {
  const { height, width } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [fontHandle] = useState(() => delayRender("Loading the film v4 font"));
  useLayoutEffect(() => {
    waitForFilmV3Fonts().then(
      () => {
        setFontsReady(true);
        continueRender(fontHandle);
      },
      (error: unknown) => cancelRender(error),
    );
  }, [fontHandle]);
  useLayoutEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!fontsReady || !context) {
      return;
    }
    context.clearRect(0, 0, width, height);
    if (veil > 0) {
      drawVeil(context, veil, overlay.pale);
    }
    for (const outline of outlines) {
      if (outline.opacity > 0) {
        drawOutline(context, outline, overlay);
      }
    }
    for (const line of texts) {
      drawText(context, line);
    }
  }, [fontsReady, height, outlines, overlay, texts, veil, width]);
  return (
    <AbsoluteFill>
      <canvas height={height} ref={canvasRef} width={width} />
    </AbsoluteFill>
  );
}

/** Sound effects, placed so that each peak lands on its picture hit. */
const soundCues = [
  { at: 0.2, name: "drag", volume: 0.3 },
  { at: 3.05, name: "reveal", volume: 0.45 },
  { at: 17.38, name: "lift", volume: 0.62 },
] as const;

/**
The look again film. The music plays the whole track with no cut. The music and the sound effects
are `public/media/samebase-film-v3*.mp3`, in Git LFS.
*/
export function SamebaseFilmV4() {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const v4 = useMemo(
    () => readFilmV4Frame(frame / fps, { height, width }),
    [fps, frame, height, width],
  );
  return (
    <AbsoluteFill style={{ backgroundColor: "#dfe4ea" }}>
      {v4.layers.map((layer) => (
        <FilmLayer frame={layer.frame} key={layer.id} opacity={layer.opacity} />
      ))}
      <OverlayLayer outlines={v4.outlines} overlay={v4.overlay} texts={v4.texts} veil={v4.veil} />
      <Audio
        src={staticFile("media/samebase-film-v3.mp3")}
        endAt={lookSeconds * fps}
        // The track peaks near 0 dBFS; this leaves headroom for the sound effects on top.
        volume={0.84}
      />
      {soundCues.map(({ at, name, volume }) => (
        <Sequence from={Math.round(at * fps)} key={name}>
          <Audio src={staticFile(`media/samebase-film-v3-${name}.mp3`)} volume={volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
