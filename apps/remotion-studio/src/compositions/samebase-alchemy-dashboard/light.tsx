import type { CSSProperties, ReactNode } from "react";

import {
  CheckCircle,
  ChevronDown,
  ConvexLogo,
  ExternalIcon,
  GitHubIcon,
  OrganizationIcon,
  R2Icon,
  SamebaseMark,
  WorkerIcon,
} from "./icons";
import { ease, mix, progress, rise } from "./motion";
import {
  APPS_IN,
  BACK_FROM,
  BACK_TO,
  CLOUDFLARE_ROWS_AT,
  COMMIT,
  END_FROM,
  END_TO,
  INSET_IN,
  LEDGER_LOADING_TO,
  LEDGER_SHOT_FROM,
  LEDGER_SHOT_TO,
  LOADING_TO,
  PUSH_FROM,
  PUSH_TO,
  REVEAL_FROM,
  SELECT_LEDGER_AT,
} from "./script";
import { dark, light, mono, sans } from "./theme";

// The repository page of the Samebase app, drawn in CSS pixels like the repository-overview-v2
// snapshots (a narrow window, 800 wide) and filmed by a camera that frames what matters. Layout
// and labels from apps/samebase/src/repository/dashboard/RepositoryEnvironmentTree.tsx.
const FRAME = { x: 64, y: 172, w: 1792, h: 880 } as const;
const APP = { w: 800, h: 640 } as const;
const SIDEBAR_W = 240;
const MAIN_PAD = 32;

/** A camera shot: the app point (cx, cy) at frame point (tx, ty), at scale s. */
type Shot = { cx: number; cy: number; s: number; tx: number; ty: number };
/** The whole app: the list of apps and the stack of the selected one. */
const WHOLE: Shot = { cx: 400, cy: 196, s: 2.24, tx: FRAME.w / 2, ty: FRAME.h / 2 };
/** In on the stack of pantry: its commit, URL, deployment and sign-in. */
const PANTRY_STACK: Shot = { cx: 556, cy: 176, s: 2.75, tx: FRAME.w / 2, ty: FRAME.h / 2 };
/** The stack of ledger on the left, with room on the right for its code. */
const LEDGER_STACK: Shot = { cx: 520, cy: 227, s: 2, tx: 528, ty: FRAME.h / 2 };

const between = (a: Shot, b: Shot, p: number): Shot => ({
  cx: mix(a.cx, b.cx, p),
  cy: mix(a.cy, b.cy, p),
  s: a.s * (b.s / a.s) ** p,
  tx: mix(a.tx, b.tx, p),
  ty: mix(a.ty, b.ty, p),
});

function shotAt(t: number): Shot {
  if (t < PUSH_FROM) return WHOLE;
  if (t < PUSH_TO) return between(WHOLE, PANTRY_STACK, ease(t, PUSH_FROM, PUSH_TO));
  if (t < BACK_FROM) return PANTRY_STACK;
  if (t < BACK_TO) return between(PANTRY_STACK, WHOLE, ease(t, BACK_FROM, BACK_TO));
  if (t < LEDGER_SHOT_FROM) return WHOLE;
  return between(WHOLE, LEDGER_STACK, ease(t, LEDGER_SHOT_FROM, LEDGER_SHOT_TO));
}

const APPS = [
  { name: "pantry", status: "4/4 passed", at: APPS_IN[0] },
  { name: "ledger", status: "4/4 passed · 1 PR", at: APPS_IN[1] },
  { name: "field-notes", status: "3/3 passed", at: APPS_IN[2] },
] as const;
const APP_TOP = 88;
const APP_H = 52;

type StackRow =
  | { kind: "convex"; name: string }
  | { kind: "worker"; name: string; url: string }
  | { kind: "r2"; name: string }
  | { kind: "hub"; status: string };

const PANTRY = {
  name: "pantry",
  ago: "2m ago",
  checks: "4/4 passed",
  sha: COMMIT.sha,
  message: COMMIT.message,
  address: "quiet-heron-412.convex.site",
  rows: [
    { kind: "convex", name: "quiet-heron-412" },
    { kind: "hub", status: "on" },
  ],
} as const satisfies { rows: readonly StackRow[] } & Record<string, unknown>;

