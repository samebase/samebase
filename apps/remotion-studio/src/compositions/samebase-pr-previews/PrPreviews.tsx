// "Every pull request gets its own backend": a vertical film for X and YouTube Shorts.
//
// Every frame is a pure function of `t`, the seconds since the first frame. The script is the block
// of named times below; retime the film there.
//
// Facts on screen, and where they come from:
// - "Each pull request gets a deployment named `pr-<number>` and a comment with its URL. Closing the
//   pull request deletes that deployment.": apps/samebase/src/content/docs-the-big-migration.md,
//   "How it works", point 5.
// - The step names "Deploy the preview", "Update the stack comment", "Destroy the preview" and
//   "Deploy production": .github/workflows/alchemy.yml in the starter (samebase/base).
// - The card (stage `pr-42`, then the host of the deployment's `siteUrl`, such as
//   `happy-animal-123.convex.site`): packages/alchemy-convex/src/StackComment.ts and Deployment.ts.
// - The closing claim: the four claims in apps/samebase/src/components/LandingPreviewPage.tsx.
// The subject, acme/pantry, its pull requests, deployment names and rows are an invented example.
import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

export const PrPreviewsMeta = {
  fps: 60,
  durationInFrames: 1044,
  width: 1080,
  height: 1920,
} as const;

// The script, in seconds.
const HOOK_OUT = 1.7;
const TRUNK_IN = 1.85;
const PROD_IN = 2.0;
const DEPLOY_SECONDS = 1.35;
const COMMENT_SECONDS = 0.4;
/** A row of #41 moves toward #42, stops at the card's edge, and goes back. */
const FENCE = [7.6, 8.45] as const;
const FENCE_LANE = 41;
const FENCE_ROW = "Rice";
const MERGE_AT = 8.9;
const MERGE_DOT = [9.0, 9.55] as const;
const DESTROY = [9.5, 10.35] as const;
const COLLAPSE = [10.4, 10.95] as const;
const PROD_DEPLOY = [9.55, 10.45] as const;
const DIAGRAM_OUT = 11.85;
const PAYOFF_IN = 12.15;
const PAYOFF_OUT = 14.55;
const END_IN = 14.75;

// Brand: apps/samebase/src/index.css (--font-sans) and the BETA badge (bg-blue-600).
const SANS =
  '"Liberation Sans", ui-sans-serif, system-ui, -apple-system, "BlinkMacSystemFont", "Segoe UI", sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, monospace';
const INK = "#0a0a0a";
const MUTED = "#6b6f72";
const FAINT = "#a3a7aa";
const LINE = "#e3e5e6";
const MARK = "#394447";
const BLUE = "#2563eb";
const PAPER = "#ffffff";

// The layout, in pixels of the 1080 x 1920 frame. The diagram fills y 150 to 1536 (8% to 80%):
// the feed's bottom 20% holds its own controls. Key text stays left of x 960.
const LEFT = 80;
const CAPTION_TOP = 150;
const TRUNK_X = 88;
const CARD_X = 140;
const CARD_W = 842;
const CARD_PAD = 28;
const PROD_TOP = 366;
const PROD_H = 296;
const PROD_NODE_Y = PROD_TOP + 58;
const LANE_TOP = 694;
const LANE_H = 262;
const LANE_GAP = 22;
/** The first row's middle, from the card's top: border, padding, half the 56 px row. */
const ROW_MIDDLE = 3 + CARD_PAD + 28;
const TRUNK_END = 1536;

type Lane = {
  readonly number: number;
  readonly title: string;
  readonly host: string;
  readonly openAt: number;
  readonly rows: readonly (readonly [string, number])[];
};

