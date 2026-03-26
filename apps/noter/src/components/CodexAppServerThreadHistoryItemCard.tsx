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

/**
 * Keep turn history dense for scanning, but let reviewers expand the opaque
 * provider text in place when they need the full payload wording.
 */
export function CodexAppServerThreadHistoryItemCard({
  item,
  defaultExpanded = false,
}: CodexAppServerThreadHistoryItemCardProps) {
  const displayText = readThreadItemDisplayText(item);
  const textMeasurementRef = useRef<HTMLDivElement | null>(null);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isExpandable, setIsExpandable] = useState(false);

  useEffect(() => {
    if (!displayText) {
      setIsExpandable(false);
      return;
    }

    const measurementNode = textMeasurementRef.current;
    if (!measurementNode) {
      setIsExpandable(false);
      return;
    }

    const updateIsExpandable = () => {
      const measuredHeight = measurementNode.getBoundingClientRect().height;
      const lineHeight = Number.parseFloat(
        window.getComputedStyle(measurementNode).lineHeight,
      );

      if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        setIsExpandable(false);
        return;
      }

      setIsExpandable(measuredHeight > lineHeight * 2 + 1);
    };

    // Measure the unclamped rendered height against two line-heights so the
    // chevron only appears when the collapsed view actually hides text.
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
    resizeObserver.observe(measurementNode);

    return () => {
      resizeObserver.disconnect();
    };
  }, [displayText]);

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
        <div className="relative">
          <div
            ref={textMeasurementRef}
            aria-hidden="true"
            className="pointer-events-none invisible absolute inset-x-0 top-0 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700"
          >
            {displayText}
          </div>
          <div
            className={clsx(
              "whitespace-pre-wrap break-words text-sm leading-6 text-slate-700",
              isExpanded ? "" : "line-clamp-2",
            )}
          >
            {displayText}
          </div>
        </div>
      ) : null}
    </div>
  );
}
