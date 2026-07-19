import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const accent = "#00a8c7";
const ink = "#101719";
const muted = "#667176";
const paper = "#f4f7f7";
const cubicEasing = (value: number) => Easing.cubic(value);

const sceneStyle: React.CSSProperties = {
  justifyContent: "center",
  padding: "104px 96px 132px",
};

const eyebrowStyle: React.CSSProperties = {
  color: accent,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: "0.08em",
  marginBottom: 28,
  textTransform: "uppercase",
};

const titleStyle: React.CSSProperties = {
  color: ink,
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  fontSize: 72,
  fontWeight: 720,
  letterSpacing: "-0.055em",
  lineHeight: 0.98,
  margin: 0,
  maxWidth: 1000,
};

const bodyStyle: React.CSSProperties = {
  color: muted,
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  fontSize: 28,
  lineHeight: 1.35,
  margin: "30px 0 0",
  maxWidth: 780,
};

const CompositionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 18, 96, 119], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rise = interpolate(frame, [0, 24], [28, 0], {
    easing: Easing.out(cubicEasing),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ ...sceneStyle, opacity, transform: `translateY(${rise}px)` }}>
      <div style={eyebrowStyle}>01 / Composition</div>
      <h1 style={titleStyle}>Start with the canvas and the clock.</h1>
      <p style={bodyStyle}>
        This composition is 1280 × 720, lasts 12 seconds, and renders 30 frames for every second.
      </p>
    </AbsoluteFill>
  );
};

const FrameScene: React.FC = () => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, 119], [0, 720], {
    easing: Easing.inOut(cubicEasing),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(frame, [0, 16, 102, 119], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ ...sceneStyle, opacity }}>
      <div style={eyebrowStyle}>02 / Frames</div>
      <h1 style={titleStyle}>The current frame drives every change.</h1>
      <div
        style={{
          backgroundColor: "#d9e4e6",
          height: 8,
          marginTop: 64,
          position: "relative",
          width: 760,
        }}
      >
        <div
          style={{
            backgroundColor: accent,
            borderRadius: "50%",
            height: 36,
            left: x,
            position: "absolute",
            top: -14,
            width: 36,
          }}
        />
      </div>
      <p style={bodyStyle}>
        Scrub slowly and watch the dot resolve to the same position on the same frame every time.
      </p>
    </AbsoluteFill>
  );
};

const SequenceScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const playhead = interpolate(frame, [0, 119], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ ...sceneStyle, opacity }}>
      <Interactive.Div
        name="Drag this badge"
        style={{
          backgroundColor: ink,
          color: "white",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 16,
          fontWeight: 700,
          padding: "13px 16px",
          position: "absolute",
          right: 96,
          top: 92,
          translate: "0px 0px",
        }}
      >
        Select and drag me in Studio
      </Interactive.Div>
      <div style={eyebrowStyle}>03 / Sequences</div>
      <h1 style={titleStyle}>Sequences decide when things exist.</h1>
      <div style={{ display: "flex", gap: 10, marginTop: 58, width: 900 }}>
        {["Composition", "Frames", "Sequences"].map((label, index) => (
          <div
            key={label}
            style={{
              backgroundColor: index === 2 ? accent : "#d9e4e6",
              color: index === 2 ? "white" : muted,
              flex: 1,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 18,
              fontWeight: 650,
              padding: "20px 22px",
            }}
          >
            {label}
          </div>
        ))}
      </div>
      <div
        style={{
          backgroundColor: ink,
          height: 54,
          marginTop: 12,
          overflow: "hidden",
          position: "relative",
          width: 900,
        }}
      >
        <div
          style={{
            backgroundColor: "white",
            height: "100%",
            left: `${playhead}%`,
            position: "absolute",
            width: 3,
          }}
        />
      </div>
      <p style={bodyStyle}>The three named rows in Studio are the three scenes in this file.</p>
    </AbsoluteFill>
  );
};

export const RemotionTour: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const progress = (frame / (durationInFrames - 1)) * 100;

  return (
    <AbsoluteFill style={{ backgroundColor: paper }}>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          left: 96,
          position: "absolute",
          right: 96,
          top: 58,
        }}
      >
        <div
          style={{
            color: ink,
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            fontSize: 22,
            fontWeight: 750,
          }}
        >
          Samebase Video Studio
        </div>
        <div
          style={{
            color: muted,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 18,
          }}
        >
          frame {String(frame).padStart(3, "0")} · {(frame / fps).toFixed(2)}s
        </div>
      </div>

      <Sequence name="01 Composition" durationInFrames={120}>
        <CompositionScene />
      </Sequence>
      <Sequence name="02 Frames" from={120} durationInFrames={120}>
        <FrameScene />
      </Sequence>
      <Sequence name="03 Sequences" from={240} durationInFrames={120}>
        <SequenceScene />
      </Sequence>

      <div
        style={{
          backgroundColor: "#d9e4e6",
          bottom: 72,
          height: 8,
          left: 96,
          position: "absolute",
          right: 96,
        }}
      >
        <div
          style={{
            backgroundColor: accent,
            height: "100%",
            width: `${progress}%`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