const LEDGER = {
  name: "ledger",
  ago: "5m ago",
  checks: "4/4 passed",
  sha: "b81e03d",
  message: "Store receipts in R2",
  address: "brisk-lynx-907.convex.site",
  rows: [
    { kind: "convex", name: "brisk-lynx-907" },
    { kind: "worker", name: "ledger-api", url: "ledger-api.acme.workers.dev" },
    { kind: "r2", name: "ledger-receipts" },
    { kind: "hub", status: "on" },
  ],
} as const satisfies { rows: readonly StackRow[] } & Record<string, unknown>;

function Abs({ style, children }: { style: CSSProperties; children?: ReactNode }) {
  return <div style={{ position: "absolute", ...style }}>{children}</div>;
}

const underline: CSSProperties = {
  textDecoration: "underline",
  textDecorationColor: light.border,
  textUnderlineOffset: 4,
};

function Sidebar({ t }: { t: number }) {
  const selectMove = rise(t, SELECT_LEDGER_AT, SELECT_LEDGER_AT + 0.3);
  const selectedTop = mix(APP_TOP, APP_TOP + APP_H, selectMove);
  return (
    <Abs
      style={{
        left: 0,
        top: 0,
        width: SIDEBAR_W,
        bottom: 0,
        borderRight: `1px solid ${light.border}`,
        fontSize: 14,
      }}
    >
      <Abs style={{ left: 12, top: 12 }}>Repositories</Abs>
      <Abs style={{ left: 12, top: 46, right: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <OrganizationIcon size={16} color={light.text} />
        <span>acme</span>
        <span style={{ marginLeft: "auto" }}>
          <ChevronDown size={16} color={light.text} />
        </span>
      </Abs>
      <Abs
        style={{
          left: 20,
          top: 78,
          width: 1,
          height: APP_H * APPS.length + 8,
          background: light.border,
        }}
      />
      {rise(t, APPS_IN[0], APPS_IN[0] + 0.3) > 0 ? (
        <Abs
          style={{
            left: 27,
            top: selectedTop - 2,
            width: 54,
            height: 22,
            background: light.primary,
          }}
        />
      ) : null}
      {APPS.map((app, index) => {
        const shown = rise(t, app.at, app.at + 0.35);
        const selected = index === (t >= SELECT_LEDGER_AT + 0.15 ? 1 : 0);
        return (
          <Abs
            key={app.name}
            style={{
              left: 33,
              top: APP_TOP + index * APP_H,
              opacity: shown,
              transform: `translateY(${mix(6, 0, shown)}px)`,
            }}
          >
            <div
              style={{ height: 18, lineHeight: "18px", color: selected ? "#ffffff" : light.text }}
            >
              {app.name}
            </div>
            <div
              style={{
                marginTop: 6,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: light.muted,
              }}
            >
              <span style={{ width: 8, height: 8, background: light.greenSquare }} />
              {app.status}
            </div>
          </Abs>
        );
      })}
    </Abs>
  );
}

function LoadingLines({ t }: { t: number }) {
  // RepositoryOverviewLoadingLines: bg-muted bars with animate-pulse.
  const pulse = 0.55 + 0.45 * Math.cos(t * Math.PI);
  return (
    <div style={{ display: "grid", gap: 16, opacity: pulse }}>
      {[0, 1, 2].map((row) => (
        <div key={row} style={{ display: "grid", gap: 8 }}>
          <div style={{ height: 16, width: "66%", background: light.mutedBg }} />
          <div style={{ height: 12, width: "33%", background: light.mutedBg }} />
        </div>
      ))}
    </div>
  );
}

function Row({ row, highlight }: { row: StackRow; highlight: number }) {
  const background = `rgba(243, 128, 32, ${0.1 * highlight})`;
  if (row.kind === "hub") {
    return (
      <div style={{ height: 40, display: "flex", alignItems: "center", color: light.muted }}>
        Google sign-in: {row.status}
      </div>
    );
  }
  const icon =
    row.kind === "convex" ? (
      <ConvexLogo size={16} />
    ) : row.kind === "worker" ? (
      <WorkerIcon size={16} />
    ) : (
      <R2Icon size={16} />
    );
  return (
    <div style={{ background, margin: "0 -12px", padding: "0 12px" }}>
      <div style={{ height: 40, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 20, display: "flex", justifyContent: "center" }}>{icon}</span>
        <span style={{ ...underline, fontWeight: 600 }}>{row.name}</span>
        {row.kind === "worker" ? null : <ExternalIcon size={12} color={light.muted} />}
      </div>
      {row.kind === "worker" ? (
        <div
          style={{
            marginLeft: 10,
            paddingLeft: 13,
            borderLeft: `1px solid ${light.border}`,
            height: 32,
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: light.muted,
          }}
        >
          <span style={underline}>{row.url}</span>
          <ExternalIcon size={12} color={light.muted} />
        </div>
      ) : null}
    </div>
  );
}

function StackPage({
  app,
  shown,
  highlight,
}: {
  app: typeof PANTRY | typeof LEDGER;
  shown: number;
  highlight: number;
}) {
  return (
    <div style={{ opacity: shown, transform: `translateY(${mix(6, 0, shown)}px)` }}>
      <div
        style={{ display: "flex", alignItems: "center", fontSize: 12, color: light.muted, gap: 10 }}
      >
        <span>main</span>
        <span>{app.ago}</span>
        <span
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: light.green,
            ...underline,
            textDecorationColor: "#a7f3d0",
          }}
        >
          <CheckCircle size={14} color={light.green} />
          {app.checks}
        </span>
      </div>
      <div style={{ marginTop: 8, fontSize: 14 }}>
        <span style={{ fontFamily: mono, color: light.muted, fontSize: 13 }}>{app.sha}</span>{" "}
        <span style={underline}>{app.message}</span>
      </div>
      <div style={{ marginTop: 14, border: `1px solid ${light.border}` }}>
        <div style={{ display: "flex", padding: "10px 4px 6px 12px" }}>
          <div style={{ flex: 1 }}>
            <div
              style={{
                height: 30,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 14,
                color: light.muted,
              }}
            >
              <span style={underline}>{app.address}</span>
              <ExternalIcon size={12} color={light.muted} />
            </div>
            <div
              style={{
                height: 26,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: light.muted,
              }}
            >
              <span style={{ fontFamily: mono }}>{app.sha}</span>
              <span>{app.ago}</span>
            </div>
          </div>
          <div
            style={{
              width: 32,
              height: 32,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              opacity: 0.7,
            }}
          >
            <ConvexLogo size={16} />
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${light.border}`, padding: "0 12px", fontSize: 14 }}>
          {app.rows.map((row) => (
            <Row
              key={row.kind}
              row={row}
              highlight={row.kind === "worker" || row.kind === "r2" ? highlight : 0}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CloudflareInset({ t }: { t: number }) {
  const shown = rise(t, INSET_IN, INSET_IN + 0.45);
  if (shown <= 0) return null;
  // What the stack of ledger adds to the starter: two Cloudflare resources, unbound here.
  const lines: readonly (readonly [string, string])[] = [
    ["// acme/ledger: alchemy.run.ts", dark.comment],
    ['yield* Cloudflare.Worker("Api", {', dark.text],
    ['  name: "ledger-api",', dark.text],
    ['  main: "src/api.ts",', dark.text],
    ["});", dark.text],
    ['yield* Cloudflare.R2.Bucket("Receipts", {', dark.text],
    ['  name: "ledger-receipts",', dark.text],
    ["});", dark.text],
  ];
  // In frame pixels, beside the stack of ledger that the camera holds on the left.
  return (
    <Abs
      style={{
        left: 1072,
        top: 210,
        width: 720,
        opacity: shown,
        transform: `translateX(${mix(24, 0, shown)}px)`,
      }}
    >
      <div
        style={{
          background: dark.panel,
          border: `1px solid ${dark.border}`,
          borderRadius: 8,
          padding: "22px 28px",
          fontFamily: mono,
          fontSize: 23,
          lineHeight: "34px",
          whiteSpace: "pre",
        }}
      >
        {lines.map(([line, color]) => (
          <div key={line} style={{ color }}>
            {line.split(/(Cloudflare\.[A-Za-z0-9.]+|"[^"]*")/).map((part, index) => (
              <span
                key={index}
                style={{
                  color: part.startsWith("Cloudflare.")
                    ? dark.type
                    : part.startsWith('"') && color !== dark.comment
                      ? dark.string
                      : undefined,
                }}
              >
                {part}
              </span>
            ))}
          </div>
        ))}
        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: `1px solid ${dark.border}`,
            fontFamily: sans,
            fontSize: 22,
            lineHeight: "32px",
            color: dark.muted,
          }}
        >
          Repository secrets:
          <div style={{ fontFamily: mono, color: dark.text }}>CLOUDFLARE_API_TOKEN</div>
          <div style={{ fontFamily: mono, color: dark.text }}>CLOUDFLARE_ACCOUNT_ID</div>
        </div>
      </div>
    </Abs>
  );
}

function Main({ t }: { t: number }) {
  const onLedger = t >= SELECT_LEDGER_AT + 0.15;
  const app = onLedger ? LEDGER : PANTRY;
  const loadingTo = onLedger ? LEDGER_LOADING_TO : LOADING_TO;
  const loading = t < loadingTo;
  const shown = rise(t, loadingTo, loadingTo + 0.35);
  const highlight = onLedger
    ? rise(t, CLOUDFLARE_ROWS_AT, CLOUDFLARE_ROWS_AT + 0.3) *
      (1 - 0.6 * progress(t, CLOUDFLARE_ROWS_AT + 0.6, CLOUDFLARE_ROWS_AT + 1.6))
    : 0;
  return (
    <Abs style={{ left: SIDEBAR_W + 1, top: 0, right: 0, bottom: 0 }}>
      <Abs
        style={{
          left: 0,
          right: 0,
          top: 0,
          height: 78,
          borderBottom: `1px solid ${light.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: `0 ${MAIN_PAD}px`,
          fontSize: 16,
        }}
      >
        <GitHubIcon size={16} color={light.text} />
        <span style={underline}>
          <span style={{ color: light.muted }}>acme/</span>
          <span style={{ fontWeight: 700 }}>{app.name}</span>
        </span>
      </Abs>
      <Abs style={{ left: MAIN_PAD, right: MAIN_PAD, top: 110 }}>
        {loading ? (
          <LoadingLines t={t} />
        ) : (
          <StackPage app={app} shown={shown} highlight={highlight} />
        )}
      </Abs>
    </Abs>
  );
}

