import { Badge } from "#src/components/ui/badge.tsx";
import { ExpandableClampToggleButton } from "#src/components/ExpandableClampText.tsx";
import { useExpandableClampText } from "#src/hooks/useExpandableClampText.ts";
import { type CodexAppServerThreadItem } from "#src/lib/codexAppServerResearch.ts";
import { clsx } from "clsx";

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

export function CodexAppServerThreadHistoryItemCard({
  item,
  defaultExpanded = false,
}: CodexAppServerThreadHistoryItemCardProps) {
  const displayText = readThreadItemDisplayText(item);
  const { isExpandable, isExpanded, measurementRef, toggleExpanded } =
    useExpandableClampText({
      text: displayText,
      defaultExpanded,
    });

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
          <div className="ml-auto">
            <ExpandableClampToggleButton
              isExpanded={isExpanded}
              onClick={() => {
                toggleExpanded();
              }}
            />
          </div>
        ) : null}
      </div>

      {displayText ? (
        <div className="relative">
          <div
            ref={measurementRef}
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
