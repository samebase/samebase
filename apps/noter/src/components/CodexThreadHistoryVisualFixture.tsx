import { Badge } from "@/components/badge";
import { CodexAppServerThreadInventoryCard } from "@/components/CodexAppServerThreadInventoryCard";
import { CodexAppServerThreadHistoryItemCard } from "@/components/CodexAppServerThreadHistoryItemCard";
import { type CodexAppServerThread } from "@/lib/codexAppServerResearch";

export type CodexThreadHistoryVisualMode = "codex-thread-history";

const SHORT_ITEM = {
  id: "message-short",
  type: "assistant_message",
  summary: "READY",
  raw: {},
} as const;

const TWO_LINE_ITEM = {
  id: "message-two-line",
  type: "assistant_message",
  summary:
    "Machine threads stay local to the connector.\nNoter only needs the normalized session handle.",
  raw: {
    text: "Machine threads stay local to the connector.\nNoter only needs the normalized session handle.",
  },
} as const;

const LONG_ITEM = {
  id: "message-long",
  type: "assistant_message",
  summary: `I inspected the app-server handshake and captured the full event sequence so we can separate the provider protocol from the Noter contract.\n\nThe next step is to keep machine presence, approvals, and recent normalized events in Convex while treating the provider thread id as opaque runtime state. That gives us one machine connector process that can service multiple remote threads without leaking Codex-specific JSON-RPC details into the product model.`,
  raw: {},
} as const;

const TWO_LINE_THREAD = {
  id: "thread-two-line",
  name: null,
  preview:
    "Machine threads stay local to the connector.\nNoter only needs the normalized session handle.",
  cwd: "/Users/nicu/.codex/worktrees/5fed/noter",
  project: {
    id: "/Users/nicu/dev/my/noter",
    label: "noter",
    rootCwd: "/Users/nicu/dev/my/noter",
  },
  workspace: {
    label: "5fed",
    isProjectRoot: false,
  },
  createdAt: 1_774_539_343,
  updatedAt: 1_774_539_373,
  cliVersion: "0.114.0",
  modelProvider: "openai",
  sourceLabel: "vscode",
  source: "vscode",
  status: {
    type: "idle",
    activeFlags: [],
    raw: { type: "idle" },
  },
  gitInfo: null,
  path: null,
  agentNickname: null,
  agentRole: null,
  turns: [],
  raw: {},
} as const satisfies CodexAppServerThread;

const LONG_THREAD = {
  ...TWO_LINE_THREAD,
  id: "thread-long",
  preview:
    "check latest pr created; it was created from noter.md ui I'd like something to run on this machine that when it sees such a pr created knows that it needs to start codex to do the research and update the pull request with findings",
} as const satisfies CodexAppServerThread;

export function CodexThreadHistoryVisualFixture({
  mode,
}: {
  mode: CodexThreadHistoryVisualMode;
}) {
  return (
    <div
      data-testid="codex-thread-history-visual-fixture"
      data-mode={mode}
      className="min-h-screen bg-slate-100 p-8 text-slate-950"
    >
      <div className="mx-auto grid max-w-4xl gap-6">
        <header className="grid gap-2 border border-slate-300 bg-white p-5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Codex Thread History Visual Fixture
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Covers both research-page ellipsis surfaces: thread history rows and
            thread inventory previews. The chevron only appears when the
            collapsed two-line view actually hides text.
          </p>
        </header>

        <section className="grid gap-4 border border-slate-300 bg-white p-5">
          <div className="grid gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Short message
            </div>
            <CodexAppServerThreadHistoryItemCard item={SHORT_ITEM} />
          </div>

          <div className="grid gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Exactly two lines
            </div>
            <CodexAppServerThreadHistoryItemCard item={TWO_LINE_ITEM} />
          </div>

          <div className="grid gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Collapsed long message
            </div>
            <CodexAppServerThreadHistoryItemCard item={LONG_ITEM} />
          </div>

          <div className="grid gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Expanded long message
            </div>
            <CodexAppServerThreadHistoryItemCard
              item={LONG_ITEM}
              defaultExpanded
            />
          </div>
        </section>

        <section className="grid gap-4 border border-slate-300 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Thread inventory preview
          </div>

          <div className="grid gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Exactly two lines
            </div>
            <CodexAppServerThreadInventoryCard
              isSelected={false}
              statusBadge={<Badge variant="outline">idle</Badge>}
              thread={TWO_LINE_THREAD}
              updatedAtLabel="3/26/2026, 5:36:13 PM"
            />
          </div>

          <div className="grid gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Collapsed long preview
            </div>
            <CodexAppServerThreadInventoryCard
              isSelected
              statusBadge={<Badge variant="outline">notLoaded</Badge>}
              thread={LONG_THREAD}
              updatedAtLabel="3/26/2026, 5:55:08 PM"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
