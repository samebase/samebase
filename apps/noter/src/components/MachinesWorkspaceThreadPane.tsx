import { ChatInput } from "@/components/ChatInput";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import type { CodexAppServerThread } from "@/lib/codexAppServerResearch";
import {
  readMachinesWorkspaceConversationEnvLabel,
  readMachinesWorkspaceConversationStartCopy,
  type MachinesWorkspaceConversationEnvMode,
} from "@/lib/machinesWorkspaceConversation";
import { deriveCodexThreadTimelineEntries } from "@/lib/codexThreadTimeline";
import { serializeCodexThreadTranscriptMarkdown } from "@/lib/codexThreadTranscriptMarkdown";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

type MachinesWorkspaceThreadPaneProps = {
  thread: CodexAppServerThread | null;
  selectedThreadId: string | null;
  pendingConversation: {
    envMode: MachinesWorkspaceConversationEnvMode;
    projectLabel: string;
  } | null;
  selectedMachineDisplayName: string | null;
  selectedMachineHostname: string | null;
  selectedMachineStatusReason: string | null;
  hasPendingStartedThread: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  isSubmittingTurn: boolean;
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

export function MachinesWorkspaceThreadPane({
  thread,
  selectedThreadId,
  pendingConversation,
  selectedMachineDisplayName,
  selectedMachineHostname,
  selectedMachineStatusReason,
  hasPendingStartedThread,
  isLoading,
  errorMessage,
  isSubmittingTurn,
  turnDraft,
  onTurnDraftChange,
  onTurnSubmit,
}: MachinesWorkspaceThreadPaneProps) {
  const { timelineEntries, transcriptMarkdown } = useMemo(() => {
    if (thread === null) {
      return {
        timelineEntries: [],
        transcriptMarkdown: "",
      };
    }

    const entries = deriveCodexThreadTimelineEntries(thread);

    return {
      timelineEntries: entries,
      transcriptMarkdown: serializeCodexThreadTranscriptMarkdown(thread, {
        entries,
      }),
    };
  }, [thread]);
  const timelineEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ block: "end" });
  }, [isSubmittingTurn, thread?.id, transcriptMarkdown]);

  const composerDisabled =
    isSubmittingTurn || selectedMachineStatusReason !== null;
  const selectedMachineLabel = readSelectedMachineLabel({
    displayName: selectedMachineDisplayName,
    hostname: selectedMachineHostname,
  });
  const headerMeta = useMemo(() => {
    if (thread === null) {
      if (pendingConversation === null) {
        return null;
      }

      return `${pendingConversation.projectLabel} · ${readMachinesWorkspaceConversationEnvLabel(pendingConversation.envMode)}`;
    }

    const parts = [thread.status.type];
    if (!thread.workspace.isProjectRoot) {
      parts.push(thread.workspace.label ?? "worktree");
    }

    return parts.join(" · ");
  }, [pendingConversation, thread]);
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

  let emptyStateTitle = "Select a thread";
  let emptyStateBody =
    "Choose a machine-local Codex thread from the left rail to inspect its messages and continue it here.";

  if (selectedMachineStatusReason !== null) {
    emptyStateTitle = "Machine control unavailable";
    emptyStateBody = selectedMachineStatusReason;
  } else if (pendingConversation !== null) {
    emptyStateTitle = "New conversation";
    emptyStateBody = readMachinesWorkspaceConversationStartCopy({
      envMode: pendingConversation.envMode,
      projectLabel: pendingConversation.projectLabel,
    });
  } else if (selectedThreadId !== null && hasPendingStartedThread) {
    emptyStateTitle = "New conversation";
    emptyStateBody =
      "Waiting for the new conversation to hydrate. Its first message will appear here once the machine inventory refreshes.";
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
            <div
              data-testid="machines-workspace-thread-transcript"
              className="select-text rounded-2xl border border-border/60 bg-card/30 px-4 py-3"
            >
              <ProsemarkReadOnly
                value={transcriptMarkdown}
                className="text-sm"
                filePath="machines-transcript.md"
              />
            </div>
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
