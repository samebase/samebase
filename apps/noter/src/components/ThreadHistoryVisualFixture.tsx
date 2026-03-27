import { ThreadHistoryItemCard } from "@/components/ThreadHistoryItemCard";

export type ThreadHistoryVisualMode = "thread-history";

const THREAD_VISUAL_FIXTURE_FONT_RULES = `
  [data-thread-visual-fixture-font],
  [data-thread-visual-fixture-font] * {
    font-family: "IBM Plex Sans", sans-serif !important;
    font-synthesis: none;
  }
`;

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
  summary:
    "Inspect the runtime handshake.\nKeep the connector local.\nExpose one remote session handle.\nStore normalized events in Convex.",
  text: "Inspect the runtime handshake.\nKeep the connector local.\nExpose one remote session handle.\nStore normalized events in Convex.",
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
      data-thread-visual-fixture-font
      className="min-h-screen bg-slate-100 p-8 text-slate-950"
    >
      <style>{THREAD_VISUAL_FIXTURE_FONT_RULES}</style>
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
