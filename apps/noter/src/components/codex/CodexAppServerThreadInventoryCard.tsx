import { ExpandableClampToggleButton } from "@/components/ExpandableClampText";
import { useExpandableClampText } from "@/hooks/useExpandableClampText";
import { type CodexAppServerThread } from "@/codex/appServerResearch";
import { clsx } from "clsx";
import { type KeyboardEvent, type ReactNode } from "react";

type CodexAppServerThreadInventoryCardProps = {
  thread: CodexAppServerThread;
  isSelected: boolean;
  onSelectThread?: (threadId: string) => void;
  statusBadge: ReactNode;
  updatedAtLabel: string;
};

/**
 * Treat Enter and Space as card activation keys so the selectable thread card
 * behaves like a native button without scrolling the page on Space.
 *
 * @param event Keyboard interaction fired on the card container.
 * @param onSelect Selection callback for the owning thread row.
 */
function handleSelectableCardKeyDown(event: KeyboardEvent<HTMLDivElement>, onSelect: () => void) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  onSelect();
}

/**
 * Nested controls inside the selectable card should keep their own keyboard
 * behavior without bubbling activation keys up to the parent card handler.
 *
 * @param event Keyboard interaction fired on the nested toggle button.
 */
function handleNestedToggleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.stopPropagation();
}

/**
 * Render a selectable thread inventory row whose outer card owns selection
 * while the preview clamp toggle stays local to the preview text itself.
 */
export function CodexAppServerThreadInventoryCard(props: CodexAppServerThreadInventoryCardProps) {
  const { isExpandable, isExpanded, measurementRef, toggleExpanded } = useExpandableClampText({
    text: props.thread.preview,
  });

  const handleSelect = () => {
    props.onSelectThread?.(props.thread.id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={props.isSelected}
      className={clsx(
        "grid cursor-pointer gap-2 border px-3 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2",
        props.isSelected
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-border bg-slate-50 text-slate-900 hover:bg-slate-100",
      )}
      onClick={handleSelect}
      onKeyDown={(event) => {
        handleSelectableCardKeyDown(event, handleSelect);
      }}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="relative min-w-0 flex-1">
          <div
            ref={measurementRef}
            aria-hidden="true"
            className="pointer-events-none invisible absolute inset-x-0 top-0 whitespace-pre-wrap break-words text-sm font-medium leading-6"
          >
            {props.thread.preview}
          </div>
          <div
            className={clsx(
              "whitespace-pre-wrap break-words text-sm font-medium leading-6",
              isExpanded ? "" : "line-clamp-2",
            )}
          >
            {props.thread.preview}
          </div>
        </div>
        <div className="ml-auto flex items-start gap-2">
          {isExpandable ? (
            <ExpandableClampToggleButton
              isExpanded={isExpanded}
              onClick={(event) => {
                event.stopPropagation();
                toggleExpanded();
              }}
              onKeyDown={handleNestedToggleKeyDown}
            />
          ) : null}
          {props.statusBadge}
        </div>
      </div>
      <div className="font-mono text-[11px] opacity-80">{props.thread.id}</div>
      <div className="text-xs opacity-80">
        {props.thread.cwd}
        <span className="mx-2">·</span>
        {props.updatedAtLabel}
      </div>
    </div>
  );
}
