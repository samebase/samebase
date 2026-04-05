import {
  MachinesTranscriptPrototype,
  type MachinesTranscriptPrototypeBlock,
} from "@/components/MachinesTranscriptPrototype";

export type MachinesTranscriptPrototypeVisualMode =
  "machines-transcript-prototype";

const FIXTURE_BLOCKS = [
  {
    kind: "message",
    id: "machines-transcript-user-1",
    from: "user",
    itemId: "item_user_1",
    itemType: "userMessage",
    turnId: "turn_1",
    body: `The current /machines history still feels impossible to copy on mobile because long-press selection stops at the boundary between one message and the next.

I do not want a visible toggle. The rendered conversation should feel natural until I start selecting text, and then it should reveal the source-shaped transcript automatically.`,
  },
  {
    kind: "message",
    id: "machines-transcript-assistant-1",
    from: "assistant",
    itemId: "item_assistant_1",
    itemType: "assistantMessage",
    turnId: "turn_1",
    body: `That points away from multiple editor roots and toward one transcript DOM flow.

The selection-friendly layer can own the real text, while the richer message presentation stays on top as a visual layer only. That lets us keep message styling without sacrificing copy and paste.`,
  },
  {
    kind: "work",
    id: "machines-transcript-work-1",
    title: "Prototype direction",
    itemId: "item_work_1",
    itemType: "fileChange",
    tone: "tool",
    body: `Build the transcript as a full-page fixture first.

Use explicit source tags like <Message from="assistant"> under the hood.

Keep the layout height stable so selection does not jump when the source layer becomes visible.`,
  },
  {
    kind: "message",
    id: "machines-transcript-user-2",
    from: "user",
    itemId: "item_user_2",
    itemType: "userMessage",
    turnId: "turn_2",
    body: `It is fine if the first completed implementation does not live inside /machines yet.

I mainly want a dedicated page where I can open the fixture in mobile mode, tap and hold on the transcript, and see whether selection still feels continuous across multiple messages.`,
  },
  {
    kind: "message",
    id: "machines-transcript-assistant-2",
    from: "assistant",
    itemId: "item_assistant_2",
    itemType: "assistantMessage",
    turnId: "turn_2",
    body: `That makes sense. The fixture can own the riskier interaction work first, and the real route can adopt the proven surface afterward.

If this version feels good on a phone, we can then move the exact same transcript element into /machines with much less uncertainty.`,
  },
] as const satisfies readonly MachinesTranscriptPrototypeBlock[];

export function MachinesTranscriptPrototypeVisualFixture({
  mode: _mode,
}: {
  mode: MachinesTranscriptPrototypeVisualMode;
}) {
  return (
    <div
      data-testid="machines-transcript-prototype-visual-fixture"
      className="min-h-screen bg-background px-4 py-4 text-foreground sm:px-6 sm:py-6"
    >
      <div className="mx-auto w-full max-w-3xl">
        <MachinesTranscriptPrototype
          blocks={FIXTURE_BLOCKS}
          dataTestId="machines-transcript-prototype"
          className="min-h-[calc(100vh-2rem)]"
        />
      </div>
    </div>
  );
}
