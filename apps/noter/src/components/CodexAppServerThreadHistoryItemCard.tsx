import { ThreadHistoryItemCard } from "@/components/ThreadHistoryItemCard";
import { toThreadBrowserItem } from "@/lib/codexThreadBrowserAdapter";
import { type CodexAppServerThreadItem } from "@/lib/codexAppServerResearch";

type CodexAppServerThreadHistoryItemCardProps = {
  item: CodexAppServerThreadItem;
  defaultExpanded?: boolean;
};

export function CodexAppServerThreadHistoryItemCard({
  item,
  defaultExpanded = false,
}: CodexAppServerThreadHistoryItemCardProps) {
  return (
    <ThreadHistoryItemCard
      item={toThreadBrowserItem(item)}
      defaultExpanded={defaultExpanded}
    />
  );
}
