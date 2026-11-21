import type { CSSProperties, ReactNode } from "react";

import {
  CheckCircle,
  ConvexLogo,
  GlobeIcon,
  KeyIcon,
  PendingCircle,
  Spinner,
  WorkflowIcon,
} from "./icons";
import { ease, mix, progress, rise, typed, typedCount } from "./motion";
import {
  CHANGES_DONE,
  CODE,
  COMMIT,
  DEPLOY_LOG,
  DEPLOY_STEP_FROM,
  OPEN_AT,
  OPINION_AT,
  OUTPUT_ROW,
  OUTPUT_WRITTEN,
  PAN_FROM,
  PAN_TO,
  PUSHED_AT,
  PUSH_TYPE_FROM,
  PUSH_TYPE_TO,
  RUN_DONE_AT,
  RUN_IN_FROM,
  RUN_IN_TO,
  RUN_STEPS,
  STACK,
  STATE_LINE,
  STATE_LINE_LENGTH,
  TABLE_IN,
  TERMINAL_AT,
  THREAD_TRAVEL,
  TYPING_END,
  type StackResource,
} from "./script";
import { dark, MONO_ADVANCE, mono, sans } from "./theme";

// Layout of the dark world, in pixels of the 1920 x 1080 frame. The camera pans right by PAN.
export const PAN = 1172;
const EDITOR = { x: 64, y: 176, w: 1080, h: 860 } as const;
const CODE_SIZE = 22;
const CODE_LINE = 30;
const CODE_LEFT = EDITOR.x + 76;
const CODE_TOP = EDITOR.y + 44 + 18;
const CHAR = CODE_SIZE * MONO_ADVANCE;
const CARD = { x: 1232, w: 624, h: 124, gap: 14 } as const;
/** The cards sit beside the statements that declare them: centred on lines 12 to 21. */
const CARD_TOP = CODE_TOP + 15.5 * CODE_LINE + CODE_LINE / 2 - (4 * CARD.h + 3 * CARD.gap) / 2;
const TABLE = { x: PAN + 764, y: CARD_TOP, w: 1096 } as const;
const ROW_TOP = TABLE.y + 150;
const ROW_H = 54;
const OUTPUT_ROW_TOP = ROW_TOP + 4 * ROW_H + 104;
/** The chip of Samebase, in frame pixels: where the light half opens from. */
const RUN_HEADER = 104;
const RUN_JOBS_W = 290;
const STEP_TOP = EDITOR.y + RUN_HEADER + 76;
const STEP_H = 46;
const DEPLOY_ROW_Y = STEP_TOP + 7 * STEP_H + STEP_H / 2;

const cardY = (index: number) => CARD_TOP + index * (CARD.h + CARD.gap);
const rowY = (index: number) => ROW_TOP + index * ROW_H + ROW_H / 2;

/** The camera also rises by LIFT with the pan, so the cards and the store sit in the middle. */
const LIFT = 104;

function Box({ style, children }: { style: CSSProperties; children?: ReactNode }) {
  return <div style={{ position: "absolute", ...style }}>{children}</div>;
}

// The stack file.

const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "default",
  "const",
  "yield",
  "function",
  "return",
  "as",
]);

type Token = { text: string; color: string };

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /(\/\/.*$|\/\*.*?\*\/|"[^"]*"|[A-Za-z_$][\w$]*|\s+|.)/g;
  let previous = "";
  for (const match of line.matchAll(pattern)) {
    const text = match[0];
    let color: string = dark.text;
    if (text.startsWith("//") || text.startsWith("/*")) color = dark.comment;
    else if (text.startsWith('"')) color = dark.string;
    else if (KEYWORDS.has(text)) color = dark.keyword;
    else if (/^[A-Z]/.test(text) && previous === ".") color = dark.type;
    else if (/^[^\w\s$]/.test(text)) color = "#9aa7a6";
    tokens.push({ text, color });
    if (text.trim() !== "") previous = text;
  }
  return tokens;
}

