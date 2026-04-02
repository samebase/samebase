import { ChatInput } from "@/components/ChatInput";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import type { CodexAppServerThread } from "@/lib/codexAppServerResearch";
import {
  deriveCodexThreadTimelineEntries,
  type CodexThreadTimelineWorkEntry,
} from "@/lib/codexThreadTimeline";
import { cn } from "@/lib/utils";
import {
  Bot,
  CircleAlert,
  Eye,
  Loader2,
  Search,
  SquarePen,
  Terminal,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

type MachinesWorkspaceThreadPaneProps = {
  thread: CodexAppServerThread | null;
  selectedThreadId: string | null;
  selectedMachineDisplayName: string | null;
  selectedMachineHostname: string | null;
  selectedMachineStatusReason: string | null;
  isLoading: boolean;
  errorMessage: string | null;
  isSubmittingTurn: boolean;
  mobilePaneDragEnabled?: boolean;
  turnDraft: string;
  onTurnDraftChange: (value: string) => void;
  onTurnSubmit: () => void;
};

function readFirstNonEmptyLine(value: string): string {
  const firstLine = value
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine ?? value.trim();
}

function readThreadTitle(thread: CodexAppServerThread): string {
  const explicitName = thread.name?.trim();
  if (explicitName) {
    return explicitName;
  }

  return readFirstNonEmptyLine(thread.preview);
}

function readSelectedMachineLabel(args: {
  displayName: string | null;
  hostname: string | null;
}): string {
  return args.displayName ?? args.hostname ?? "Connected machine";
}

function workEntryIcon(entry: CodexThreadTimelineWorkEntry) {
  if (entry.tone === "error") {
    return CircleAlert;
  }

  if (entry.item.type === "commandExecution") {
    return Terminal;
  }

  if (entry.item.type === "fileChange") {
    return SquarePen;
  }

  if (entry.item.type === "fileRead" || entry.item.type === "imageView") {
    return Eye;
  }

  if (entry.item.type === "webSearch") {
    return Search;
  }

  return Wrench;
}

function workToneClassName(tone: CodexThreadTimelineWorkEntry["tone"]): string {
  if (tone === "error") {
    return "text-red-600 dark:text-red-400";
  }

  if (tone === "tool") {
    return "text-muted-foreground";
  }

  return "text-foreground/80";
}

function WorkEntryRow({ entry }: { entry: CodexThreadTimelineWorkEntry }) {
  const EntryIcon = workEntryIcon(entry);

  return (
    <div className="rounded-xl px-1 py-1">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center",
            workToneClassName(entry.tone),
          )}
        >
          <EntryIcon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate text-[11px] leading-5",
              workToneClassName(entry.tone),
            )}
            title={
              entry.preview ? `${entry.title} - ${entry.preview}` : entry.title
            }
          >
            <span className="text-foreground/85">{entry.title}</span>
            {entry.preview ? (
              <span className="text-muted-foreground"> - {entry.preview}</span>
            ) : null}
          </div>
          {entry.changedFiles.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {entry.changedFiles.slice(0, 4).map((filePath) => (
                <span
                  key={`${entry.id}-${filePath}`}
                  className="rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  title={filePath}
                >
                  {filePath}
                </span>
              ))}
              {entry.changedFiles.length > 4 ? (
                <span className="px-1 text-[10px] text-muted-foreground">
                  +{entry.changedFiles.length - 4}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ThreadMessageBody({
  className,
  mobilePaneDragEnabled,
  text,
}: {
  className?: string;
  mobilePaneDragEnabled?: boolean;
  text: string;
}) {
  return (
    <ProsemarkReadOnly
      value={text}
      className={cn("text-sm", className)}
      mobilePaneDragEnabled={mobilePaneDragEnabled}
    />
  );
}

export function MachinesWorkspaceThreadPane({
  thread,
  selectedThreadId,
  selectedMachineDisplayName,
  selectedMachineHostname,
  selectedMachineStatusReason,
  isLoading,
  errorMessage,
  isSubmittingTurn,
  mobilePaneDragEnabled = false,
  turnDraft,
  onTurnDraftChange,
  onTurnSubmit,
}: MachinesWorkspaceThreadPaneProps) {
  const timelineEntries = useMemo(
    () => (thread ? deriveCodexThreadTimelineEntries(thread) : []),
    [thread],
  );
  const timelineEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ block: "end" });
  }, [isSubmittingTurn, thread?.id, timelineEntries.length]);

  const composerDisabled =
    isSubmittingTurn || selectedMachineStatusReason !== null;
  const selectedMachineLabel = readSelectedMachineLabel({
    displayName: selectedMachineDisplayName,
    hostname: selectedMachineHostname,
  });
  const headerMeta = useMemo(() => {
    if (thread === null) {
      return null;
    }

    const parts = [thread.status.type];
    if (!thread.workspace.isProjectRoot) {
      parts.push(thread.workspace.label ?? "worktree");
    }

    return parts.join(" · ");
  }, [thread]);
  const composerPlaceholder =
    selectedMachineStatusReason !== null
      ? selectedMachineStatusReason
      : selectedThreadId
        ? "Continue this thread..."
        : "Send a prompt to start a machine-local thread...";

  let emptyStateTitle = "Select a thread";
  let emptyStateBody =
    "Choose a machine-local Codex thread from the left rail to inspect its messages and continue it here.";

  if (selectedMachineStatusReason !== null) {
    emptyStateTitle = "Machine control unavailable";
    emptyStateBody = selectedMachineStatusReason;
  } else if (selectedThreadId !== null && isLoading) {
    emptyStateTitle = "Loading thread";
    emptyStateBody = `Loading ${selectedThreadId}.`;
  } else if (selectedThreadId === null) {
    emptyStateTitle = "No thread selected";
    emptyStateBody =
      "Pick an existing thread from the sidebar or send a prompt here to start a new one on the selected machine.";
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border bg-background/95">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:py-2.5">
          <div className="flex min-w-0 flex-col gap-1 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0 truncate">{selectedMachineLabel}</div>
            {headerMeta ? (
              <div className="hidden shrink-0 sm:block">{headerMeta}</div>
            ) : null}
          </div>
          <div className="mt-1.5 break-words text-[15px] font-semibold leading-6 text-foreground sm:mt-1 sm:truncate sm:text-base">
            {thread ? readThreadTitle(thread) : emptyStateTitle}
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4">
          {thread === null ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/20 px-5 py-8">
              <div className="text-sm font-medium text-foreground">
                {emptyStateTitle}
              </div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                {emptyStateBody}
              </div>
            </div>
          ) : timelineEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/20 px-5 py-8 text-sm text-muted-foreground">
              This thread does not have any hydrated messages yet.
            </div>
          ) : (
            timelineEntries.map((entry) => {
              if (entry.kind === "message" && entry.role === "user") {
                return (
                  <div key={entry.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm border border-border bg-secondary px-4 py-3">
                      <ThreadMessageBody
                        text={entry.text}
                        mobilePaneDragEnabled={mobilePaneDragEnabled}
                      />
                    </div>
                  </div>
                );
              }

              if (entry.kind === "message") {
                return (
                  <div key={entry.id} className="min-w-0 px-1 py-0.5">
                    <ThreadMessageBody
                      text={entry.text}
                      mobilePaneDragEnabled={mobilePaneDragEnabled}
                    />
                  </div>
                );
              }

              const onlyToolEntries = entry.entries.every(
                (workEntry) => workEntry.category === "tool",
              );

              return (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-border/60 bg-card/30 px-2 py-1.5"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
                    <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                      {onlyToolEntries ? "Tool calls" : "Work log"} (
                      {entry.entries.length})
                    </p>
                    {onlyToolEntries ? (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Bot className="h-3 w-3" />
                        Machine activity
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-0.5">
                    {entry.entries.map((workEntry) => (
                      <WorkEntryRow key={workEntry.id} entry={workEntry} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
          <div ref={timelineEndRef} />
        </div>
      </div>

      <div className="border-t border-border bg-background/95">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          <ChatInput
            autoResize
            className="items-end"
            disabled={composerDisabled}
            mode="prosemark"
            onSend={onTurnSubmit}
            onValueChange={onTurnDraftChange}
            placeholder={composerPlaceholder}
            value={turnDraft}
          />
          {isSubmittingTurn ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Sending to the selected machine thread...
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
