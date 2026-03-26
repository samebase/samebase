import { CodexAppServerThreadHistoryItemCard } from "@/components/CodexAppServerThreadHistoryItemCard";

export type CodexThreadHistoryVisualMode = "codex-thread-history";

const SHORT_ITEM = {
  id: "message-short",
  type: "assistant_message",
  summary: "READY",
  raw: {},
} as const;

const LONG_ITEM = {
  id: "message-long",
  type: "assistant_message",
  summary: `I inspected the app-server handshake and captured the full event sequence so we can separate the provider protocol from the Noter contract.\n\nThe next step is to keep machine presence, approvals, and recent normalized events in Convex while treating the provider thread id as opaque runtime state. That gives us one machine connector process that can service multiple remote threads without leaking Codex-specific JSON-RPC details into the product model.`,
  raw: {},
} as const;

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
            Covers the collapsed two-line preview, the no-noise short-message
            state, and the in-place icon toggle used to reveal the full message
            in the research page thread detail panel.
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
      </div>
    </div>
  );
}
