import type { CSSProperties, ReactNode } from "react";

import {
  CheckCircleFill,
  ChevronRight,
  CodeOcticon,
  ConvexLogo,
  GitPullRequest,
  MarkGithub,
  PendingRing,
  PlayOcticon,
  RunningRing,
} from "./icons";
import { abs } from "./layout";
import { spin } from "./time";

/*
GitHub's pages for the starter repository acme/pantry. The workflow, its job and its step names
come from samebase/base .github/workflows/alchemy.yml (no workflow `name`, job `alchemy`). The pull
request comment is what `alchemy-convex stack-comment` writes
(packages/alchemy-convex/src/StackComment.ts): the stage, the site's host, the commit and time,
the Convex deployment and the sign-in client.
*/

const GH_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif';
const G = {
  fg: "#1f2328",
  muted: "#59636e",
  border: "#d1d9e0",
  canvas: "#ffffff",
  subtle: "#f6f8fa",
  accent: "#0969da",
  success: "#1a7f37",
  open: "#1f883d",
} as const;

const page: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: G.canvas,
  color: G.fg,
  fontFamily: GH_FONT,
  fontSize: 14,
  lineHeight: "20px",
  overflow: "hidden",
};

type Tab = "Code" | "Pull requests" | "Actions";

function RepoHeader({ tab }: { tab: Tab }) {
  const tabs: readonly [Tab | "Issues" | "Settings", ReactNode][] = [
    ["Code", <CodeOcticon key="c" size={16} color={G.muted} />],
    ["Issues", <PendingRing key="i" size={16} />],
    ["Pull requests", <GitPullRequest key="p" size={16} color={G.muted} />],
    ["Actions", <PlayOcticon key="a" size={16} color={G.muted} />],
    ["Settings", null],
  ];
  return (
    <div
      style={{
        ...abs(0, 0, 1200, 104),
        background: G.subtle,
        borderBottom: `1px solid ${G.border}`,
      }}
    >
      <MarkGithub size={32} color={G.fg} style={{ position: "absolute", left: 16, top: 14 }} />
      <div style={{ ...abs(62, 20), fontSize: 14 }}>
        <span>acme</span>
        <span style={{ color: G.muted, margin: "0 6px" }}>/</span>
        <span style={{ fontWeight: 600 }}>pantry</span>
      </div>
      <div style={{ ...abs(16, 60), display: "flex", gap: 8 }}>
        {tabs.map(([label, icon]) => (
          <div
            key={label}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 32,
              padding: "0 8px",
              fontWeight: label === tab ? 600 : 400,
            }}
          >
            {icon}
            {label}
            {label === tab ? (
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: -12,
                  height: 2,
                  background: "#fd8c73",
                }}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* The Actions run ------------------------------------------------------------------------------- */

export type StepState = "pending" | "running" | "done" | "skipped";

/** The steps of the job `alchemy` on a push to main, with how long each took (91 s in all). */
const RUN_STEPS: readonly (readonly [name: string, seconds: number | null])[] = [
  ["Set up job", 3],
  ["Skip without the Convex token", 0],
  ["Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", 1],
  ["Run pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86", 2],
  ["Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1", 4],
  ["Run pnpm install --frozen-lockfile", 9],
  ["Check that the checkout is the head of the branch", 1],
  ["Deploy production", 68],
  ["Deploy the preview", null],
  ["Update the stack comment", null],
  ["Destroy the preview", null],
  ["Post Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1", 1],
  ["Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", 0],
  ["Complete job", 1],
];
export const RUN_SECONDS = RUN_STEPS.reduce((sum, [, s]) => sum + (s ?? 0), 0);

const formatDuration = (s: number) => {
  const whole = Math.floor(s);
  return whole >= 60 ? `${Math.floor(whole / 60)}m ${whole % 60}s` : `${whole}s`;
};

/** The state of each step and the running step's seconds, `elapsed` seconds into the job. */
function stepsAt(elapsed: number) {
  let start = 0;
  return RUN_STEPS.map(([name, seconds]) => {
    if (seconds === null) {
      return {
        name,
        state: elapsed >= start ? ("skipped" as const) : ("pending" as const),
        shown: null,
      };
    }
    const end = start + seconds;
    const state: StepState = elapsed >= end ? "done" : elapsed >= start ? "running" : "pending";
    const shown = state === "done" ? seconds : state === "running" ? elapsed - start : null;
    start = end;
    return { name, state, shown };
  });
}

const BOX_X = 16;
const BOX_W = 800;
export const RUN_BOX = { x: BOX_X, y: 172, w: BOX_W, rowsY: 244, rowH: 30 } as const;

/** The run page of the first push, `elapsed` seconds into the job. */
export function ActionsRunPage({ elapsed, t }: { elapsed: number; t: number }) {
  const steps = stepsAt(elapsed);
  const done = elapsed >= RUN_SECONDS;
  return (
    <div style={page}>
      <RepoHeader tab="Actions" />
      {/* The narrow layout of the job page: the jobs list folds away and the run's title keeps its status. */}
      <div
        style={{
          ...abs(BOX_X, 122),
          fontSize: 20,
          lineHeight: "28px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {done ? (
          <CheckCircleFill size={20} color={G.success} />
        ) : (
          <RunningRing size={20} angle={spin(t)} />
        )}
        <span>Initialize app from Samebase starter build v2210</span>
        <span style={{ color: G.muted }}>#1</span>
      </div>
      <div
        style={{
          ...abs(BOX_X, RUN_BOX.y, BOX_W, 64 + 16 + RUN_STEPS.length * RUN_BOX.rowH + 2),
          background: "#0d1117",
          borderRadius: 6,
          color: "#e6edf3",
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #30363d", height: 64 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>alchemy</div>
          <div style={{ fontSize: 12, color: "#9198a1", marginTop: 2 }}>
            {done
              ? `succeeded now in ${formatDuration(RUN_SECONDS)}`
              : `started ${formatDuration(elapsed)} ago`}
          </div>
          <div
            style={{
              position: "absolute",
              right: 16,
              top: 16,
              width: 220,
              height: 30,
              border: "1px solid #3d444d",
              borderRadius: 6,
              color: "#9198a1",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              paddingLeft: 10,
            }}
          >
            Search logs
          </div>
        </div>
        <div style={{ padding: "8px 8px" }}>
          {steps.map((step) => (
            <div
              key={step.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: RUN_BOX.rowH,
                padding: "0 8px",
                color: step.state === "pending" ? "#9198a1" : "#e6edf3",
              }}
            >
              <ChevronRight size={14} color="#9198a1" />
              {step.state === "done" ? (
                <CheckCircleFill size={16} color="#3fb950" />
              ) : step.state === "running" ? (
                <RunningRing size={16} angle={spin(t)} />
              ) : (
                <PendingRing size={16} skipped={step.state === "skipped"} />
              )}
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {step.name}
              </span>
              <span style={{ color: "#9198a1", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                {step.shown === null ? "" : formatDuration(step.shown)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* The pull request ---------------------------------------------------------------------------------- */

function Avatar({ size, children, bg }: { size: number; children?: ReactNode; bg: string }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        boxShadow: `0 0 0 1px ${G.border}`,
      }}
    >
      {children}
    </span>
  );
}

function BranchName({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12,
        color: G.accent,
        background: "#ddf4ff",
        padding: "2px 6px",
        borderRadius: 6,
      }}
    >
      {children}
    </span>
  );
}

function CommentBox({
  y,
  author,
  bot = false,
  avatar,
  children,
  opacity = 1,
  lift = 0,
}: {
  y: number;
  author: string;
  bot?: boolean;
  avatar: ReactNode;
  children: ReactNode;
  opacity?: number;
  lift?: number;
}) {
  return (
    <div style={{ ...abs(16, y + lift, 860), opacity, display: "flex", gap: 16 }}>
      {avatar}
      <div
        style={{ flex: 1, border: `1px solid ${G.border}`, borderRadius: 6, overflow: "hidden" }}
      >
        <div
          style={{
            background: G.subtle,
            borderBottom: `1px solid ${G.border}`,
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ fontWeight: 600 }}>{author}</span>
          {bot ? (
            <span
              style={{
                fontSize: 12,
                lineHeight: "18px",
                color: G.muted,
                border: `1px solid ${G.border}`,
                borderRadius: 999,
                padding: "0 7px",
              }}
            >
              bot
            </span>
          ) : null}
          <span style={{ color: G.muted }}>commented now</span>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

/** Where the stack comment's address sits, for the camera. */
export const COMMENT_Y = 392;

/** The pull request page; the stack comment shows once the preview deploy wrote it. */
export function PullRequestPage({
  comment,
  checksDone,
  t,
}: {
  comment: number;
  checksDone: boolean;
  t: number;
}) {
  const td: CSSProperties = { border: `1px solid ${G.border}`, padding: "6px 13px" };
  return (
    <div style={page}>
      <RepoHeader tab="Pull requests" />
      <div style={{ ...abs(16, 120), fontSize: 32, lineHeight: "44px" }}>
        Add expiry dates <span style={{ color: G.muted, fontWeight: 300 }}>#1</span>
      </div>
      <div
        style={{ ...abs(16, 176), display: "flex", alignItems: "center", gap: 8, color: G.muted }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: G.open,
            color: "#fff",
            borderRadius: 999,
            padding: "5px 12px",
            fontWeight: 500,
          }}
        >
          <GitPullRequest size={16} color="#fff" />
          Open
        </span>
        <span>
          <b style={{ color: G.fg }}>ava-chen</b> wants to merge 1 commit into{" "}
          <BranchName>main</BranchName> from <BranchName>expiry-dates</BranchName>
        </span>
      </div>
      <div
        style={{
          ...abs(0, 222, 1200, 48),
          borderBottom: `1px solid ${G.border}`,
          display: "flex",
          alignItems: "flex-end",
          paddingLeft: 16,
          gap: 4,
        }}
      >
        {[
          ["Conversation", "0"],
          ["Commits", "1"],
          ["Checks", "3"],
          ["Files changed", "2"],
        ].map(([label, count], i) => (
          <div
            key={label}
            style={{
              padding: "8px 16px",
              border: i === 0 ? `1px solid ${G.border}` : "1px solid transparent",
              borderBottom: i === 0 ? "1px solid #fff" : "none",
              borderRadius: "6px 6px 0 0",
              marginBottom: -1,
              background: i === 0 ? "#fff" : "transparent",
              display: "flex",
              gap: 6,
            }}
          >
            {label}
            <span
              style={{ background: "#e6eaef", borderRadius: 999, padding: "0 6px", fontSize: 12 }}
            >
              {label === "Conversation" ? (comment > 0 ? "1" : "0") : count}
            </span>
          </div>
        ))}
      </div>
      <CommentBox y={292} author="ava-chen" avatar={<Avatar size={40} bg="#c8d6c4" />}>
        <span style={{ color: G.muted, fontStyle: "italic" }}>No description provided.</span>
      </CommentBox>
      {comment > 0 ? (
        <CommentBox
          y={COMMENT_Y}
          author="github-actions"
          bot
          opacity={comment}
          lift={(1 - comment) * 10}
          avatar={
            <Avatar size={40} bg="#2088ff">
              <PlayOcticon size={22} color="#fff" />
            </Avatar>
          }
        >
          <table style={{ borderCollapse: "collapse", minWidth: 460 }}>
            <tbody>
              <tr>
                <td style={td}>
                  <sub style={{ fontSize: 11 }}>pr-1</sub>
                  <br />
                  <span style={{ color: G.accent }}>brave-lynx-207.convex.site</span>
                  <br />
                  <sub style={{ fontSize: 11 }}>
                    <span style={{ color: G.accent }}>b7e2d10</span> 2026-11-14 10:41 UTC
                  </sub>
                </td>
              </tr>
              <tr>
                <td style={{ ...td, background: G.subtle }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      color: G.accent,
                    }}
                  >
                    <ConvexLogo size={16} /> brave-lynx-207
                  </span>
                </td>
              </tr>
              <tr>
                <td style={td}>Sign-in with google, github: on</td>
              </tr>
            </tbody>
          </table>
        </CommentBox>
      ) : null}
      <div style={{ ...abs(912, 292, 272), fontSize: 12, color: G.muted }}>
        <div style={{ fontWeight: 600, color: G.muted }}>Reviewers</div>
        <div style={{ marginTop: 4 }}>No reviews</div>
        <div style={{ borderTop: `1px solid ${G.border}`, margin: "16px 0" }} />
        <div style={{ fontWeight: 600 }}>Labels</div>
        <div style={{ marginTop: 4 }}>None yet</div>
      </div>
      <div
        style={{
          ...abs(72, 640, 804, 64),
          border: `1px solid ${G.border}`,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 16px",
        }}
      >
        {checksDone ? (
          <CheckCircleFill size={20} color={G.success} />
        ) : (
          <RunningRing size={20} angle={spin(t)} />
        )}
        <span style={{ fontWeight: 600 }}>
          {checksDone ? "All checks have passed" : "Some checks haven’t completed yet"}
        </span>
      </div>
    </div>
  );
}