const LINES = CODE.map((line) => ({ ...line, tokens: tokenize(line.text) }));

function CodeLine({ tokens, shown }: { tokens: readonly Token[]; shown: number }) {
  let left = shown;
  return (
    <>
      {tokens.map((token, position) => {
        if (left <= 0) return null;
        const text = token.text.slice(0, left);
        left -= token.text.length;
        return (
          <span key={position} style={{ color: token.color }}>
            {text}
          </span>
        );
      })}
    </>
  );
}

function Editor({ t }: { t: number }) {
  const opacity = rise(t, OPEN_AT, OPEN_AT + 0.45) * (1 - ease(t, RUN_IN_FROM, RUN_IN_TO));
  if (opacity <= 0) return null;
  let typingLine = -1;
  CODE.forEach((line, index) => {
    if (!line.header && t >= line.from) typingLine = index;
  });
  const caretBlink = t > TYPING_END + 0.1 && Math.floor((t - TYPING_END) * 2.2) % 2 === 1;
  const opinion = rise(t, OPINION_AT, OPINION_AT + 0.4);
  return (
    <Box
      style={{
        left: EDITOR.x,
        top: EDITOR.y,
        width: EDITOR.w,
        height: EDITOR.h,
        opacity,
        background: dark.panel,
        border: `1px solid ${dark.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <Box
        style={{
          left: 0,
          top: 0,
          right: 0,
          height: 44,
          borderBottom: `1px solid ${dark.border}`,
          display: "flex",
          alignItems: "stretch",
          fontFamily: mono,
          fontSize: 17,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            color: dark.text,
            background: dark.panelHi,
            borderRight: `1px solid ${dark.border}`,
            boxShadow: `inset 0 -2px 0 ${dark.type}`,
          }}
        >
          alchemy.run.ts
        </div>
        <div
          style={{ display: "flex", alignItems: "center", padding: "0 18px", color: dark.faint }}
        >
          acme/pantry
        </div>
      </Box>
      <Box
        style={{
          left: 0,
          top: CODE_TOP - EDITOR.y + STATE_LINE * CODE_LINE - 1,
          width: EDITOR.w,
          height: CODE_LINE + 2,
          background: `rgba(240, 198, 116, ${0.07 * opinion})`,
        }}
      />
      {LINES.map((line, index) => {
        const { from, to } = line;
        const shown = line.header
          ? t >= from
            ? line.text.length
            : 0
          : typedCount(line.text.length, t, from, to);
        const headerIn = line.header ? rise(t, from, from + 0.3) : 1;
        if (shown === 0 && t < from) return null;
        const caret = index === typingLine && !caretBlink && t < RUN_IN_FROM;
        return (
          <Box
            key={index}
            style={{
              left: 0,
              top: CODE_TOP - EDITOR.y + index * CODE_LINE,
              width: EDITOR.w,
              height: CODE_LINE,
              opacity: headerIn,
              fontFamily: mono,
              fontSize: CODE_SIZE,
              lineHeight: `${CODE_LINE}px`,
              whiteSpace: "pre",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 0,
                width: 52,
                textAlign: "right",
                color: dark.faint,
                fontSize: 17,
              }}
            >
              {index + 1}
            </span>
            <span style={{ position: "absolute", left: CODE_LEFT - EDITOR.x }}>
              <CodeLine tokens={line.tokens} shown={shown} />
              {caret ? (
                <span
                  style={{
                    display: "inline-block",
                    width: 2,
                    height: 24,
                    marginLeft: 1,
                    verticalAlign: -5,
                    background: dark.text,
                  }}
                />
              ) : null}
            </span>
          </Box>
        );
      })}
      {opinion > 0 ? (
        <Box
          style={{
            left: CODE_LEFT - EDITOR.x + STATE_LINE_LENGTH * CHAR + 26,
            top: CODE_TOP - EDITOR.y + STATE_LINE * CODE_LINE + 1,
            height: CODE_LINE - 2,
            opacity: opinion,
            transform: `translateX(${mix(-10, 0, opinion)}px)`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: sans,
            fontSize: 19,
            color: dark.type,
            whiteSpace: "nowrap",
          }}
        >
          <span>←</span> the opinion: state lives in Convex
        </Box>
      ) : null}
      <Terminal t={t} />
    </Box>
  );
}

function Terminal({ t }: { t: number }) {
  const shown = rise(t, TERMINAL_AT, TERMINAL_AT + 0.4);
  if (shown <= 0) return null;
  const height = 150;
  const pushed = rise(t, PUSHED_AT, PUSHED_AT + 0.2);
  const lineStyle: CSSProperties = { height: 30, lineHeight: "30px", whiteSpace: "pre" };
  return (
    <Box
      style={{
        left: 0,
        right: 0,
        bottom: 0,
        height,
        transform: `translateY(${mix(height, 0, shown)}px)`,
        background: "#090c0d",
        borderTop: `1px solid ${dark.border}`,
        padding: "18px 28px",
        fontFamily: mono,
        fontSize: 20,
        color: dark.text,
      }}
    >
      <div style={lineStyle}>
        <span style={{ color: dark.green }}>$ </span>
        {typed("git push origin main", t, PUSH_TYPE_FROM, PUSH_TYPE_TO)}
      </div>
      <div style={{ ...lineStyle, color: dark.muted, opacity: pushed }}>
        To github.com:acme/pantry.git
      </div>
      <div style={{ ...lineStyle, color: dark.muted, opacity: pushed }}>
        {" * [new branch]      main -> main"}
      </div>
    </Box>
  );
}

// The run of .github/workflows/alchemy-deploy.yml.

type Status = "pending" | "running" | "done";

function StatusIcon({ status, t, size }: { status: Status; t: number; size: number }) {
  if (status === "done") return <CheckCircle size={size} color={dark.green} />;
  if (status === "running") return <Spinner size={size} color={dark.amber} turn={t * 1.1} />;
  return <PendingCircle size={size} color={dark.faint} />;
}

const stepStatus = (t: number, step: { from: number; done: number }): Status =>
  t >= step.done ? "done" : t >= step.from ? "running" : "pending";

function RunPanel({ t }: { t: number }) {
  const opacity =
    rise(t, RUN_IN_FROM + 0.1, RUN_IN_TO + 0.1) * (1 - ease(t, PAN_FROM, PAN_TO - 0.3));
  if (opacity <= 0) return null;
  const done = t >= RUN_DONE_AT;
  const logOpen = rise(t, DEPLOY_STEP_FROM, DEPLOY_STEP_FROM + 0.35);
  const jobStatus: Status = done ? "done" : "running";
  const changesStatus: Status = t >= CHANGES_DONE ? "done" : "running";
  return (
    <Box
      style={{
        left: EDITOR.x,
        top: EDITOR.y,
        width: EDITOR.w,
        height: EDITOR.h,
        opacity,
        background: dark.panel,
        border: `1px solid ${dark.border}`,
        borderRadius: 8,
        overflow: "hidden",
        fontFamily: sans,
        color: dark.text,
      }}
    >
      <Box
        style={{
          left: 0,
          top: 0,
          right: 0,
          height: RUN_HEADER,
          borderBottom: `1px solid ${dark.border}`,
          padding: "22px 28px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <WorkflowIcon size={26} color={dark.muted} />
          <span style={{ fontSize: 26, fontWeight: 600 }}>Alchemy deploy</span>
          <span
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 19,
              color: done ? dark.green : dark.amber,
            }}
          >
            <StatusIcon status={jobStatus} t={t} size={20} />
            {done ? "Success" : "In progress"}
          </span>
        </div>
        <div style={{ marginTop: 10, fontSize: 18, color: dark.muted, display: "flex", gap: 14 }}>
          <span style={{ color: dark.text }}>{COMMIT.message}</span>
          <span style={{ fontFamily: mono, fontSize: 17 }}>acme/pantry · main · {COMMIT.sha}</span>
        </div>
      </Box>
      <Box
        style={{
          left: 0,
          top: RUN_HEADER,
          width: RUN_JOBS_W,
          bottom: 0,
          borderRight: `1px solid ${dark.border}`,
          padding: "22px 18px",
        }}
      >
        <div style={{ fontSize: 16, color: dark.muted, marginBottom: 14, paddingLeft: 10 }}>
          Jobs
        </div>
        {(
          [
            ["Changes", changesStatus, false],
            ["Deploy production", jobStatus, true],
          ] as const
        ).map(([name, status, selected]) => (
          <div
            key={name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              height: 46,
              padding: "0 10px",
              fontSize: 19,
              borderRadius: 6,
              background: selected ? dark.panelHi : "transparent",
              boxShadow: selected ? `inset 2px 0 0 ${dark.muted}` : "none",
            }}
          >
            <StatusIcon status={status} t={t} size={20} />
            {name}
          </div>
        ))}
      </Box>
      <Box style={{ left: RUN_JOBS_W + 32, top: RUN_HEADER + 22, right: 32 }}>
        <div style={{ fontSize: 23, fontWeight: 600, height: 54 }}>Deploy production</div>
      </Box>
      {RUN_STEPS.map((step, index) => {
        const status = stepStatus(t, step);
        return (
          <Box
            key={step.name}
            style={{
              left: RUN_JOBS_W + 24,
              right: 24,
              top: STEP_TOP - EDITOR.y + index * STEP_H,
              height: STEP_H,
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "0 10px",
              fontSize: 19,
              color: status === "pending" ? dark.muted : dark.text,
              background: index === 7 && status !== "pending" ? dark.panelHi : "transparent",
              borderRadius: 6,
            }}
          >
            <StatusIcon status={status} t={t} size={20} />
            {step.name}
          </Box>
        );
      })}
      <Box
        style={{
          left: RUN_JOBS_W + 34,
          right: 34,
          top: STEP_TOP - EDITOR.y + 8 * STEP_H + 6,
          height: 150 * logOpen,
          overflow: "hidden",
          background: "#090c0d",
          borderRadius: 6,
          border: logOpen > 0 ? `1px solid ${dark.border}` : "none",
        }}
      >
        <div style={{ padding: "14px 16px", fontFamily: mono, fontSize: 15, lineHeight: "28px" }}>
          {DEPLOY_LOG.map((line, index) => (
            <div
              key={line}
              style={{
                whiteSpace: "pre",
                color: index === 0 ? dark.text : dark.muted,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </Box>
    </Box>
  );
}

// The four resources.

function ResourceIcon({ kind, size }: { kind: "convex" | "key" | "globe"; size: number }) {
  if (kind === "convex") return <ConvexLogo size={size} />;
  if (kind === "key") return <KeyIcon size={size} color={dark.text} />;
  return <GlobeIcon size={size} color={dark.text} />;
}

function ResourceCard({
  resource,
  index,
  t,
}: {
  resource: StackResource;
  index: number;
  t: number;
}) {
  const { born } = resource;
  if (t < born) return null;
  const [creatingAt, createdAt] = resource.run;
  const drawn = rise(t, born, born + 0.35);
  const filled = rise(t, born + 0.15, born + 0.5);
  const creating = t >= creatingAt && t < createdAt;
  const created = t >= createdAt;
  const glint = created ? 1 - progress(t, createdAt, createdAt + 0.9) : 0;
  const attr = created ? typed(resource.attr, t, createdAt + 0.05, createdAt + 0.35) : "";
  return (
    <Box
      style={{
        left: CARD.x,
        top: cardY(index),
        width: CARD.w,
        height: CARD.h,
        clipPath: `inset(0 ${(1 - drawn) * 100}% 0 0)`,
        background: created
          ? `color-mix(in srgb, ${dark.panelHi} ${glint * 100}%, ${dark.panel})`
          : dark.panel,
        border: `1px ${creating || created ? "solid" : "dashed"} ${
          creating ? dark.amber : created ? dark.borderHi : dark.faint
        }`,
        borderRadius: 8,
        padding: "14px 22px",
        boxSizing: "border-box",
        fontFamily: sans,
        color: dark.text,
      }}
    >
      <div style={{ opacity: filled }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, height: 36 }}>
          <ResourceIcon kind={resource.icon} size={28} />
          <span style={{ fontSize: 26, fontWeight: 600 }}>{resource.name}</span>
          <span
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: mono,
              fontSize: 18,
              color: created ? dark.green : dark.amber,
            }}
          >
            {creating ? (
              <>
                <Spinner size={18} color={dark.amber} turn={t * 1.1} />
                creating
              </>
            ) : created ? (
              <>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: dark.green }} />
                created
              </>
            ) : null}
          </span>
        </div>
        <div style={{ marginTop: 8, fontFamily: mono, fontSize: 19, whiteSpace: "pre" }}>
          <span style={{ color: dark.type }}>{resource.type}</span>
          <span style={{ color: dark.muted }}>{`("${resource.fqn}")`}</span>
        </div>
        <div
          style={{
            marginTop: 4,
            height: 26,
            fontFamily: mono,
            fontSize: 19,
            whiteSpace: "pre",
            color: dark.muted,
          }}
        >
          {created ? (
            <>
              {`${resource.attrKey}: `}
              <span style={{ color: dark.text }}>{attr}</span>
            </>
          ) : null}
        </div>
      </div>
    </Box>
  );
}

// The state store: alchemy-convex src/store/component/schema.ts.

const RESOURCE_COLUMNS = [
  ["stack", 196],
  ["stage", 96],
  ["fqn", 222],
  ["value", 0],
] as const;

const OUTPUT_COLUMNS = [
  ["stack", 196],
  ["stage", 96],
  ["value", 250],
  ["currentRun", 0],
] as const;

function Cells({
  columns,
  values,
  colors,
}: {
  columns: readonly (readonly [string, number])[];
  values: readonly string[];
  colors: readonly string[];
}) {
  return (
    <>
      {columns.map(([name, width], index) => (
        <div
          key={name}
          style={{
            width: width === 0 ? undefined : width,
            flex: width === 0 ? 1 : undefined,
            minWidth: 0,
            paddingRight: 16,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "pre",
            color: colors[index],
          }}
        >
          {values[index]}
        </div>
      ))}
    </>
  );
}

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "0 22px",
  fontFamily: mono,
  fontSize: 18,
};

function TableRow({
  top,
  writtenAt,
  t,
  columns,
  values,
}: {
  top: number;
  writtenAt: number;
  t: number;
  columns: readonly (readonly [string, number])[];
  values: readonly string[];
}) {
  if (t < writtenAt) return null;
  const flash = 1 - progress(t, writtenAt, writtenAt + 1.1);
  const shown = rise(t, writtenAt, writtenAt + 0.25);
  const last = values.length - 1;
  const text = values.map((value, index) =>
    index === last ? typed(value, t, writtenAt, writtenAt + 0.4) : value,
  );
  return (
    <Box
      style={{
        ...rowStyle,
        left: 0,
        right: 0,
        top: top - TABLE.y,
        height: ROW_H,
        opacity: shown,
        background: `rgba(63, 185, 80, ${0.16 * flash})`,
        borderBottom: `1px solid ${dark.border}`,
      }}
    >
      <Cells
        columns={columns}
        values={text}
        colors={[dark.text, dark.text, dark.text, dark.muted]}
      />
    </Box>
  );
}

function ColumnHeader({
  top,
  columns,
}: {
  top: number;
  columns: readonly (readonly [string, number])[];
}) {
  return (
    <Box
      style={{
        ...rowStyle,
        left: 0,
        right: 0,
        top: top - TABLE.y,
        height: 40,
        fontSize: 16,
        borderBottom: `1px solid ${dark.border}`,
        background: dark.panelHi,
      }}
    >
      <Cells
        columns={columns}
        values={columns.map(([name]) => name)}
        colors={columns.map(() => dark.muted)}
      />
    </Box>
  );
}

const resourceValue = (resource: StackResource) =>
  `{"resourceType":"${resource.type}","fqn":"${resource.fqn}","status":"created",…}`;

function StateTable({ t }: { t: number }) {
  const shown = rise(t, TABLE_IN, TABLE_IN + 0.6);
  if (shown <= 0) return null;
  const count = STACK.filter((resource) => t >= resource.written).length;
  const sectionLabel = (top: number, name: string, documents: number) => (
    <Box
      style={{
        left: 22,
        right: 22,
        top: top - TABLE.y,
        height: 44,
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontFamily: mono,
        fontSize: 19,
      }}
    >
      <span style={{ color: dark.text }}>{name}</span>
      <span style={{ fontFamily: sans, fontSize: 17, color: dark.muted }}>
        {documents} {documents === 1 ? "document" : "documents"}
      </span>
    </Box>
  );
  return (
    <Box
      style={{
        left: TABLE.x,
        top: TABLE.y,
        width: TABLE.w,
        height: OUTPUT_ROW_TOP + ROW_H - TABLE.y,
        opacity: shown,
        transform: `translateX(${mix(24, 0, shown)}px)`,
        background: dark.panel,
        border: `1px solid ${dark.border}`,
        borderRadius: 8,
        overflow: "hidden",
        color: dark.text,
      }}
    >
      <Box
        style={{
          left: 0,
          right: 0,
          top: 0,
          height: 60,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 22px",
          borderBottom: `1px solid ${dark.border}`,
          fontFamily: sans,
          fontSize: 21,
        }}
      >
        <ConvexLogo size={24} />
        <span style={{ color: dark.muted }}>acme-platform</span>
        <span style={{ color: dark.faint }}>/</span>
        <span style={{ fontWeight: 600 }}>alchemy-state-store</span>
        <span style={{ color: dark.faint }}>/</span>
        <span style={{ color: dark.muted }}>production</span>
        <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 17, color: dark.faint }}>
          Convex.state()
        </span>
      </Box>
      {sectionLabel(TABLE.y + 64, "resources", count)}
      <ColumnHeader top={ROW_TOP - 40} columns={RESOURCE_COLUMNS} />
      {STACK.map((resource, index) => (
        <TableRow
          key={resource.fqn}
          t={t}
          top={ROW_TOP + index * ROW_H}
          writtenAt={resource.written}
          columns={RESOURCE_COLUMNS}
          values={["acme/pantry", "prod", resource.fqn, resourceValue(resource)]}
        />
      ))}
      {sectionLabel(OUTPUT_ROW_TOP - 84, "outputs", t >= OUTPUT_WRITTEN ? 1 : 0)}
      <ColumnHeader top={OUTPUT_ROW_TOP - 40} columns={OUTPUT_COLUMNS} />
      <TableRow
        t={t}
        top={OUTPUT_ROW_TOP}
        writtenAt={OUTPUT_WRITTEN}
        columns={OUTPUT_COLUMNS}
        values={OUTPUT_ROW}
      />
    </Box>
  );
}

// The threads between code, run, cards, rows and Samebase.

function curve(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(48, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function Thread({
  d,
  opacity,
  color,
  drawn,
  marching,
  t,
}: {
  d: string;
  opacity: number;
  color: string;
  drawn: number;
  marching: boolean;
  t: number;
}) {
  if (opacity <= 0 || drawn <= 0) return null;
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      opacity={opacity}
      pathLength={1}
      strokeDasharray={marching ? "0.012 0.014" : `${drawn} 1`}
      strokeDashoffset={marching ? -t * 0.04 : 0}
    />
  );
}

function Threads({ t }: { t: number }) {
  const codeFade = 1 - ease(t, RUN_IN_FROM, RUN_IN_TO);
  const elements: ReactNode[] = [];
  STACK.forEach((resource, index) => {
    const y1 = CODE_TOP + resource.line * CODE_LINE + CODE_LINE / 2;
    const x1 = CODE_LEFT + resource.lineLength * CHAR + 14;
    const y2 = cardY(index) + CARD.h / 2;
    const { born } = resource;
    elements.push(
      <Thread
        key={`code-${index}`}
        d={curve(x1, y1, CARD.x - 2, y2)}
        opacity={0.85 * codeFade}
        color={dark.threadHi}
        drawn={rise(t, born - 0.1, born + 0.35)}
        marching={false}
        t={t}
      />,
    );
    const [creatingAt, createdAt] = resource.run;
    const runVisible =
      rise(t, creatingAt - 0.15, creatingAt) * (1 - ease(t, createdAt + 0.3, createdAt + 0.8));
    elements.push(
      <Thread
        key={`run-${index}`}
        d={curve(EDITOR.x + EDITOR.w + 2, DEPLOY_ROW_Y, CARD.x - 2, y2)}
        opacity={0.9 * runVisible}
        color={t >= createdAt ? dark.green : dark.amber}
        drawn={1}
        marching={t < createdAt}
        t={t}
      />,
    );
    const { written } = resource;
    const stateD = curve(CARD.x + CARD.w + 2, y2, TABLE.x - 2, rowY(index));
    elements.push(
      <Thread
        key={`state-${index}`}
        d={stateD}
        opacity={0.75}
        color={dark.threadHi}
        drawn={rise(t, written - THREAD_TRAVEL, written)}
        marching={false}
        t={t}
      />,
    );
  });
  return (
    <svg
      width={PAN + 1920}
      height={1080}
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
    >
      {elements}
      {STACK.map((resource, index) => {
        const { written } = resource;
        const p = progress(t, written - THREAD_TRAVEL, written);
        if (p <= 0 || p >= 1) return null;
        const y2 = cardY(index) + CARD.h / 2;
        const x1 = CARD.x + CARD.w + 2;
        const x2 = TABLE.x - 2;
        const y3 = rowY(index);
        const dx = Math.max(48, Math.abs(x2 - x1) / 2);
        const u = 1 - p;
        const x =
          u * u * u * x1 + 3 * u * u * p * (x1 + dx) + 3 * u * p * p * (x2 - dx) + p * p * p * x2;
        const y = u * u * u * y2 + 3 * u * u * p * y2 + 3 * u * p * p * y3 + p * p * p * y3;
        return <circle key={index} cx={x} cy={y} r={5} fill={dark.green} />;
      })}
    </svg>
  );
}

/** The output row on screen after the camera moved: where the Samebase app opens from. */
export const OUTPUT_ROW_RECT = {
  x: TABLE.x - PAN,
  y: OUTPUT_ROW_TOP - LIFT,
  w: TABLE.w,
  h: ROW_H,
} as const;

/** The output row, lit: dark words on white, drawn in the light layer over the dark one. */
export function LitOutputRow({ opacity }: { opacity: number }) {
  if (opacity <= 0) return null;
  return (
    <Box
      style={{
        ...rowStyle,
        left: OUTPUT_ROW_RECT.x,
        top: OUTPUT_ROW_RECT.y,
        width: OUTPUT_ROW_RECT.w,
        height: OUTPUT_ROW_RECT.h,
        boxSizing: "border-box",
        opacity,
      }}
    >
      <Cells
        columns={OUTPUT_COLUMNS}
        values={OUTPUT_ROW}
        colors={["#0c0a09", "#0c0a09", "#0c0a09", "#78716c"]}
      />
    </Box>
  );
}

export function DarkWorld({ t }: { t: number }) {
  const pan = ease(t, PAN_FROM, PAN_TO);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: PAN + 1920,
        height: 1080,
        transform: `translate(${-PAN * pan}px, ${-LIFT * pan}px)`,
      }}
    >
      <Editor t={t} />
      <RunPanel t={t} />
      <StateTable t={t} />
      <Threads t={t} />
      {STACK.map((resource, index) => (
        <ResourceCard key={resource.fqn} resource={resource} index={index} t={t} />
      ))}
    </div>
  );
}
