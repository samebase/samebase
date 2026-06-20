import { ChatInput } from "@/components/ChatInput";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import type { CodexAppServerThread } from "@/codex/appServerResearch";
import {
  readMachinesWorkspaceConversationStartCopy,
  type MachinesWorkspaceConversationEnvMode,
} from "@/lib/machinesWorkspaceConversation";
import {
  deriveCodexThreadTimelineEntries,
  type CodexThreadTimelineWorkEntry,
} from "@/codex/threadTimeline";
import { cn } from "@/lib/utils";
import { Bot, CircleAlert, Eye, Loader2, Search, SquarePen, Terminal, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

type MachinesWorkspaceThreadPaneProps = {
  thread: CodexAppServerThread | null;
  selectedThreadId: string | null;
  pendingConversation: {
    envMode: MachinesWorkspaceConversationEnvMode;
    projectLabel: string;
  } | null;
  selectedMachineStatusReason: string | null;
  hasPendingStartedThread: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  isSubmittingTurn: boolean;
  turnDraft: string;
  onTurnDraftChange: (value: string) => void;
  onTurnSubmit: () => void;
};

function deriveMachinesWorkspaceThreadEmptyState(args: {
  selectedThreadId: string | null;
  pendingConversation: {
    envMode: MachinesWorkspaceConversationEnvMode;
    projectLabel: string;
  } | null;
  selectedMachineStatusReason: string | null;
  hasPendingStartedThread: boolean;
  isLoading: boolean;
}) {
  let title = "Select a thread";
  let body =
    "Choose a machine-local Codex thread from the left rail to inspect its messages and continue it here.";

  if (args.selectedMachineStatusReason !== null) {
    title = "Machine control unavailable";
    body = args.selectedMachineStatusReason;
  } else if (args.pendingConversation !== null) {
    title = "New conversation";
    body = readMachinesWorkspaceConversationStartCopy({
      envMode: args.pendingConversation.envMode,
      projectLabel: args.pendingConversation.projectLabel,
    });
  } else if (args.selectedThreadId !== null && args.hasPendingStartedThread) {
    title = "New conversation";
    body =
      "Waiting for the new conversation to hydrate. Its first message will appear here once the machine inventory refreshes.";
  } else if (args.selectedThreadId !== null && args.isLoading) {
    title = "Loading thread";
    body = `Loading ${args.selectedThreadId}.`;
  } else if (args.selectedThreadId === null) {
    title = "No thread selected";
    body =
      "Pick an existing thread from the sidebar or send a prompt here to start a new one on the selected machine.";
  }

  return { body, title };
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
            className={cn("truncate text-[11px] leading-5", workToneClassName(entry.tone))}
            title={entry.preview ? `${entry.title} - ${entry.preview}` : entry.title}
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

function ThreadMessageBody({ className, text }: { className?: string; text: string }) {
  return <ProsemarkReadOnly value={text} className={cn("text-sm", className)} />;
}

export function MachinesWorkspaceThreadPane({
  thread,
  selectedThreadId,
  pendingConversation,
  selectedMachineStatusReason,
  hasPendingStartedThread,
  isLoading,
  errorMessage,
  isSubmittingTurn,
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

  const composerDisabled = isSubmittingTurn || selectedMachineStatusReason !== null;
  const composerPlaceholder =
    selectedMachineStatusReason !== null
      ? selectedMachineStatusReason
      : pendingConversation !== null
        ? readMachinesWorkspaceConversationStartCopy({
            envMode: pendingConversation.envMode,
            projectLabel: pendingConversation.projectLabel,
          })
        : hasPendingStartedThread
          ? "Waiting for the new conversation to hydrate..."
          : selectedThreadId
            ? "Continue this thread..."
            : "Pick a thread or use a project's plus button to start a new conversation.";
  const { body: emptyStateBody, title: emptyStateTitle } = deriveMachinesWorkspaceThreadEmptyState({
    hasPendingStartedThread,
    isLoading,
    pendingConversation,
    selectedMachineStatusReason,
    selectedThreadId,
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {errorMessage ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4">
          {thread === null ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/20 px-5 py-8">
              <div className="text-sm font-medium text-foreground">{emptyStateTitle}</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">{emptyStateBody}</div>
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
                      <ThreadMessageBody text={entry.text} />
                    </div>
                  </div>
                );
              }

              if (entry.kind === "message") {
                return (
                  <div key={entry.id} className="min-w-0 px-1 py-0.5">
                    <ThreadMessageBody text={entry.text} />
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
                      {onlyToolEntries ? "Tool calls" : "Work log"} ({entry.entries.length})
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
