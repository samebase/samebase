import {
  AbsoluteFill,
  Interactive,
  interpolate,
  OffthreadVideo,
  Sequence,
  Series,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {
  getTicTacToeEditSegment,
  getTicTacToeSourceFrame,
  ticTacToeEditSegments,
  ticTacToeRecordingFps,
} from "./ticTacToeEdit";
import { ticTacToeRecordingCrop } from "./ticTacToeRecordingCrop";

const recording = staticFile("media/tic-tac-toe-4x4x4.mp4");
const chapterCardDurationInFrames = 72;

const videoStyle: React.CSSProperties = {
  height: ticTacToeRecordingCrop.sourceHeight,
  left: -ticTacToeRecordingCrop.left,
  position: "absolute",
  top: -ticTacToeRecordingCrop.top,
  width: ticTacToeRecordingCrop.sourceWidth,
};

const ChapterCard: React.FC<{ chapter: string }> = ({ chapter }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, 10, chapterCardDurationInFrames - 18, chapterCardDurationInFrames - 1],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const rise = interpolate(frame, [0, 12], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        backgroundColor: "rgba(16, 23, 25, 0.94)",
        color: "white",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 32,
        fontWeight: 750,
        letterSpacing: "0.16em",
        opacity,
        padding: "18px 22px",
        pointerEvents: "none",
        position: "absolute",
        right: 32,
        top: 104,
        transform: `translateY(${rise}px)`,
        zIndex: 1,
      }}
    >
      {chapter}
    </div>
  );
};

export const TicTacToeRecording: React.FC = () => {
  const frame = useCurrentFrame();
  const editSegment = getTicTacToeEditSegment(frame);
  const sourceFrame = getTicTacToeSourceFrame(frame);
  const sourceTimeInTenths = Math.floor((sourceFrame * 10) / ticTacToeRecordingFps);
  const sourceMinutes = Math.floor(sourceTimeInTenths / 600);
  const sourceSeconds = Math.floor((sourceTimeInTenths % 600) / 10);
  const sourceTenths = sourceTimeInTenths % 10;
  const sourceTime = `${String(sourceMinutes).padStart(2, "0")}:${String(sourceSeconds).padStart(2, "0")}.${sourceTenths}`;

  return (
    <AbsoluteFill style={{ backgroundColor: "#fcfcfc", overflow: "hidden" }}>
      <Series name="Master edit">
        {ticTacToeEditSegments.map((segment) => (
          <Series.Sequence
            durationInFrames={segment.durationInFrames}
            key={`${segment.sourceStartInFrames}-${segment.sourceEndInFrames}`}
            name={segment.name}
          >
            <OffthreadVideo
              playbackRate={segment.playbackRate}
              src={recording}
              style={videoStyle}
              trimAfter={segment.sourceEndInFrames}
              trimBefore={segment.sourceStartInFrames}
            />
            {segment.chapter ? (
              <Sequence
                durationInFrames={Math.min(chapterCardDurationInFrames, segment.durationInFrames)}
                name={`${segment.chapter} chapter`}
              >
                <ChapterCard chapter={segment.chapter} />
              </Sequence>
            ) : null}
          </Series.Sequence>
        ))}
      </Series>
      <Interactive.Div
        name="Speed and elapsed time"
        style={{
          alignItems: "baseline",
          backgroundColor: "rgba(16, 23, 25, 0.94)",
          bottom: 32,
          color: "white",
          display: "flex",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontVariantNumeric: "tabular-nums",
          gap: 24,
          padding: "20px 24px",
          position: "absolute",
          right: 32,
          zIndex: 1,
        }}
      >
        <span style={{ color: "#29b8d3", fontSize: 42, fontWeight: 750 }}>
          {editSegment.playbackRate}×
        </span>
        <span style={{ fontSize: 32, fontWeight: 650 }}>{sourceTime}</span>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
