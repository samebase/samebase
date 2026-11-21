// "A dashboard for Alchemy": you describe the app in alchemy.run.ts, GitHub Actions deploys it,
// Alchemy records each resource in alchemy-state-store on your Convex team, and Samebase reads that
// store. Every frame is a pure function of `t`, the seconds since the first frame; the named times
// and the words are in script.ts.
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { DarkWorld, LitOutputRow, OUTPUT_ROW_RECT } from "./dark";
import { Dashboard, EndCard } from "./light";
import { ease, mix, progress, rise } from "./motion";
import { CAPTIONS, DURATION, END_FROM, FPS, REVEAL_FROM, REVEAL_TO, ROW_LIGHT_AT } from "./script";
import { dark, light, sans } from "./theme";

export const AlchemyDashboardMeta = {
  fps: FPS,
  durationInFrames: FPS * DURATION,
  width: 1920,
  height: 1080,
} as const;

function Captions({ t, title, sub }: { t: number; title: string; sub: string }) {
  return (
    <>
      {CAPTIONS.map((caption) => {
        const shown =
          rise(t, caption.at, caption.at + 0.45) *
          (1 - ease(t, caption.until - 0.3, caption.until));
        if (shown <= 0) return null;
        return (
          <div
            key={caption.title}
            style={{
              position: "absolute",
              left: 64,
              top: 50,
              right: 64,
              opacity: shown,
              transform: `translateY(${mix(10, 0, rise(t, caption.at, caption.at + 0.45))}px)`,
              fontFamily: sans,
            }}
          >
            <div style={{ fontSize: 44, fontWeight: 600, color: title, letterSpacing: "-0.01em" }}>
              {caption.title}
            </div>
            <div style={{ marginTop: 10, fontSize: 27, color: sub }}>{caption.sub}</div>
          </div>
        );
      })}
    </>
  );
}

export function AlchemyDashboard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  // The output row of the store lights up white, then opens into the whole frame: the app.
  const reveal = ease(t, REVEAL_FROM, REVEAL_TO);
  const row = OUTPUT_ROW_RECT;
  const clip = {
    top: mix(row.y, 0, reveal),
    right: mix(1920 - row.x - row.w, 0, reveal),
    bottom: mix(1080 - row.y - row.h, 0, reveal),
    left: mix(row.x, 0, reveal),
  };
  const lit = rise(t, ROW_LIGHT_AT, ROW_LIGHT_AT + 0.3);
  return (
    // No ligatures: JetBrains Mono would draw `***` and `->` as single glyphs.
    <AbsoluteFill style={{ background: dark.bg, overflow: "hidden", fontVariantLigatures: "none" }}>
      {t < REVEAL_TO ? (
        <>
          <DarkWorld t={t} />
          <Captions t={t} title={dark.text} sub={dark.muted} />
        </>
      ) : null}
      {t >= ROW_LIGHT_AT ? (
        <AbsoluteFill
          style={{
            background: light.bg,
            opacity: lit,
            clipPath: `inset(${clip.top}px ${clip.right}px ${clip.bottom}px ${clip.left}px)`,
          }}
        >
          <LitOutputRow opacity={1 - progress(t, REVEAL_FROM, REVEAL_FROM + 0.25)} />
          <Dashboard t={t} />
          {t < END_FROM + 1 ? <Captions t={t} title={light.text} sub={light.muted} /> : null}
          <EndCard t={t} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
}
