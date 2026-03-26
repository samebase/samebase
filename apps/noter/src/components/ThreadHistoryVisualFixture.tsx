import { ThreadHistoryItemCard } from "@/components/ThreadHistoryItemCard";

export type ThreadHistoryVisualMode = "thread-history";

const SHORT_ITEM = {
  id: "message-short",
  type: "assistant_message",
  summary: "READY",
  text: "READY",
} as const;

const TWO_LINE_ITEM = {
  id: "message-two-line",
  type: "assistant_message",
  summary:
    "Machine threads stay local to the connector.\nThe browser only needs the normalized session handle.",
  text: "Machine threads stay local to the connector.\nThe browser only needs the normalized session handle.",
} as const;

const LONG_ITEM = {
  id: "message-long",
  type: "assistant_message",
  summary: `I inspected the local runtime handshake and captured the full event sequence so we can separate the provider protocol from the Noter contract.\n\nThe next step is to keep machine presence, approvals, and recent normalized events in Convex while treating the provider thread id as opaque runtime state. That gives us one machine connector process that can service multiple remote threads without leaking provider-specific details into the product model.`,
  text: `I inspected the local runtime handshake and captured the full event sequence so we can separate the provider protocol from the Noter contract.\n\nThe next step is to keep machine presence, approvals, and recent normalized events in Convex while treating the provider thread id as opaque runtime state. That gives us one machine connector process that can service multiple remote threads without leaking provider-specific details into the product model.`,
} as const;

export function ThreadHistoryVisualFixture({
  mode,
}: {
  mode: ThreadHistoryVisualMode;
}) {
  mode satisfies ThreadHistoryVisualMode;

  return (
    <div
      data-testid="thread-history-visual-fixture"
      className="min-h-screen bg-slate-100 p-8 text-slate-950"
    >
      <div className="mx-auto grid max-w-4xl gap-6">
        <header className="grid gap-2 border border-slate-300 bg-white p-5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Thread History Visual Fixture
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Covers the inline expand behavior for short, two-line, and long
            thread history items.
          </p>
        </header>

        <section className="grid gap-4 border border-slate-300 bg-white p-5">
          <div className="grid gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Short message
            </div>
            <ThreadHistoryItemCard item={SHORT_ITEM} />
          </div>

          <div className="grid gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Exactly two lines
            </div>
            <ThreadHistoryItemCard item={TWO_LINE_ITEM} />
          </div>

          <div className="grid gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Collapsed long message
            </div>
            <ThreadHistoryItemCard item={LONG_ITEM} />
          </div>

          <div className="grid gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Expanded long message
            </div>
            <ThreadHistoryItemCard item={LONG_ITEM} defaultExpanded />
          </div>
        </section>
      </div>
    </div>
  );
}
