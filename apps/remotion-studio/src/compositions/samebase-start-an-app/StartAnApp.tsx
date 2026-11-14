import { AbsoluteFill, useCurrentFrame } from "remotion";

import { Cursor, SamebaseMark } from "./icons";
import { C, MONO, SANS } from "./samebase";
import { STEPS, STEPS_SECONDS, type Step, type StepFrame } from "./steps";
import { ease, framed, H, W } from "./time";

/*
"Start an app": Samebase's real flow in a Mac window, step by step, drawn with the html-demo
method. Every frame is a pure function of t = frame / fps: each step's view draws the app at
1200 x 750 for its own seconds, the window scales that stage into the frame, and a camera inside
the window zooms on the place where the work happens.
*/

const FPS = 60;
const END_SECONDS = 2.8;

export const StartAnAppMeta = {
  fps: FPS,
  durationInFrames: Math.round((STEPS_SECONDS + END_SECONDS) * FPS),
  width: 1920,
  height: 1080,
} as const;

// The window: a title bar over a 16:10 view of the stage, scaled by K.
const WIN_W = 1320;
const K = WIN_W / W;
const VIEW_H = H * K;
const TITLE_H = 40;
const WIN_X = (1920 - WIN_W) / 2;
const WIN_Y = 134;
const BAR_Y = WIN_Y + TITLE_H + VIEW_H + 14;

/*
A step that starts on another page dips, as html-demo's lagging view: the last frame of the step
before fades out to the page white over OUT seconds, and only then does the new step draw, fading
in over IN. The two never show at once. A step that continues the same page cuts.
*/
const OUT = 0.25;
const IN = 0.3;

function Stage({ frame }: { frame: StepFrame }) {
  const cam = framed(frame.camera);
  const s = cam.z * K;
  const tx = WIN_W / 2 - cam.cx * s;
  const ty = VIEW_H / 2 - cam.cy * s;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: W,
        height: H,
        transformOrigin: "0 0",
        transform: `translate(${tx}px, ${ty}px) scale(${s})`,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      {frame.page}
      {frame.cursor.opacity > 0.01 ? (
        <Cursor
          x={frame.cursor.x}
          y={frame.cursor.y}
          press={frame.cursor.press}
          scale={1.2 / cam.z}
          opacity={frame.cursor.opacity}
        />
      ) : null}
    </div>
  );
}

function TitleBar({ domain, speed }: { domain: string; speed: number | null }) {
  return (
    <div
      style={{
        position: "relative",
        height: TITLE_H,
        background: "#ebebeb",
        borderBottom: "1px solid #d4d4d4",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 5,
          width: 500,
          marginLeft: -250,
          height: 30,
          borderRadius: 8,
          background: "rgba(0,0,0,0.065)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          fontSize: 19,
          color: "#1f1f1f",
        }}
      >
        <svg width="12" height="14" viewBox="0 0 10 12" aria-hidden="true">
          <rect x="1" y="5" width="8" height="6.5" rx="1.2" fill="#6b6b6b" />
          <path
            d="M2.8 5V3.4a2.2 2.2 0 0 1 4.4 0V5"
            fill="none"
            stroke="#6b6b6b"
            strokeWidth="1.3"
          />
        </svg>
        {domain}
      </div>
      {speed !== null ? (
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontFamily: MONO,
            fontSize: 18,
            color: "#262626",
          }}
        >
          <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
            <path d="M0 0l8 6-8 6zM9 0l8 6-8 6z" fill="#3a3a3a" />
          </svg>
          {Math.round(speed)}× speed
        </div>
      ) : null}
    </div>
  );
}

