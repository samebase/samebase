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
import { filmV4Fps, type FilmV4Variant, readFilmV4Frame } from "./filmV4Timeline";

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

const music: Record<FilmV4Variant, readonly MusicCut[]> = {
  a: [{ at: 0, from: 0, to: 42 }],
  b: [
    { at: 0, from: 0, to: 4 },
    { at: 4, from: 14, to: 42 },
  ],
  c: [
    { at: 0, from: 0, to: 7 },
    { at: 7, from: 14, to: 25.5 },
    { at: 18.5, from: 33.5, to: 42 },
  ],
};

/** Sound effects, placed so that each peak lands on its picture hit, as in v3.5. */
const soundCues: Record<FilmV4Variant, readonly { at: number; name: string; volume: number }[]> = {
  a: [
    { at: 1.9, name: "drag", volume: 0.3 },
    { at: 4.65, name: "reveal", volume: 0.45 },
    { at: 17.38, name: "lift", volume: 0.62 },
    { at: 21.24, name: "close", volume: 0.5 },
  ],
  b: [
    { at: 1.9, name: "drag", volume: 0.3 },
    { at: 7.38, name: "lift", volume: 0.62 },
    { at: 11.24, name: "close", volume: 0.5 },
  ],
  c: [
    { at: 1.9, name: "drag", volume: 0.3 },
    { at: 4.65, name: "reveal", volume: 0.45 },
  ],
};

const fadeFrames = 2;

function MusicCutAudio({ cut, fadeOut }: { cut: MusicCut; fadeOut: boolean }) {
  const length = Math.round((cut.to - cut.from) * filmV4Fps);
  const fadeIn = cut.at > 0;
  return (
    <Sequence durationInFrames={length} from={Math.round(cut.at * filmV4Fps)}>
      <Audio
        src={staticFile("media/samebase-film-v3.mp3")}
        startFrom={Math.round(cut.from * filmV4Fps)}
        endAt={Math.round(cut.to * filmV4Fps)}
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

export type SamebaseFilmV4Props = { variant: FilmV4Variant };

/**
The v4 brand films. The music and the sound effects are local only: `public/media/samebase-film-v3*.mp3`
from v3.5.
*/
export function SamebaseFilmV4({ variant }: SamebaseFilmV4Props) {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const v4 = useMemo(
    () => readFilmV4Frame(variant, frame / fps, { height, width }),
    [variant, fps, frame, height, width],
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
        <MusicCutAudio cut={cut} fadeOut={index < cuts.length - 1} key={cut.at} />
      ))}
      {soundCues[variant].map(({ at, name, volume }) => (
        <Sequence from={Math.round(at * filmV4Fps)} key={`${name}-${at}`}>
          <Audio src={staticFile(`media/samebase-film-v3-${name}.mp3`)} volume={volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
