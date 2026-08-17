import { parseSrt, type Caption } from "@remotion/captions";
import { useCallback, useEffect, useState } from "react";
import {
  AbsoluteFill,
  Html5Audio,
  Interactive,
  OffthreadVideo,
  Sequence,
  Series,
  staticFile,
  useCurrentFrame,
  useDelayRender,
} from "remotion";
import {
  founderDemoEditSegments,
  founderDemoFps,
  founderDemoMaximumDirectPlaybackRate,
  founderDemoTimelapsePlaybackRate,
  getFounderDemoPlaybackRate,
  getFounderDemoSegmentPlaybackRate,
  getFounderDemoSegmentSourceFrame,
  getFounderDemoSourceFrame,
  type FounderDemoEditSegment,
  type FounderDemoFaceSegment,
  type FounderDemoWaitSegment,
} from "./founderDemoEdit";

const faceRecording = staticFile("media/founder-demo-face.mp4");
const screenRecording = staticFile("media/founder-demo-screen.mp4");
const timelapseRecording = staticFile("media/founder-demo-screen-24x.mp4");
const subtitles = staticFile("media/founder-demo.srt");
const acceleratedScreenRecording = `${screenRecording}#disable`;
const acceleratedTimelapseRecording = `${timelapseRecording}#disable`;

export const founderDemoHeight = 1_240;
export const founderDemoWidth = 1_920;
const faceFadeDurationInFrames = Math.round(founderDemoFps * 0.4);
const audioFadeDurationInFrames = founderDemoFps;

const CaptionText: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      backgroundColor: "rgba(16, 23, 25, 0.86)",
      bottom: 140,
      color: "white",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: 44,
      fontWeight: 650,
      left: "50%",
      lineHeight: 1.2,
      maxWidth: 1_280,
      padding: "12px 18px",
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
  segment: FounderDemoFaceSegment;
}> = ({ captions, segment }) =>
  captions.map((caption, index) => {
    const captionStartInSourceFrames = (caption.startMs / 1_000) * founderDemoFps;
    const captionEndInSourceFrames = (caption.endMs / 1_000) * founderDemoFps;
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
        <CaptionText text={caption.text} />
      </Sequence>
    );
  });

const FaceBubble: React.FC<{ segment: FounderDemoFaceSegment }> = ({ segment }) => {
  const frame = useCurrentFrame();
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
        boxShadow: "0 18px 44px rgba(0, 0, 0, 0.28)",
        height: 330,
        opacity,
        overflow: "hidden",
        position: "absolute",
        right: 40,
        top: 44,
        width: 330,
      }}
    >
      <OffthreadVideo
        muted
        playbackRate={1}
        src={faceRecording}
        style={{
          height: "100%",
          objectFit: "cover",
          objectPosition: "57% 58%",
          width: "100%",
        }}
        trimAfter={segment.sourceEndInFrames}
        trimBefore={segment.sourceStartInFrames}
      />
    </Interactive.Div>
  );
};

const AcceleratedScreen: React.FC<{ segment: FounderDemoWaitSegment }> = ({ segment }) => {
  const frame = useCurrentFrame();
  const playbackRate = getFounderDemoSegmentPlaybackRate(segment, frame);
  const sourceFrame = getFounderDemoSegmentSourceFrame(segment, frame);
  const isTimelapse = playbackRate > founderDemoMaximumDirectPlaybackRate;

  return (
    <Sequence from={frame} showInTimeline={false}>
      <OffthreadVideo
        muted
        playbackRate={isTimelapse ? playbackRate / founderDemoTimelapsePlaybackRate : playbackRate}
        src={isTimelapse ? acceleratedTimelapseRecording : acceleratedScreenRecording}
        style={{ height: "100%", objectFit: "contain", width: "100%" }}
        trimAfter={
          isTimelapse
            ? segment.sourceEndInFrames / founderDemoTimelapsePlaybackRate
            : segment.sourceEndInFrames
        }
        trimBefore={isTimelapse ? sourceFrame / founderDemoTimelapsePlaybackRate : sourceFrame}
      />
    </Sequence>
  );
};

const SegmentAudio: React.FC<{ segment: FounderDemoEditSegment }> = ({ segment }) => {
  if (segment.kind === "face") {
    return (
      <Html5Audio
        src={screenRecording}
        trimAfter={segment.sourceEndInFrames}
        trimBefore={segment.sourceStartInFrames}
      />
    );
  }

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

const FounderDemoAudioTimeline: React.FC = () => (
  <Series name="Founder demo audio">
    {founderDemoEditSegments.map((segment) => (
      <Series.Sequence
        durationInFrames={segment.durationInFrames}
        key={`${segment.sourceStartInFrames}-${segment.sourceEndInFrames}`}
        name={`${segment.name} audio`}
      >
        <SegmentAudio segment={segment} />
      </Series.Sequence>
    ))}
  </Series>
);

export const FounderDemoAudio: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "black" }}>
    <FounderDemoAudioTimeline />
  </AbsoluteFill>
);

export const FounderDemo: React.FC = () => {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const { cancelRender, continueRender, delayRender } = useDelayRender();
  const [captionLoadHandle] = useState(() => delayRender("Load founder demo captions"));
  const frame = useCurrentFrame();
  const playbackRate = getFounderDemoPlaybackRate(frame);
  const sourceFrame = getFounderDemoSourceFrame(frame);
  const playbackRateLabel = playbackRate.toFixed(1);
  const sourceTimeInTenths = Math.floor((sourceFrame * 10) / founderDemoFps);
  const sourceMinutes = Math.floor(sourceTimeInTenths / 600);
  const sourceSeconds = Math.floor((sourceTimeInTenths % 600) / 10);
  const sourceTenths = sourceTimeInTenths % 10;
  const sourceTime = `${String(sourceMinutes).padStart(2, "0")}:${String(sourceSeconds).padStart(2, "0")}.${sourceTenths}`;

  const fetchCaptions = useCallback(async () => {
    try {
      const response = await fetch(subtitles);
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
  }, [cancelRender, captionLoadHandle, continueRender]);

  useEffect(() => {
    void fetchCaptions();
  }, [fetchCaptions]);

  return (
    <AbsoluteFill style={{ backgroundColor: "black", overflow: "hidden" }}>
      <Series name="Founder demo edit">
        {founderDemoEditSegments.map((segment) => (
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
              <AcceleratedScreen segment={segment} />
            )}
            {segment.kind === "face" ? <FaceBubble segment={segment} /> : null}
            {captions && segment.kind === "face" ? (
              <SegmentCaptions captions={captions} segment={segment} />
            ) : null}
          </Series.Sequence>
        ))}
      </Series>
      <FounderDemoAudioTimeline />
      <Interactive.Div
        name="Speed and source time"
        style={{
          alignItems: "baseline",
          backgroundColor: "rgba(16, 23, 25, 0.94)",
          bottom: 32,
          color: "white",
          display: "flex",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontVariantNumeric: "tabular-nums",
          gap: 18,
          padding: "16px 20px",
          position: "absolute",
          right: 32,
          zIndex: 1,
        }}
      >
        <span style={{ color: "#29b8d3", fontSize: 38, fontWeight: 750 }}>
          {playbackRateLabel}×
        </span>
        <span style={{ fontSize: 28, fontWeight: 650 }}>{sourceTime}</span>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
