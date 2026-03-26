import { Badge } from "@/components/badge";
import { ExpandableClampToggleButton } from "@/components/ExpandableClampText";
import { useExpandableClampText } from "@/hooks/useExpandableClampText";
import { type ThreadBrowserItem } from "@/lib/threadBrowser";
import { clsx } from "clsx";

type ThreadHistoryItemCardProps = {
  item: ThreadBrowserItem;
  defaultExpanded?: boolean;
};

export function ThreadHistoryItemCard({
  item,
  defaultExpanded = false,
}: ThreadHistoryItemCardProps) {
  const displayText = item.text;
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
