import { useEffect, useMemo, useRef, useState } from "react";
import { type MachinesTranscriptPrototypeBlock } from "@/lib/machinesTranscriptPrototype";
import { cn } from "@/lib/utils";

function readSourceTagName(block: MachinesTranscriptPrototypeBlock): string {
  return block.kind === "message" ? "Message" : "Work";
}

function escapeAttributeValue(value: string): string {
  return value.replace(/"/g, "&quot;");
}

function serializeOpeningTag(block: MachinesTranscriptPrototypeBlock): string {
  if (block.kind === "message") {
    const attributes = [
      `from="${escapeAttributeValue(block.from)}"`,
      block.itemId ? `itemId="${escapeAttributeValue(block.itemId)}"` : null,
      block.itemType
        ? `itemType="${escapeAttributeValue(block.itemType)}"`
        : null,
      block.turnId ? `turnId="${escapeAttributeValue(block.turnId)}"` : null,
    ]
      .filter((value) => value !== null)
      .join(" ");

    return `<Message ${attributes}>`;
  }

  const attributes = [
    `title="${escapeAttributeValue(block.title)}"`,
    block.itemId ? `itemId="${escapeAttributeValue(block.itemId)}"` : null,
    block.itemType
      ? `itemType="${escapeAttributeValue(block.itemType)}"`
      : null,
    block.tone ? `tone="${escapeAttributeValue(block.tone)}"` : null,
  ]
    .filter((value) => value !== null)
    .join(" ");

  return `<Work ${attributes}>`;
}

function serializeClosingTag(block: MachinesTranscriptPrototypeBlock): string {
  return `</${readSourceTagName(block)}>`;
}

function splitParagraphs(value: string): string[] {
  return value
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function hasActiveSelectionInsideElement(element: HTMLElement): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const selection = window.getSelection();
  if (
    selection === null ||
    selection.isCollapsed ||
    selection.rangeCount === 0
  ) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const commonAncestor = range.commonAncestorContainer;
  if (element.contains(commonAncestor)) {
    return true;
  }

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  return (
    (anchorNode !== null && element.contains(anchorNode)) ||
    (focusNode !== null && element.contains(focusNode))
  );
}

function SourceBody({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div className="machines-transcript-prototype-source-body">
      {paragraphs.map((paragraph, index) => (
        <p
          key={`${index}-${paragraph.slice(0, 32)}`}
          data-transcript-source-body
          className="machines-transcript-prototype-source-paragraph"
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function RenderedBody({
  block,
}: {
  block: MachinesTranscriptPrototypeBlock;
}) {
  if (block.kind === "work") {
    return (
      <div className="machines-transcript-prototype-rendered-work" />
    );
  }

  return (
    <div
      className={cn(
        "machines-transcript-prototype-rendered-message",
        block.from === "user"
          ? "machines-transcript-prototype-rendered-message-user"
          : "machines-transcript-prototype-rendered-message-assistant",
      )}
    />
  );
}

function TranscriptBlock({
  block,
  showSourceMarkup,
}: {
  block: MachinesTranscriptPrototypeBlock;
  showSourceMarkup: boolean;
}) {
  const paragraphs = useMemo(() => splitParagraphs(block.body), [block.body]);
  const sourceBodyClassName =
    block.kind === "work"
      ? "machines-transcript-prototype-source-body-work"
      : block.from === "user"
        ? "machines-transcript-prototype-source-body-user"
        : "machines-transcript-prototype-source-body-assistant";

  return (
    <section
      data-transcript-block
      data-role={block.kind === "message" ? block.from : "work"}
      className="machines-transcript-prototype-block"
    >
      <div className="machines-transcript-prototype-source-layer">
        {showSourceMarkup ? (
          <div className="machines-transcript-prototype-source-tag">
            {serializeOpeningTag(block)}
          </div>
        ) : null}
        <div className={sourceBodyClassName}>
          <SourceBody paragraphs={paragraphs} />
        </div>
        {showSourceMarkup ? (
          <div className="machines-transcript-prototype-source-tag">
            {serializeClosingTag(block)}
          </div>
        ) : null}
      </div>
      <div
        aria-hidden="true"
        className="machines-transcript-prototype-rendered-layer"
        data-testid="machines-transcript-prototype-rendered-layer"
      >
        <RenderedBody block={block} />
      </div>
    </section>
  );
}

/**
 * Prototype transcript surface for testing cross-message selection without
 * reintroducing multiple editor roots. The source layer owns layout and
 * selection; the rendered layer is purely visual chrome on top.
 */
export function MachinesTranscriptPrototype({
  blocks,
  className,
  dataTestId,
  showDevSourceMarkup = false,
}: {
  blocks: readonly MachinesTranscriptPrototypeBlock[];
  className?: string;
  dataTestId?: string;
  showDevSourceMarkup?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [selectionActive, setSelectionActive] = useState(false);

  useEffect(() => {
    const handleSelectionStateChange = () => {
      const rootElement = rootRef.current;
      if (rootElement === null) {
        setSelectionActive(false);
        return;
      }

      setSelectionActive(hasActiveSelectionInsideElement(rootElement));
    };

    document.addEventListener("selectionchange", handleSelectionStateChange);
    window.addEventListener("pointerup", handleSelectionStateChange);
    window.addEventListener("keyup", handleSelectionStateChange);

    return () => {
      document.removeEventListener(
        "selectionchange",
        handleSelectionStateChange,
      );
      window.removeEventListener("pointerup", handleSelectionStateChange);
      window.removeEventListener("keyup", handleSelectionStateChange);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      data-testid={dataTestId}
      data-selection-active={selectionActive ? "true" : "false"}
      data-show-source-markup={showDevSourceMarkup ? "true" : "false"}
      className={cn("machines-transcript-prototype cm-editor", className)}
    >
      <div className="cm-scroller">
        <div
          className="cm-content cm-lineWrapping"
          role="document"
          aria-label="Machines transcript prototype"
        >
          {blocks.map((block) => (
            <TranscriptBlock
              key={block.id}
              block={block}
              showSourceMarkup={showDevSourceMarkup}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
