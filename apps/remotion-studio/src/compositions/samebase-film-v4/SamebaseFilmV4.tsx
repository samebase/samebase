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
import { drawText, waitForFilmV3Fonts } from "../samebase-film-v3/filmV3Page";
import type { FilmV3Frame, FilmV3Text } from "../samebase-film-v3/filmV3Timeline";
import { type FilmV4Variant, type FourthFold, readFilmV4Frame } from "./filmV4Timeline";

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

/** The words over both renders, drawn once the display font has loaded. */
function TextLayer({ texts }: { texts: readonly FilmV3Text[] }) {
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
    for (const line of texts) {
      drawText(context, line);
    }
  }, [fontsReady, height, texts, width]);
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
  look: [
    { at: 0, from: 0, to: 14 },
    { at: 14, from: 17.5, to: 37.5 },
  ],
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
    { at: 13.88, name: "lift", volume: 0.62 },
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
      <TextLayer texts={v4.texts} />
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