const LANES: readonly Lane[] = [
  {
    number: 41,
    title: "Barcode scan",
    host: "quiet-otter-417.convex.site",
    openAt: 2.7,
    rows: [
      ["Oat milk", 6.1],
      ["Rice", 6.9],
    ],
  },
  {
    number: 42,
    title: "Shopping list",
    host: "amber-lynx-562.convex.site",
    openAt: 2.95,
    rows: [
      ["Eggs", 6.3],
      ["Bread", 6.7],
      ["Butter", 7.25],
    ],
  },
  {
    number: 43,
    title: "Expiry reminders",
    host: "tidy-falcon-88.convex.site",
    openAt: 3.2,
    rows: [["Yogurt", 6.5]],
  },
] as const;

const MERGED_LANE = 42;

type Segment = { readonly text: string; readonly mono?: boolean; readonly accent?: boolean };

const CAPTIONS: readonly {
  readonly from: number;
  readonly to: number;
  readonly segments: readonly Segment[];
}[] = [
  {
    from: 1.95,
    to: 2.7,
    segments: [{ text: "Production runs from" }, { text: "main.", mono: true }],
  },
  { from: 3.05, to: 4.35, segments: [{ text: "Agents open pull requests in parallel." }] },
  {
    from: 4.7,
    to: 5.85,
    segments: [
      { text: "Each gets a deployment \n named" },
      { text: "pr-<number>.", mono: true, accent: true },
    ],
  },
  { from: 6.2, to: 8.55, segments: [{ text: "Its own data. \n Nothing crosses lanes." }] },
  { from: 8.95, to: 10.25, segments: [{ text: "Merge #42. \n Its preview is deleted." }] },
  { from: 10.6, to: 11.75, segments: [{ text: "Production gets the code." }] },
] as const;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const outCubic = (p: number) => 1 - (1 - p) ** 3;
const outExpo = (p: number) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p));
const inCubic = (p: number) => p ** 3;
const inOutCubic = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
/** Overshoots past 1 and settles. Never below 0, so an SVG radius stays valid at p = 0. */
const outBack = (p: number) => Math.max(0, 1 + 2.2 * (p - 1) ** 3 + 1.2 * (p - 1) ** 2);
/** 0 before `a`, 1 after `b`, eased between. */
const ease = (t: number, a: number, b: number, curve: (p: number) => number = outCubic) =>
  curve(clamp01((t - a) / (b - a)));
const mix = (a: number, b: number, p: number) => a + (b - a) * p;

export function PrPreviews() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill style={{ background: PAPER, color: INK, fontFamily: SANS, overflow: "hidden" }}>
      {t < TRUNK_IN + 0.4 ? <Hook t={t} /> : null}
      {t >= TRUNK_IN - 0.1 && t < PAYOFF_IN + 0.2 ? <Diagram t={t} /> : null}
      {CAPTIONS.map((caption) =>
        t >= caption.from - 0.05 && t < caption.to + 0.5 ? (
          <div
            key={caption.from}
            style={{ position: "absolute", left: LEFT, top: CAPTION_TOP, width: 900 }}
          >
            <Words
              at={caption.from}
              out={caption.to}
              segments={caption.segments}
              size={78}
              stagger={0.045}
              t={t}
              weight={700}
            />
          </div>
        ) : null,
      )}
      {t >= PAYOFF_IN - 0.05 && t < END_IN + 0.2 ? <Payoff t={t} /> : null}
      {t >= END_IN - 0.05 ? <EndCard t={t} /> : null}
    </AbsoluteFill>
  );
}