export function Dashboard({ t }: { t: number }) {
  // The output row opens white first; the app comes up inside it, and is gone before the end card.
  const shown = rise(t, REVEAL_FROM + 0.3, REVEAL_FROM + 0.65) * (1 - ease(t, END_FROM, END_TO));
  const { cx, cy, s, tx, ty } = shotAt(t);
  return (
    <div
      style={{
        position: "absolute",
        left: FRAME.x,
        top: FRAME.y,
        width: FRAME.w,
        height: FRAME.h,
        overflow: "hidden",
        opacity: shown,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: APP.w,
          height: APP.h,
          boxSizing: "border-box",
          border: `1px solid ${light.border}`,
          transform: `translate(${tx - cx * s}px, ${ty - cy * s}px) scale(${s})`,
          transformOrigin: "0 0",
          fontFamily: sans,
          color: light.text,
        }}
      >
        <Sidebar t={t} />
        <Main t={t} />
      </div>
      {t >= SELECT_LEDGER_AT ? <CloudflareInset t={t} /> : null}
    </div>
  );
}

export function EndCard({ t }: { t: number }) {
  // The dashboard has faded out by END_TO; the card then builds on the white page.
  if (t < END_TO) return null;
  const mark = rise(t, END_TO, END_TO + 0.6);
  const line = rise(t, END_TO + 0.4, END_TO + 0.9);
  const url = rise(t, END_TO + 0.7, END_TO + 1.2);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: sans,
        color: light.text,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 26,
          opacity: mark,
          transform: `translateY(${mix(10, 0, mark)}px)`,
        }}
      >
        <SamebaseMark size={92} color={light.primary} />
        <span style={{ fontSize: 96, fontWeight: 600, letterSpacing: "-0.01em" }}>Samebase</span>
      </div>
      <div
        style={{
          marginTop: 44,
          fontSize: 48,
          opacity: line,
          transform: `translateY(${mix(8, 0, line)}px)`,
        }}
      >
        An opinionated way to use Alchemy.
      </div>
      <div style={{ marginTop: 26, fontSize: 34, color: light.muted, opacity: url }}>
        samebase.com
      </div>
    </div>
  );
}