function StepsBar({ index, progress }: { index: number; progress: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: WIN_X,
        top: BAR_Y,
        width: WIN_W,
        display: "flex",
        gap: 16,
        fontFamily: SANS,
      }}
    >
      {STEPS.map((step, i) => {
        const p = i < index ? 1 : i === index ? progress : 0;
        const on = i === index;
        return (
          <div key={step.id} style={{ flex: 1, opacity: on ? 1 : i < index ? 0.62 : 0.4 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, color: "#fff" }}>
              <span style={{ fontFamily: MONO, fontSize: 16, color: "rgba(255,255,255,0.6)" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ fontSize: 22 }}>{step.name}</span>
            </div>
            <div style={{ marginTop: 8, height: 2, background: "rgba(255,255,255,0.16)" }}>
              <div style={{ width: `${p * 100}%`, height: 2, background: "#fff" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EndCard({ t }: { t: number }) {
  const show = ease(t, 0, 0.5);
  const rise = (from: number) => ({
    opacity: ease(t, from, from + 0.5),
    transform: `translateY(${(1 - ease(t, from, from + 0.6)) * 14}px)`,
  });
  return (
    <AbsoluteFill
      style={{
        background: "#ffffff",
        opacity: show,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: SANS,
        color: C.fg,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 26, ...rise(0.4) }}>
        <SamebaseMark size={92} />
        <span style={{ fontSize: 92, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1 }}>
          Samebase
        </span>
        <span
          style={{
            marginLeft: 8,
            background: C.blue600,
            color: "#fff",
            fontSize: 30,
            fontWeight: 700,
            padding: "6px 16px",
            transform: "rotate(-3deg)",
          }}
        >
          BETA
        </span>
      </div>
      <div style={{ marginTop: 52, fontSize: 44, ...rise(0.6) }}>
        An opinionated way to use Alchemy.
      </div>
      <div style={{ marginTop: 26, fontSize: 30, color: C.muted, fontFamily: MONO, ...rise(0.75) }}>
        samebase.com
      </div>
    </AbsoluteFill>
  );
}

/** The step playing at `seconds`, how far into it, and the step before it. */
function locate(seconds: number): { index: number; step: Step; t: number; previous: Step | null } {
  let left = seconds;
  let previous: Step | null = null;
  for (const [index, step] of STEPS.entries()) {
    if (left < step.dur || index === STEPS.length - 1) {
      return { index, step, t: Math.min(left, step.dur), previous };
    }
    left -= step.dur;
    previous = step;
  }
  throw new Error("STEPS is empty.");
}

export function StartAnApp() {
  const seconds = useCurrentFrame() / FPS;
  const { index, step, t, previous } = locate(seconds);
  const dipping = previous !== null && step.enter === "dip" && t < OUT + IN;
  const leaving = dipping && t < OUT;
  const frame = leaving ? previous.view(previous.dur) : step.view(t);
  const pageOpacity = !dipping ? 1 : leaving ? 1 - ease(t, 0, OUT) : ease(t, OUT, OUT + IN);
  const intro = ease(seconds, 0, 0.6);
  // The caption changes with the page: on a dip, the old caption leaves with the old page.
  const captionStep = leaving ? previous : step;
  const caption = index === 0 ? ease(seconds, 0.1, 0.6) : dipping ? pageOpacity : ease(t, 0, 0.35);

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(120% 90% at 50% 38%, #3b4649 0%, #262e30 52%, #161b1c 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 26,
          textAlign: "center",
          fontFamily: SANS,
          color: "#fff",
          opacity: caption,
        }}
      >
        <div
          style={{ fontSize: 44, lineHeight: "52px", fontWeight: 700, letterSpacing: "-0.005em" }}
        >
          {captionStep.heading}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 25,
            lineHeight: "34px",
            color: "rgba(255,255,255,0.66)",
          }}
        >
          {captionStep.body}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: WIN_X,
          top: WIN_Y,
          width: WIN_W,
          borderRadius: 12,
          overflow: "hidden",
          opacity: intro,
          transform: `translateY(${(1 - intro) * 18}px)`,
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.10), 0 50px 120px -30px rgba(0,0,0,0.75), 0 24px 48px -24px rgba(0,0,0,0.6)",
        }}
      >
        <TitleBar domain={frame.domain} speed={frame.speed} />
        <div
          style={{
            position: "relative",
            width: WIN_W,
            height: VIEW_H,
            overflow: "hidden",
            background: "#fff",
          }}
        >
          <div style={{ position: "absolute", inset: 0, opacity: pageOpacity }}>
            <Stage frame={frame} />
          </div>
        </div>
      </div>

      <div style={{ opacity: intro }}>
        <StepsBar index={index} progress={t / step.dur} />
      </div>

      {seconds >= STEPS_SECONDS ? <EndCard t={seconds - STEPS_SECONDS} /> : null}
    </AbsoluteFill>
  );
}
