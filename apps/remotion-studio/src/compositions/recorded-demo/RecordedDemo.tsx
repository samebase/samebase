import { parseSrt, type Caption } from "@remotion/captions";
import { useCallback, useEffect, useState } from "react";
import {
  AbsoluteFill,
  Html5Audio,
  Interactive,
  OffthreadVideo,
  Sequence,
  Series,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";

import {
  getRecordedDemoPlaybackRate,
  getRecordedDemoSegmentPlaybackRate,
  getRecordedDemoSegmentSourceFrame,
  getRecordedDemoSourceFrame,
  type RecordedDemoEdit,
  type RecordedDemoEditSegment,
  type RecordedDemoFaceSegment,
  type RecordedDemoWaitSegment,
} from "./recordedDemoEdit";

const maximumDirectPlaybackRate = 16;
const timelapsePlaybackRate = 24;

export const recordedDemoHeight = 1_240;
export const recordedDemoWidth = 1_920;

type RecordedDemoProps = {
  captionsSource: string;
  edit: RecordedDemoEdit;
  faceCrop: "center" | "lower";
  facePlacement: "bottom-left" | "top-right";
  faceRecording: string;
  screenRecording: string;
  timelapseRecording: string;
};

const CaptionText: React.FC<{ layoutScale: number; text: string }> = ({ layoutScale, text }) => (
  <div
    style={{
      backgroundColor: "rgba(16, 23, 25, 0.86)",
      bottom: 140 * layoutScale,
      color: "white",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: 44 * layoutScale,
      fontWeight: 650,
      left: "50%",
      lineHeight: 1.2,
      maxWidth: 1_280 * layoutScale,
      padding: `${12 * layoutScale}px ${18 * layoutScale}px`,
      position: "absolute",
      textAlign: "center",
      transform: "translateX(-50%)",
      whiteSpace: "pre-line",
    }}
  >
    {text}
  </div>
);

const SegmentCaptions: React.FC<{
  captions: Caption[];
  edit: RecordedDemoEdit;
  layoutScale: number;
  segment: RecordedDemoFaceSegment;
}> = ({ captions, edit, layoutScale, segment }) =>
  captions.map((caption, index) => {
    const captionStartInSourceFrames = (caption.startMs / 1_000) * edit.fps;
    const captionEndInSourceFrames = (caption.endMs / 1_000) * edit.fps;
    const visibleStartInSourceFrames = Math.max(
      captionStartInSourceFrames,
      segment.sourceStartInFrames,
    );
    const visibleEndInSourceFrames = Math.min(captionEndInSourceFrames, segment.sourceEndInFrames);

    if (visibleEndInSourceFrames <= visibleStartInSourceFrames || caption.text.trim() === "") {
      return null;
    }

    const from = Math.floor(visibleStartInSourceFrames - segment.sourceStartInFrames);
    const end = Math.min(
      segment.durationInFrames,
      Math.ceil(visibleEndInSourceFrames - segment.sourceStartInFrames),
    );

    return (
      <Sequence
        durationInFrames={Math.max(1, end - from)}
        from={from}
        key={`${caption.startMs}-${caption.endMs}-${index}`}
        name={`Caption ${index + 1}`}
      >
        <CaptionText layoutScale={layoutScale} text={caption.text} />
      </Sequence>
    );
  });

const FaceBubble: React.FC<{
  edit: RecordedDemoEdit;
  faceCrop: RecordedDemoProps["faceCrop"];
  facePlacement: RecordedDemoProps["facePlacement"];
  faceRecording: string;
  layoutScale: number;
  segment: RecordedDemoFaceSegment;
}> = ({ edit, faceCrop, facePlacement, faceRecording, layoutScale, segment }) => {
  const frame = useCurrentFrame();
  const faceFadeDurationInFrames = Math.round(edit.fps * 0.4);
  const opacity = Math.min(
    1,
    frame / faceFadeDurationInFrames,
    (segment.durationInFrames - 1 - frame) / faceFadeDurationInFrames,
  );

  return (
    <Interactive.Div
      name="Face camera"
      style={{
        borderRadius: "50%",
        bottom: facePlacement === "bottom-left" ? 44 * layoutScale : undefined,
        boxShadow: `0 ${18 * layoutScale}px ${44 * layoutScale}px rgba(0, 0, 0, 0.28)`,
        height: 330 * layoutScale,
        left: facePlacement === "bottom-left" ? 40 * layoutScale : undefined,
        opacity,
        overflow: "hidden",
        position: "absolute",
        right: facePlacement === "top-right" ? 40 * layoutScale : undefined,
        top: facePlacement === "top-right" ? 44 * layoutScale : undefined,
        width: 330 * layoutScale,
      }}
    >
      <OffthreadVideo
        muted
        playbackRate={1}
        src={faceRecording}
        style={{
          height: faceCrop === "lower" ? "112%" : "100%",
          left: faceCrop === "lower" ? "-6%" : undefined,
          objectFit: "cover",
          objectPosition: "57% 58%",
          position: faceCrop === "lower" ? "absolute" : undefined,
          top: faceCrop === "lower" ? "-13%" : undefined,
          width: faceCrop === "lower" ? "112%" : "100%",
        }}
        trimAfter={segment.sourceEndInFrames}
        trimBefore={segment.sourceStartInFrames}
      />
    </Interactive.Div>
  );
};

const AcceleratedScreen: React.FC<{
  screenRecording: string;
  segment: RecordedDemoWaitSegment;
  timelapseRecording: string;
}> = ({ screenRecording, segment, timelapseRecording }) => {
  const frame = useCurrentFrame();
  const playbackRate = getRecordedDemoSegmentPlaybackRate(segment, frame);
  const sourceFrame = getRecordedDemoSegmentSourceFrame(segment, frame);
  const isTimelapse = playbackRate > maximumDirectPlaybackRate;
  const acceleratedScreenRecording = `${screenRecording}#disable`;
  const acceleratedTimelapseRecording = `${timelapseRecording}#disable`;

  return (
    <Sequence from={frame} showInTimeline={false}>
      <OffthreadVideo
        muted
        playbackRate={isTimelapse ? playbackRate / timelapsePlaybackRate : playbackRate}
        src={isTimelapse ? acceleratedTimelapseRecording : acceleratedScreenRecording}
        style={{ height: "100%", objectFit: "contain", width: "100%" }}
        trimAfter={
          isTimelapse
            ? segment.sourceEndInFrames / timelapsePlaybackRate
            : segment.sourceEndInFrames
        }
        trimBefore={isTimelapse ? sourceFrame / timelapsePlaybackRate : sourceFrame}
      />
    </Sequence>
  );
};

const SegmentAudio: React.FC<{
  edit: RecordedDemoEdit;
  screenRecording: string;
  segment: RecordedDemoEditSegment;
}> = ({ edit, screenRecording, segment }) => {
  if (segment.kind === "face") {
    return (
      <Html5Audio
        src={screenRecording}
        trimAfter={segment.sourceEndInFrames}
        trimBefore={segment.sourceStartInFrames}
      />
    );
  }

  const audioFadeDurationInFrames = edit.fps;

  return (
    <>
      <Sequence durationInFrames={audioFadeDurationInFrames} name="Audio fade out">
        <Html5Audio
          src={screenRecording}
          trimAfter={segment.sourceStartInFrames + audioFadeDurationInFrames}
          trimBefore={segment.sourceStartInFrames}
          volume={(frame) => 1 - frame / (audioFadeDurationInFrames - 1)}
        />
      </Sequence>
      <Sequence
        durationInFrames={audioFadeDurationInFrames}
        from={segment.durationInFrames - audioFadeDurationInFrames}
        name="Audio fade in"
      >
        <Html5Audio
          src={screenRecording}
          trimAfter={segment.sourceEndInFrames}
          trimBefore={segment.sourceEndInFrames - audioFadeDurationInFrames}
          volume={(frame) => frame / (audioFadeDurationInFrames - 1)}
        />
      </Sequence>
    </>
  );
};

const RecordedDemoAudioTimeline: React.FC<{
  edit: RecordedDemoEdit;
  screenRecording: string;
}> = ({ edit, screenRecording }) => (
  <Series name="Recorded demo audio">
    {edit.segments.map((segment) => (
      <Series.Sequence
        durationInFrames={segment.durationInFrames}
        key={`${segment.sourceStartInFrames}-${segment.sourceEndInFrames}`}
        name={`${segment.name} audio`}
      >
        <SegmentAudio edit={edit} screenRecording={screenRecording} segment={segment} />
      </Series.Sequence>
    ))}
  </Series>
);

export const RecordedDemoAudio: React.FC<{
  edit: RecordedDemoEdit;
  screenRecording: string;
}> = ({ edit, screenRecording }) => (
  <AbsoluteFill style={{ backgroundColor: "black" }}>
    <RecordedDemoAudioTimeline edit={edit} screenRecording={screenRecording} />
  </AbsoluteFill>
);

export const RecordedDemo: React.FC<RecordedDemoProps> = ({
  captionsSource,
  edit,
  faceCrop,
  facePlacement,
  faceRecording,
  screenRecording,
  timelapseRecording,
}) => {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const { cancelRender, continueRender, delayRender } = useDelayRender();
  const [captionLoadHandle] = useState(() => delayRender("Load recorded demo captions"));
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const layoutScale = width / recordedDemoWidth;
  const playbackRate = getRecordedDemoPlaybackRate(edit, frame);
  const sourceFrame = getRecordedDemoSourceFrame(edit, frame);
  const playbackRateLabel = playbackRate.toFixed(1);
  const sourceTimeInTenths = Math.floor((sourceFrame * 10) / edit.fps);
  const sourceMinutes = Math.floor(sourceTimeInTenths / 600);
  const sourceSeconds = Math.floor((sourceTimeInTenths % 600) / 10);
  const sourceTenths = sourceTimeInTenths % 10;
  const sourceTime = `${String(sourceMinutes).padStart(2, "0")}:${String(sourceSeconds).padStart(2, "0")}.${sourceTenths}`;

  const fetchCaptions = useCallback(async () => {
    try {
      const response = await fetch(captionsSource);
      if (!response.ok) {
        throw new Error(`Could not load captions: ${response.status}`);
      }

      const input = await response.text();
      const { captions: parsedCaptions } = parseSrt({ input });
      setCaptions(parsedCaptions);
      continueRender(captionLoadHandle);
    } catch (error) {
      cancelRender(error);
    }
  }, [cancelRender, captionLoadHandle, captionsSource, continueRender]);

  useEffect(() => {
    void fetchCaptions();
  }, [fetchCaptions]);

  return (
    <AbsoluteFill style={{ backgroundColor: "black", overflow: "hidden" }}>
      <Series name="Recorded demo edit">
        {edit.segments.map((segment) => (
          <Series.Sequence
            durationInFrames={segment.durationInFrames}
            key={`${segment.sourceStartInFrames}-${segment.sourceEndInFrames}`}
            name={segment.name}
          >
            {segment.kind === "face" ? (
              <OffthreadVideo
                muted
                playbackRate={1}
                src={screenRecording}
                style={{ height: "100%", objectFit: "contain", width: "100%" }}
                trimAfter={segment.sourceEndInFrames}
                trimBefore={segment.sourceStartInFrames}
              />
            ) : (
              <AcceleratedScreen
                screenRecording={screenRecording}
                segment={segment}
                timelapseRecording={timelapseRecording}
              />
            )}
            {segment.kind === "face" ? (
              <FaceBubble
                edit={edit}
                faceCrop={faceCrop}
                facePlacement={facePlacement}
                faceRecording={faceRecording}
                layoutScale={layoutScale}
                segment={segment}
              />
            ) : null}
            {captions && segment.kind === "face" ? (
              <SegmentCaptions
                captions={captions}
                edit={edit}
                layoutScale={layoutScale}
                segment={segment}
              />
            ) : null}
          </Series.Sequence>
        ))}
      </Series>
      <RecordedDemoAudioTimeline edit={edit} screenRecording={screenRecording} />
      <Interactive.Div
        name="Speed and source time"
        style={{
          alignItems: "baseline",
          backgroundColor: "rgba(16, 23, 25, 0.94)",
          bottom: 32 * layoutScale,
          color: "white",
          display: "flex",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontVariantNumeric: "tabular-nums",
          gap: 18 * layoutScale,
          padding: `${16 * layoutScale}px ${20 * layoutScale}px`,
          position: "absolute",
          right: 32 * layoutScale,
          zIndex: 1,
        }}
      >
        <span style={{ color: "#29b8d3", fontSize: 38 * layoutScale, fontWeight: 750 }}>
          {playbackRateLabel}×
        </span>
        <span style={{ fontSize: 28 * layoutScale, fontWeight: 650 }}>{sourceTime}</span>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
