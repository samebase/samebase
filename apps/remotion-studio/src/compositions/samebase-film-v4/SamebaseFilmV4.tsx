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
import {
  createIllusionStudyRenderer,
  type IllusionStudyFrame,
} from "../illusion-studies/illusionStudyRenderer";
import { createFilmV3Renderer } from "../samebase-film-v3/filmV3Renderer";
import { css, drawText, fontFor, waitForFilmV3Fonts } from "../samebase-film-v3/filmV3Page";
import { palettes, type FilmV3Frame } from "../samebase-film-v3/filmV3Timeline";
import {
  type FilmV4Frame,
  type FilmV4Outline,
  type FilmV4Variant,
  type FourthFold,
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

function StudyLayer({ frame, opacity }: { frame: IllusionStudyFrame; opacity: number }) {
  const { height, width } = useVideoConfig();
  const canvasRef = useWebGpuFrame(createIllusionStudyRenderer, frame);
  return (
    <AbsoluteFill style={{ opacity }}>
      <canvas height={height} ref={canvasRef} width={width} />
    </AbsoluteFill>
  );
}

const [ink, pale] = [palettes.haze.ink, palettes.haze.sky[1]];

/** The haze rises from the bottom edge, so the words stay readable over the sponge. */
function drawVeil(context: CanvasRenderingContext2D, veil: number): void {
  const { height, width } = context.canvas;
  const gradient = context.createLinearGradient(0, 0.68 * height, 0, height);
  gradient.addColorStop(0, css(pale, 0));
  gradient.addColorStop(1, css(pale, 0.9 * veil));
  context.fillStyle = gradient;
  context.fillRect(0, 0.68 * height, width, 0.32 * height);
}

/** A pale line under an ink line, so the outline and its label read on every face tone. */
function drawOutline(context: CanvasRenderingContext2D, outline: FilmV4Outline): void {
  const { cap, drawn, label, labelOpacity, opacity, radius, x, y } = outline;
  const unit = context.canvas.height;
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
function OverlayLayer({ outlines, texts, veil }: Omit<FilmV4Frame, "layers">) {
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
      drawVeil(context, veil);
    }
    for (const outline of outlines) {
      if (outline.opacity > 0) {
        drawOutline(context, outline);
      }
    }
    for (const line of texts) {
      drawText(context, line);
    }
  }, [fontsReady, height, outlines, texts, veil, width]);
  return (
    <AbsoluteFill>
      <canvas height={height} ref={canvasRef} width={width} />
    </AbsoluteFill>
  );
}

/**
One cut of the v3.5 music. `from` and `to` are track seconds and `at` is film seconds; each cut fades
in and out over two frames, so a jump in the track makes no click.
*/
type MusicCut = { at: number; from: number; to: number };

/**
Every cut leaves out the near-silent fall of the track from 14 s to 17.5 s: each jump lands on a
beat, from the groove straight onto the lift, so the music never stops.
*/
const music: Record<FilmV4Variant, readonly MusicCut[]> = {
  a: [
    { at: 0, from: 0, to: 14 },
    { at: 14, from: 17.5, to: 42 },
  ],
  b: [
    { at: 0, from: 0, to: 3.5 },
    { at: 3.5, from: 17.5, to: 42 },
  ],
  c: [
    { at: 0, from: 0, to: 8.5 },
    { at: 8.5, from: 17.5, to: 25.5 },
    { at: 16.5, from: 33.5, to: 42 },
  ],
  look: [{ at: 0, from: 0, to: 42 }],
};

/** Sound effects, placed so that each peak lands on its picture hit, as in v3.5. */
const soundCues: Record<FilmV4Variant, readonly { at: number; name: string; volume: number }[]> = {
  a: [
    { at: 0.4, name: "drag", volume: 0.3 },
    { at: 3.15, name: "reveal", volume: 0.45 },
    { at: 13.88, name: "lift", volume: 0.62 },
    { at: 17.5, name: "close", volume: 0.5 },
  ],
  b: [
    { at: 0.4, name: "drag", volume: 0.3 },
    { at: 3.38, name: "lift", volume: 0.62 },
    { at: 7, name: "close", volume: 0.5 },
  ],
  c: [
    { at: 0.4, name: "drag", volume: 0.3 },
    { at: 3.15, name: "reveal", volume: 0.45 },
  ],
  look: [
    { at: 0.2, name: "drag", volume: 0.3 },
    { at: 3.05, name: "reveal", volume: 0.45 },
    { at: 17.38, name: "lift", volume: 0.62 },
  ],
};

const fadeFrames = 2;

function MusicCutAudio({ cut, fadeOut, from }: { cut: MusicCut; fadeOut: boolean; from: number }) {
  const { fps } = useVideoConfig();
  const length = Math.round((cut.to - cut.from) * fps);
  const fadeIn = cut.at > 0;
  return (
    <Sequence durationInFrames={length} from={Math.round((cut.at - from) * fps)}>
      <Audio
        src={staticFile("media/samebase-film-v3.mp3")}
        startFrom={Math.round(cut.from * fps)}
        endAt={Math.round(cut.to * fps)}
        // The track peaks near 0 dBFS; this leaves headroom for the sound effects on top.
        volume={(frame) =>
          0.84 *
          (fadeIn ? Math.min(frame / fadeFrames, 1) : 1) *
          (fadeOut ? Math.min((length - frame) / fadeFrames, 1) : 1)
        }
      />
    </Sequence>
  );
}

export type SamebaseFilmV4Props = {
  fold: FourthFold;
  /** Film seconds at the first frame: 0 for the films, later for the fourth face beat clips. */
  from: number;
  variant: FilmV4Variant;
};

/**
The v4 brand films. The music and the sound effects are local only: `public/media/samebase-film-v3*.mp3`
from v3.5.
*/
export function SamebaseFilmV4({ fold, from, variant }: SamebaseFilmV4Props) {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const v4 = useMemo(
    () => readFilmV4Frame(variant, from + frame / fps, { height, width }, fold),
    [fold, fps, frame, from, height, variant, width],
  );
  const cuts = music[variant];
  return (
    <AbsoluteFill style={{ backgroundColor: "#dfe4ea" }}>
      {v4.layers.map((layer) =>
        layer.kind === "film" ? (
          <FilmLayer frame={layer.frame} key={layer.id} opacity={layer.opacity} />
        ) : (
          <StudyLayer frame={layer.frame} key={layer.id} opacity={layer.opacity} />
        ),
      )}
      <OverlayLayer outlines={v4.outlines} texts={v4.texts} veil={v4.veil} />
      {cuts.map((cut, index) => (
        <MusicCutAudio cut={cut} fadeOut={index < cuts.length - 1} from={from} key={cut.at} />
      ))}
      {soundCues[variant].map(({ at, name, volume }) => (
        <Sequence from={Math.round((at - from) * fps)} key={`${name}-${at}`}>
          <Audio src={staticFile(`media/samebase-film-v3-${name}.mp3`)} volume={volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
