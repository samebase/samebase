import { Badge } from "@/components/badge";
import { Button } from "@/components/ui/button";
import { type CodexAppServerThreadItem } from "@/lib/codexAppServerResearch";
import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CodexAppServerThreadHistoryItemCardProps = {
  item: CodexAppServerThreadItem;
  defaultExpanded?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readThreadItemDisplayText(
  item: CodexAppServerThreadItem,
): string | null {
  const rawItem = asRecord(item.raw);
  const rawText = readString(rawItem?.text);
  if (rawText) {
    return rawText;
  }

  const content = rawItem?.content;
  if (!Array.isArray(content)) {
    return item.summary;
  }

  const textParts = content
    .map((entry) => readString(asRecord(entry)?.text))
    .filter((text): text is string => text !== null && text.length > 0);

  if (textParts.length === 0) {
    return item.summary;
  }

  return textParts.join("\n");
}

function textLikelyNeedsExpansion(text: string): boolean {
  return (
    text.includes("\n") ||
    text.includes("…") ||
    text.includes("...") ||
    text.length > 120
  );
}

/**
 * Keep turn history dense for scanning, but let reviewers expand the opaque
 * provider text in place when they need the full payload wording.
 */
export function CodexAppServerThreadHistoryItemCard({
  item,
  defaultExpanded = false,
}: CodexAppServerThreadHistoryItemCardProps) {
  const displayText = readThreadItemDisplayText(item);
  const summaryPreviewRef = useRef<HTMLDivElement | null>(null);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isExpandable, setIsExpandable] = useState(
    displayText ? textLikelyNeedsExpansion(displayText) : false,
  );

  useEffect(() => {
    if (!displayText) {
      setIsExpandable(false);
      return;
    }

    const fallbackExpandable =
      textLikelyNeedsExpansion(displayText) ||
      (item.summary?.includes("…") ?? false);
    const summaryPreviewNode = summaryPreviewRef.current;
    if (!summaryPreviewNode) {
      setIsExpandable(fallbackExpandable);
      return;
    }

    const updateIsExpandable = () => {
      setIsExpandable(
        fallbackExpandable ||
          summaryPreviewNode.scrollHeight - summaryPreviewNode.clientHeight >
            1 ||
          summaryPreviewNode.scrollWidth - summaryPreviewNode.clientWidth > 1,
      );
    };

    // Clamp detection keeps the extra trigger out of short items without
    // baking layout-specific length guesses into the provider summary model.
    updateIsExpandable();

    if (typeof ResizeObserver !== "function") {
      window.addEventListener("resize", updateIsExpandable);
      return () => {
        window.removeEventListener("resize", updateIsExpandable);
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      updateIsExpandable();
    });
    resizeObserver.observe(summaryPreviewNode);

    return () => {
      resizeObserver.disconnect();
    };
  }, [displayText, item.summary]);

  return (
    <div className="grid gap-2 border border-border bg-white px-3 py-2">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-mono text-xs">{item.type}</div>
          {item.id ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              {item.id}
            </Badge>
          ) : null}
        </div>

        {isExpandable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-expanded={isExpanded}
            aria-label={
              isExpanded ? "Collapse full message" : "Expand full message"
            }
            className="ml-auto h-6 w-6 shrink-0 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={() => {
              setIsExpanded((current) => !current);
            }}
          >
            <ChevronDown
              className={clsx(
                "h-3.5 w-3.5 transition-transform",
                isExpanded ? "rotate-180" : "",
              )}
            />
          </Button>
        ) : null}
      </div>

      {displayText ? (
        <div
          ref={summaryPreviewRef}
          className={clsx(
            "whitespace-pre-wrap break-words text-sm leading-6 text-slate-700",
            isExpanded ? "" : "line-clamp-2",
          )}
        >
          {displayText}
        </div>
      ) : null}
    </div>
  );
}