/** Words that rise into place one after another from `at`, and leave upward from `out`. */
function Words({
  segments,
  t,
  at,
  out,
  size,
  weight,
  stagger,
  lineHeight = 1.06,
  tracking = "-0.035em",
  color = INK,
}: {
  segments: readonly Segment[];
  t: number;
  at: number;
  out: number;
  size: number;
  weight: number;
  stagger: number;
  lineHeight?: number;
  tracking?: string;
  color?: string;
}) {
  const words = segments.flatMap((segment) =>
    segment.text.split(" ").map((word) => ({ word, mono: segment.mono, accent: segment.accent })),
  );
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: weight,
        lineHeight,
        letterSpacing: tracking,
        color,
        textWrap: "balance",
      }}
    >
      {words.map(({ word, mono, accent }, index) => {
        if (word === "\n") {
          return <br key={`break-${index}`} />;
        }
        const enter = ease(t, at + index * stagger, at + index * stagger + 0.5, outExpo);
        const leave = ease(t, out + index * 0.012, out + index * 0.012 + 0.26, inCubic);
        const y = (1 - enter) * 105 - leave * 105;
        return (
          <span
            key={`${word}-${index}`}
            style={{
              display: "inline-block",
              overflow: "hidden",
              verticalAlign: "top",
              paddingBottom: "0.14em",
              marginBottom: "-0.14em",
              marginRight: "0.24em",
            }}
          >
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${y}%)`,
                fontFamily: mono ? MONO : SANS,
                letterSpacing: mono ? "-0.04em" : tracking,
                color: accent ? BLUE : color,
              }}
            >
              {word}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** 0 to 1.7 s: the claim in big type. */
function Hook({ t }: { t: number }) {
  const lines = ["Every", "pull request", "gets its own"];
  const block = ease(t, 0.5, 0.8, outExpo);
  const blockOut = ease(t, HOOK_OUT + 0.06, HOOK_OUT + 0.36, inCubic);
  return (
    <div style={{ position: "absolute", left: LEFT - 8, top: 400 }}>
      {lines.map((line, index) => {
        // "Every" stands on the first frame, which feeds use as the thumbnail.
        const enter = index === 0 ? 1 : ease(t, index * 0.13 - 0.06, index * 0.13 + 0.4, outExpo);
        const leave = ease(t, HOOK_OUT + index * 0.04, HOOK_OUT + index * 0.04 + 0.3, inCubic);
        return (
          <div key={line} style={{ overflow: "hidden", paddingBottom: 14, marginBottom: -14 }}>
            <div
              style={{
                fontSize: 174,
                fontWeight: 800,
                letterSpacing: "-0.055em",
                lineHeight: 1.0,
                transform: `translateY(${(1 - enter) * 108 - leave * 108}%)`,
              }}
            >
              {line}
            </div>
          </div>
        );
      })}
      <div
        style={{
          marginTop: 34,
          marginLeft: 6,
          display: "inline-block",
          transform: `rotate(-3deg) scale(${mix(0.6, 1, outBack(clamp01((t - 0.5) / 0.42)))}) translateY(${blockOut * -260}px)`,
          transformOrigin: "0% 50%",
          opacity: block * (1 - blockOut),
          background: BLUE,
          color: PAPER,
          padding: "6px 30px 18px",
          fontSize: 196,
          fontWeight: 800,
          letterSpacing: "-0.055em",
          lineHeight: 1.0,
        }}
      >
        backend.
      </div>
    </div>
  );
}

/** The top of a lane at time `t`: the merged lane's slot closes and the lanes below it move up. */
function laneTop(index: number, t: number) {
  const mergedIndex = LANES.findIndex((lane) => lane.number === MERGED_LANE);
  const shift = index > mergedIndex ? ease(t, COLLAPSE[0], COLLAPSE[1] + 0.05, inOutCubic) : 0;
  return LANE_TOP + (index - shift) * (LANE_H + LANE_GAP);
}

function Diagram({ t }: { t: number }) {
  const out = ease(t, DIAGRAM_OUT, DIAGRAM_OUT + 0.4, inCubic);
  const trunk = ease(t, TRUNK_IN, TRUNK_IN + 0.8, inOutCubic);
  return (
    <AbsoluteFill
      style={{
        opacity: 1 - out,
        transform: `translateY(${-out * 90}px) scale(${mix(
          1,
          1.012,
          ease(t, TRUNK_IN, DIAGRAM_OUT, (p) => p),
        )})`,
        transformOrigin: "50% 50%",
      }}
    >
      <svg height={1920} style={{ position: "absolute", inset: 0 }} width={1080}>
        <line
          pathLength={1}
          stroke={INK}
          strokeDasharray="1 1"
          strokeDashoffset={1 - trunk}
          strokeWidth={6}
          x1={TRUNK_X}
          x2={TRUNK_X}
          y1={PROD_NODE_Y}
          y2={TRUNK_END}
        />
        {LANES.map((lane, index) => (
          <Branch index={index} key={lane.number} lane={lane} t={t} />
        ))}
        <ProdNode t={t} />
        <MergeDot t={t} />
      </svg>
      <ProdCard t={t} />
      {LANES.map((lane, index) => (
        <LaneCard index={index} key={lane.number} lane={lane} t={t} />
      ))}
    </AbsoluteFill>
  );
}

function ProdNode({ t }: { t: number }) {
  const shown = ease(t, PROD_IN, PROD_IN + 0.4, outBack);
  const pulse = ease(t, PROD_DEPLOY[1], PROD_DEPLOY[1] + 0.7, outCubic);
  const pulsing = t >= PROD_DEPLOY[1];
  return (
    <g>
      {pulsing ? (
        <circle
          cx={TRUNK_X}
          cy={PROD_NODE_Y}
          fill="none"
          opacity={1 - pulse}
          r={14 + pulse * 40}
          stroke={BLUE}
          strokeWidth={4}
        />
      ) : null}
      <circle cx={TRUNK_X} cy={PROD_NODE_Y} fill={INK} r={15 * shown} />
    </g>
  );
}

/** The path from the trunk into a lane card's first row. */
function branchPath(top: number) {
  const y = top + ROW_MIDDLE;
  return `M ${TRUNK_X} ${y - 64} L ${TRUNK_X} ${y - 30} Q ${TRUNK_X} ${y} ${TRUNK_X + 30} ${y} L ${CARD_X} ${y}`;
}

function Branch({ lane, index, t }: { lane: Lane; index: number; t: number }) {
  const drawn = ease(t, lane.openAt, lane.openAt + 0.35, inOutCubic);
  const gone = lane.number === MERGED_LANE ? ease(t, COLLAPSE[0], COLLAPSE[0] + 0.3) : 0;
  const top = laneTop(index, t);
  return (
    <g opacity={1 - gone}>
      <path
        d={branchPath(top)}
        fill="none"
        pathLength={1}
        stroke={BLUE}
        strokeDasharray="1 1"
        strokeDashoffset={1 - drawn}
        strokeLinecap="round"
        strokeWidth={5}
      />
      <circle
        cx={TRUNK_X}
        cy={top + ROW_MIDDLE - 64}
        fill={BLUE}
        r={10 * ease(t, lane.openAt - 0.05, lane.openAt + 0.2, outBack)}
      />
    </g>
  );
}

/** The merge travels from the lane back along its branch and up main into production. */
function MergeDot({ t }: { t: number }) {
  if (t < MERGE_DOT[0] || t > MERGE_DOT[1] + 0.05) {
    return null;
  }
  const index = LANES.findIndex((lane) => lane.number === MERGED_LANE);
  const y = laneTop(index, t) + ROW_MIDDLE;
  const legs = [
    { x0: CARD_X, y0: y, x1: TRUNK_X + 18, y1: y },
    { x0: TRUNK_X + 18, y0: y, x1: TRUNK_X, y1: y - 18 },
    { x0: TRUNK_X, y0: y - 18, x1: TRUNK_X, y1: PROD_NODE_Y },
  ].map((leg) => ({ ...leg, length: Math.hypot(leg.x1 - leg.x0, leg.y1 - leg.y0) }));
  const total = legs.reduce((sum, leg) => sum + leg.length, 0);
  let travelled = ease(t, MERGE_DOT[0], MERGE_DOT[1], inOutCubic) * total;
  let x: number = CARD_X;
  let dotY = y;
  for (const leg of legs) {
    const p = clamp01(travelled / leg.length);
    x = mix(leg.x0, leg.x1, p);
    dotY = mix(leg.y0, leg.y1, p);
    travelled -= leg.length;
    if (travelled <= 0) {
      break;
    }
  }
  return (
    <g>
      <circle cx={x} cy={dotY} fill={BLUE} opacity={0.18} r={30} />
      <circle cx={x} cy={dotY} fill={BLUE} r={14} />
    </g>
  );
}

function Spinner({ t, size = 34, color = BLUE }: { t: number; size?: number; color?: string }) {
  return (
    <svg
      height={size}
      style={{ transform: `rotate(${t * 420}deg)`, flex: "none" }}
      viewBox="0 0 24 24"
      width={size}
    >
      <circle cx={12} cy={12} fill="none" r={9} stroke={LINE} strokeWidth={3} />
      <path
        d="M12 3 a9 9 0 0 1 9 9"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={3}
      />
    </svg>
  );
}

function Check({ size = 38, color = BLUE }: { size?: number; color?: string }) {
  return (
    <svg height={size} style={{ flex: "none" }} viewBox="0 0 24 24" width={size}>
      <circle cx={12} cy={12} fill="none" r={10} stroke={color} strokeWidth={2.2} />
      <path
        d="M7.5 12.3 l3 3 l6 -6.4"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.4}
      />
    </svg>
  );
}

function Database({ size = 32, color = MUTED }: { size?: number; color?: string }) {
  return (
    <svg height={size} style={{ flex: "none" }} viewBox="0 0 24 24" width={size}>
      <ellipse cx={12} cy={5.5} fill="none" rx={8} ry={3} stroke={color} strokeWidth={2} />
      <path
        d="M4 5.5 v13 c0 1.7 3.6 3 8 3 s8 -1.3 8 -3 v-13 M4 12 c0 1.7 3.6 3 8 3 s8 -1.3 8 -3"
        fill="none"
        stroke={color}
        strokeWidth={2}
      />
    </svg>
  );
}

/** A step of the workflow while it runs. */
function Status({ children, t }: { children: ReactNode; t: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        color: MUTED,
        fontSize: 32,
        fontWeight: 500,
        letterSpacing: "-0.015em",
        whiteSpace: "nowrap",
      }}
    >
      <Spinner t={t} />
      {children}
    </div>
  );
}

function Chip({
  children,
  background,
  color = PAPER,
}: {
  children: ReactNode;
  background: string;
  color?: string;
}) {
  return (
    <span
      style={{
        background,
        color,
        fontFamily: MONO,
        fontSize: 34,
        fontWeight: 650,
        letterSpacing: "-0.02em",
        padding: "3px 13px 5px",
        lineHeight: 1.15,
        flex: "none",
      }}
    >
      {children}
    </span>
  );
}

function ProdCard({ t }: { t: number }) {
  const shown = ease(t, PROD_IN, PROD_IN + 0.55, outExpo);
  const deploying = t >= PROD_DEPLOY[0] && t < PROD_DEPLOY[1];
  const updated = t >= PROD_DEPLOY[1];
  const flash = updated ? 1 - ease(t, PROD_DEPLOY[1], PROD_DEPLOY[1] + 0.9) : 0;
  const commitIn = ease(t, PROD_DEPLOY[1], PROD_DEPLOY[1] + 0.45, outExpo);
  return (
    <div
      style={{
        position: "absolute",
        left: CARD_X,
        top: PROD_TOP,
        width: CARD_W,
        height: PROD_H,
        border: `3px solid ${INK}`,
        background: PAPER,
        padding: `${CARD_PAD}px`,
        boxSizing: "border-box",
        opacity: shown,
        transform: `translateX(${(1 - shown) * 70}px)`,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 56,
          flex: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ fontSize: 48, fontWeight: 700, letterSpacing: "-0.035em" }}>
            acme/pantry
          </span>
          <Chip background={INK}>prod</Chip>
        </div>
        {deploying ? <Status t={t}>Deploy production</Status> : null}
        {updated ? (
          <div style={{ opacity: 1 - ease(t, PROD_DEPLOY[1] + 1.4, PROD_DEPLOY[1] + 1.8) }}>
            <Check />
          </div>
        ) : null}
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 37,
          lineHeight: "44px",
          height: 44,
          letterSpacing: "-0.02em",
          color: INK,
          flex: "none",
        }}
      >
        brave-heron-208.convex.site
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: 32,
          lineHeight: "44px",
          color: MUTED,
          overflow: "hidden",
          height: 44,
          flex: "none",
          background: `rgba(37, 99, 235, ${0.12 * flash})`,
          margin: "0 -10px",
          padding: "0 10px",
        }}
      >
        <span style={{ fontFamily: MONO, color: MUTED, flex: "none" }}>main</span>
        <span style={{ position: "relative", flex: 1, height: 44 }}>
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              transform: `translateY(${-commitIn * 100}%)`,
              opacity: 1 - commitIn,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontFamily: MONO }}>7f3a2c1</span>{" "}
            <span style={{ color: INK }}>Add the pantry list</span>
          </span>
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              transform: `translateY(${(1 - commitIn) * 100}%)`,
              opacity: commitIn,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontFamily: MONO }}>9b04e6d</span>{" "}
            <span style={{ color: INK }}>Shopping list (#42)</span>
          </span>
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: 32,
          height: 44,
          flex: "none",
          color: MUTED,
        }}
      >
        <Database />
        <span style={{ fontFamily: MONO }}>items</span>
        <span>1,204 rows</span>
      </div>
    </div>
  );
}

/**
 * The row of FENCE_LANE named FENCE_ROW lifts, falls toward the lane below, stops at its own card's
 * bottom edge (`impact`), and goes back. `drop` is in pixels; 30 brings the row to the edge.
 */
function fenceMotion(t: number) {
  const [from, to] = FENCE;
  const hit = from + 0.36;
  const lift = ease(t, from, from + 0.14) * (1 - ease(t, to - 0.16, to));
  const fall = 30 * ease(t, from + 0.12, hit, inCubic);
  const bounce = 14 * ease(t, hit, hit + 0.12, outCubic);
  const back = 1 - ease(t, hit + 0.2, to, inOutCubic);
  const drop = t < hit ? fall : (30 - bounce) * back;
  const impact =
    t < hit - 0.03 ? 0 : ease(t, hit - 0.03, hit + 0.02) * (1 - ease(t, hit + 0.05, hit + 0.45));
  return { drop, impact, lift };
}

function LaneCard({ lane, index, t }: { lane: Lane; index: number; t: number }) {
  const deployedAt = lane.openAt + 0.3 + DEPLOY_SECONDS;
  const settledAt = deployedAt + COMMENT_SECONDS;
  const shown = ease(t, lane.openAt + 0.15, lane.openAt + 0.65, outExpo);
  // The URL appears once the stack comment holds it.
  const reveal = ease(t, settledAt, settledAt + 0.45, outCubic);
  const flash = t >= settledAt ? 1 - ease(t, settledAt, settledAt + 1.0) : 0;
  const merged = lane.number === MERGED_LANE;
  const isMerged = merged && t >= MERGE_AT;
  const destroying = merged && t >= DESTROY[0] && t < DESTROY[1];
  const destroyed = merged && t >= DESTROY[1];
  const strike = merged ? ease(t, DESTROY[1] - 0.25, DESTROY[1] + 0.05, inOutCubic) : 0;
  const collapse = merged ? ease(t, COLLAPSE[0], COLLAPSE[1], inOutCubic) : 0;
  const rows = lane.rows.filter(([, at]) => t >= at);
  const fence = lane.number === FENCE_LANE ? fenceMotion(t) : { drop: 0, impact: 0, lift: 0 };
  if (collapse >= 1) {
    return null;
  }
  return (
    <div
      style={{
        position: "absolute",
        left: CARD_X,
        top: laneTop(index, t),
        width: CARD_W,
        height: LANE_H,
        boxSizing: "border-box",
        border: `3px solid ${destroyed ? LINE : BLUE}`,
        background: PAPER,
        padding: `${CARD_PAD}px`,
        opacity: shown * (1 - collapse),
        transform: `translateX(${(1 - shown) * 90 + collapse * 60}px) scale(${1 - collapse * 0.06})`,
        transformOrigin: "0% 50%",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {fence.impact > 0 ? (
        // The card's bottom edge thickens where the row stops: the lane's data stays in the lane.
        <div
          style={{
            position: "absolute",
            left: -3,
            right: -3,
            bottom: -3,
            height: 3 + 9 * fence.impact,
            background: INK,
          }}
        />
      ) : null}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 56,
          flex: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 16,
            color: destroyed ? FAINT : INK,
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 44,
              fontWeight: 700,
              color: destroyed ? FAINT : BLUE,
              letterSpacing: "-0.05em",
            }}
          >
            #{lane.number}
          </span>
          <span
            style={{
              fontSize: 47,
              fontWeight: 650,
              letterSpacing: "-0.035em",
              whiteSpace: "nowrap",
            }}
          >
            {lane.title}
          </span>
        </div>
        {t >= settledAt && !isMerged ? (
          <div style={{ opacity: ease(t, settledAt, settledAt + 0.25), display: "flex" }}>
            <Check />
          </div>
        ) : null}
        {isMerged && !destroying && !destroyed ? <Chip background={INK}>Merged</Chip> : null}
        {destroying ? <Status t={t}>Destroy the preview</Status> : null}
        {destroyed ? (
          <span style={{ fontSize: 32, color: MUTED, fontWeight: 500 }}>Deleted</span>
        ) : null}
      </div>
      <div style={{ position: "relative", height: 52, flex: "none" }}>
        {reveal < 1 ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: 52,
              display: "flex",
              alignItems: "center",
              // Gone before the URL's wipe reaches it.
              opacity: 1 - clamp01(reveal * 4),
            }}
          >
            <Status t={t}>
              {t < deployedAt ? "Deploy the preview" : "Update the stack comment"}
            </Status>
          </div>
        ) : null}
        <div
          style={{
            position: "absolute",
            left: -10,
            top: 0,
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "0 10px",
            height: 52,
            clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)`,
            background: `rgba(37, 99, 235, ${0.12 * flash})`,
          }}
        >
          <Chip background={destroyed ? FAINT : BLUE}>pr-{lane.number}</Chip>
          <span
            style={{
              position: "relative",
              fontFamily: MONO,
              fontSize: 37,
              letterSpacing: "-0.025em",
              color: destroyed ? FAINT : INK,
              whiteSpace: "nowrap",
            }}
          >
            {lane.host}
            <span
              style={{
                position: "absolute",
                left: 0,
                top: "52%",
                height: 3,
                width: `${strike * 100}%`,
                background: MUTED,
              }}
            />
          </span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: 32,
          color: destroyed ? FAINT : MUTED,
          opacity: reveal,
          height: 52,
          flex: "none",
        }}
      >
        <Database color={destroyed ? FAINT : MUTED} />
        <span style={{ fontFamily: MONO }}>items</span>
        <span style={{ width: 112 }}>
          {rows.length} {rows.length === 1 ? "row" : "rows"}
        </span>
        {rows.map(([name, at]) => {
          const pop = ease(t, at, at + 0.35, outBack);
          const glow = 1 - ease(t, at, at + 0.8);
          const moving = name === FENCE_ROW ? fence : { drop: 0, lift: 0 };
          return (
            <span
              key={name}
              style={{
                display: "inline-block",
                transform: `translateY(${moving.drop}px) scale(${mix(0.5, 1, pop) * (1 + 0.1 * moving.lift)})`,
                opacity: clamp01(pop * 1.4),
                background: destroyed
                  ? "#f4f5f5"
                  : moving.lift > 0.5
                    ? BLUE
                    : `rgba(37, 99, 235, ${0.08 + 0.18 * glow})`,
                color: destroyed ? FAINT : moving.lift > 0.5 ? PAPER : INK,
                fontWeight: 550,
                padding: "2px 13px 5px",
                letterSpacing: "-0.01em",
                textDecoration: strike > 0.5 ? "line-through" : "none",
              }}
            >
              {name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** The claim, as the landing page says it. */
function Payoff({ t }: { t: number }) {
  const line = ease(t, PAYOFF_IN + 0.9, PAYOFF_IN + 1.5, outExpo);
  const leave = ease(t, PAYOFF_OUT, PAYOFF_OUT + 0.3, inCubic);
  return (
    <div style={{ position: "absolute", left: LEFT, top: 520, width: 900 }}>
      <Words
        at={PAYOFF_IN}
        out={PAYOFF_OUT}
        segments={[{ text: "Run agents in parallel." }]}
        size={142}
        stagger={0.09}
        t={t}
        tracking="-0.055em"
        weight={800}
        lineHeight={0.98}
      />
      <div
        style={{
          marginTop: 56,
          height: 8,
          width: 180 * line,
          background: BLUE,
          opacity: 1 - leave,
        }}
      />
      <div style={{ marginTop: 52 }}>
        <Words
          at={PAYOFF_IN + 0.7}
          out={PAYOFF_OUT}
          segments={[
            { text: "Every PR gets its own preview, with" },
            { text: "its own database.", accent: true },
          ]}
          size={66}
          stagger={0.05}
          t={t}
          weight={650}
          lineHeight={1.12}
        />
      </div>
    </div>
  );
}

/** The Samebase mark: apps/samebase/public/brand/icon/compact-v1-landing-inline-80.svg. */
function Mark({ size, hole }: { size: number; hole: number }) {
  const inner = 16 * hole;
  return (
    <svg height={size} viewBox="6 6 48 48" width={size}>
      <path
        d={`M6 6h48v48H6z M${30 - inner / 2} ${30 - inner / 2}h${inner}v${inner}h${-inner}z`}
        fill={MARK}
        fillRule="evenodd"
      />
    </svg>
  );
}

function EndCard({ t }: { t: number }) {
  const mark = ease(t, END_IN, END_IN + 0.5, outBack);
  const hole = ease(t, END_IN + 0.2, END_IN + 0.65, outExpo);
  const word = ease(t, END_IN + 0.25, END_IN + 0.8, outExpo);
  const badge = ease(t, END_IN + 0.6, END_IN + 1.0, outBack);
  const tagline = ease(t, END_IN + 0.8, END_IN + 1.35, outExpo);
  const url = ease(t, END_IN + 1.05, END_IN + 1.6, outExpo);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 300 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <div style={{ transform: `scale(${mark})` }}>
            <Mark hole={hole} size={128} />
          </div>
          <div style={{ overflow: "hidden", paddingBottom: 16, marginBottom: -16 }}>
            <div
              style={{
                fontSize: 120,
                fontWeight: 650,
                letterSpacing: "-0.04em",
                lineHeight: 1,
                transform: `translateY(${(1 - word) * 110}%)`,
              }}
            >
              Samebase
            </div>
          </div>
        </div>
        <div
          style={{
            alignSelf: "flex-end",
            marginTop: 18,
            background: BLUE,
            color: PAPER,
            fontSize: 34,
            fontWeight: 650,
            padding: "4px 16px 6px",
            transform: `rotate(-3deg) scale(${badge})`,
            opacity: clamp01(badge * 2),
          }}
        >
          BETA
        </div>
        <div
          style={{
            marginTop: 64,
            fontSize: 54,
            fontWeight: 550,
            letterSpacing: "-0.02em",
            color: INK,
            opacity: tagline,
            transform: `translateY(${(1 - tagline) * 30}px)`,
          }}
        >
          An opinionated way to use Alchemy.
        </div>
        <div
          style={{
            marginTop: 30,
            fontSize: 50,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: BLUE,
            opacity: url,
            transform: `translateY(${(1 - url) * 30}px)`,
          }}
        >
          samebase.com
        </div>
      </div>
    </AbsoluteFill>
  );
}
