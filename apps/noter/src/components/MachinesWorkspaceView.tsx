import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/collapsible";
import { SidebarProvider } from "@/components/sidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { RepositoryWorkspaceFrame } from "@/components/workspace-layout/RepositoryWorkspaceFrame";
import { WorkspaceScene } from "@/components/workspace-layout/WorkspaceScene";
import {
  type CodexThreadSidebarProject,
  type CodexThreadSidebarThread,
} from "@/lib/codexThreadSidebar";
import { cn } from "@/lib/utils";
import { useCodexThreadSidebarViewModel } from "@/hooks/useCodexThreadSidebarViewModel";
import type { CodexAppServerThread } from "@/lib/codexAppServerResearch";
import { MachinesWorkspaceThreadPane } from "@/components/MachinesWorkspaceThreadPane";
import { ArrowUpRight, GitBranch, Loader2, Pin } from "lucide-react";

type MachinesWorkspaceViewProps = {
  threads: CodexAppServerThread[];
  pinnedThreadIds: string[];
  selectedThreadId: string | null;
  selectedThread: CodexAppServerThread | null;
  selectedMachineDisplayName: string | null;
  selectedMachineHostname: string | null;
  selectedMachineStatusReason: string | null;
  selectedThreadError: string | null;
  selectedThreadLoading: boolean;
  isSubmittingTurn: boolean;
  turnDraft: string;
  pendingPinThreadId: string | null;
  relativeTimeReferenceMs?: number;
  dataTestId?: string;
  onTurnDraftChange: (value: string) => void;
  onTurnSubmit: () => void;
  onThreadPinChange?: (threadId: string, nextPinned: boolean) => void;
  onThreadSelect?: (threadId: string) => void;
};

function normalizeTimestampToMilliseconds(value: number): number {
  return value < 10_000_000_000 ? value * 1000 : value;
}

function formatRelativeTime(
  value: number,
  referenceTimeMs: number = Date.now(),
): string {
  const diffMs = Math.max(
    0,
    referenceTimeMs - normalizeTimestampToMilliseconds(value),
  );
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < hourMs) {
    return `${Math.max(1, Math.floor(diffMs / minuteMs))}m`;
  }

  if (diffMs < dayMs) {
    return `${Math.floor(diffMs / hourMs)}h`;
  }

  return `${Math.floor(diffMs / dayMs)}d`;
}

function setsAreEqual<T>(left: Set<T>, right: Set<T>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

const MIN_LEFT_SIDEBAR_WIDTH_FOR_THREAD_META_PX = 176;

function ThreadPinActionButton(props: {
  isPinned: boolean;
  isVisible: boolean;
  isPending: boolean;
  disabled: boolean;
  onClick?: () => void;
}) {
  const label = props.isPinned ? "Unpin thread" : "Pin thread";

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={props.isPinned}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-sm transition-[opacity,color,background-color]",
        props.isPinned
          ? "bg-accent/60 text-foreground hover:bg-accent"
          : "bg-transparent text-muted-foreground hover:bg-accent/80 hover:text-foreground",
        props.isVisible
          ? "opacity-100"
          : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
        props.disabled ? "cursor-wait" : null,
      )}
      disabled={props.disabled}
      title={label}
      onClick={() => {
        props.onClick?.();
      }}
    >
      {props.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
      ) : (
        <Pin className="h-3.5 w-3.5 rotate-45" strokeWidth={1.75} />
      )}
    </button>
  );
}

/**
 * Let thread and project names grow with the live sidebar width while still
 * capping them at three lines so the rail stays compact when labels are long.
 */
function ThreadRow(props: {
  item: CodexThreadSidebarThread;
  isSelected: boolean;
  pinActionPendingThreadId: string | null;
  relativeTimeReferenceMs?: number;
  className?: string;
  onPinChange?: (threadId: string, nextPinned: boolean) => void;
  onSelect?: (threadId: string) => void;
}) {
  const { isMobile, leftDesktopWidthPx, leftMobileWidthPx } = useSidebar();
  const leftSidebarWidthPx = isMobile ? leftMobileWidthPx : leftDesktopWidthPx;
  // Once the rail gets very narrow, the fixed timestamp chrome can starve the
  // flex title column down to zero width, which makes line-clamp appear stuck.
  const showTrailingMeta =
    leftSidebarWidthPx >= MIN_LEFT_SIDEBAR_WIDTH_FOR_THREAD_META_PX;
  const pinActionAlwaysVisible = props.item.isPinned;
  const pinActionVisibleBecauseSelected = isMobile && props.isSelected;
  const pinActionVisible =
    pinActionAlwaysVisible || pinActionVisibleBecauseSelected;
  const pinActionIsPending = props.pinActionPendingThreadId === props.item.id;
  const pinActionDisabled = pinActionIsPending;

  return (
    <div
      className={cn(
        "group flex min-h-10 w-full items-start gap-0 text-sm transition-colors",
        props.isSelected
          ? "bg-accent text-foreground"
          : "bg-background text-foreground hover:bg-accent/60 focus-within:bg-accent/60",
        props.className,
      )}
    >
      {props.onPinChange ? (
        <div className="flex shrink-0 items-start pl-2.5 pr-0.5 pt-2">
          <ThreadPinActionButton
            isPinned={props.item.isPinned}
            isVisible={pinActionVisible}
            isPending={pinActionIsPending}
            disabled={pinActionDisabled}
            onClick={() => {
              props.onPinChange?.(props.item.id, !props.item.isPinned);
            }}
          />
        </div>
      ) : null}
      <button
        type="button"
        className={cn(
          "flex min-w-0 flex-1 items-start gap-2 py-2 pr-3 text-left",
          props.onPinChange ? null : "px-3",
        )}
        onClick={() => {
          props.onSelect?.(props.item.id);
        }}
      >
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          {props.item.showWorkspaceIndicator ? (
            <div
              className="flex h-3.5 w-3.5 shrink-0 items-center justify-center pt-0.5 text-muted-foreground"
              title={props.item.workspaceTooltip ?? undefined}
            >
              <GitBranch className="h-3 w-3" strokeWidth={1.75} />
            </div>
          ) : null}
          <div
            className="min-w-0 flex-auto line-clamp-3 [overflow-wrap:anywhere] text-[15px] font-medium leading-5"
            title={props.item.workspaceTooltip ?? props.item.title}
          >
            {props.item.title}
          </div>
        </div>
        {showTrailingMeta ? (
          <div className="flex shrink-0 items-center gap-1 pt-0.5 text-[12px] tabular-nums text-muted-foreground">
            <ArrowUpRight className="h-3 w-3" strokeWidth={1.75} />
            <span>
              {formatRelativeTime(
                props.item.thread.updatedAt,
                props.relativeTimeReferenceMs,
              )}
            </span>
          </div>
        ) : null}
      </button>
    </div>
  );
}

function ProjectSection(props: {
  group: CodexThreadSidebarProject;
  isOpen: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Collapsible open={props.isOpen} onOpenChange={props.onOpenChange}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex min-h-[32px] w-full items-start gap-1.5 px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/60"
          title={props.group.detail}
        >
          {props.isOpen ? (
            <ChevronDownIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center pt-0.5">
            <div className="h-2 w-2 bg-muted-foreground/30 corner-notch-1" />
          </div>
          <span className="line-clamp-3 [overflow-wrap:anywhere] text-[13px] font-medium leading-5 text-muted-foreground">
            {props.group.label}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid min-w-0 gap-1 py-1">{props.children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Keep the sidebar grouping rules from PR #403, but let the shared workspace
 * shell host a real selected-thread pane instead of an empty canvas.
 */
export function MachinesWorkspaceView(props: MachinesWorkspaceViewProps) {
  const sidebarViewModel = useCodexThreadSidebarViewModel({
    pinnedThreadIds: props.pinnedThreadIds,
    threads: props.threads,
  });
  const pinnedThreads = sidebarViewModel.pinnedThreads;
  const projectGroups = sidebarViewModel.projects;
  const selectedThreadSummary = useMemo(
    () =>
      props.selectedThreadId
        ? sidebarViewModel.uniqueThreads.find(
            (thread) => thread.id === props.selectedThreadId,
          ) ?? null
        : null,
    [props.selectedThreadId, sidebarViewModel.uniqueThreads],
  );
  const projectIds = useMemo(
    () => projectGroups.map((group) => group.id),
    [projectGroups],
  );
  const projectIdsSignature = useMemo(
    () => projectIds.join("\u0000"),
    [projectIds],
  );
  const stableProjectIds = useMemo(
    () =>
      projectIdsSignature.length > 0 ? projectIdsSignature.split("\u0000") : [],
    [projectIdsSignature],
  );
  const validProjectIds = useMemo(
    () => new Set(stableProjectIds),
    [stableProjectIds],
  );
  const firstProjectId = stableProjectIds[0] ?? null;
  const selectedProjectId =
    selectedThreadSummary &&
    !pinnedThreads.some((thread) => thread.id === selectedThreadSummary.id)
      ? selectedThreadSummary.project.id
      : null;
  const [openProjectIds, setOpenProjectIds] = useState<Set<string>>(
    () => new Set(),
  );
  const sidebarTestId = props.dataTestId
    ? `${props.dataTestId}-sidebar`
    : undefined;
  const headerTestId = props.dataTestId
    ? `${props.dataTestId}-header`
    : undefined;

  useEffect(() => {
    setOpenProjectIds((current) => {
      const next = new Set<string>();
      for (const projectId of current) {
        if (validProjectIds.has(projectId)) {
          next.add(projectId);
        }
      }

      if (selectedProjectId && validProjectIds.has(selectedProjectId)) {
        next.add(selectedProjectId);
      }

      if (next.size === 0 && firstProjectId) {
        next.add(firstProjectId);
      }

      return setsAreEqual(current, next) ? current : next;
    });
  }, [firstProjectId, projectIdsSignature, selectedProjectId, validProjectIds]);

  return (
    <SidebarProvider
      className="h-full min-h-0"
      defaultOpen={true}
      defaultLeftDesktopWidthPx={288}
      defaultLeftMobileWidthPx={288}
    >
      <RepositoryWorkspaceFrame
        dataTestId={props.dataTestId}
        headerTestId={headerTestId}
        contentClassName="min-h-0 flex-1 p-0"
        leftSidebarHeader={null}
        leftSidebarContent={
          <div
            data-testid={sidebarTestId}
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-background px-2 py-2"
          >
            <div className="grid min-w-0 gap-2">
              {pinnedThreads.length > 0 ? (
                <div className="grid min-w-0 gap-1">
                  {pinnedThreads.map((thread) => (
                    <ThreadRow
                      key={thread.id}
                      item={thread}
                      isSelected={thread.id === props.selectedThreadId}
                      pinActionPendingThreadId={props.pendingPinThreadId}
                      relativeTimeReferenceMs={props.relativeTimeReferenceMs}
                      onPinChange={props.onThreadPinChange}
                      onSelect={props.onThreadSelect}
                    />
                  ))}
                </div>
              ) : null}

              <div className="grid min-w-0 gap-1">
                {projectGroups.map((group) => (
                  <ProjectSection
                    key={group.id}
                    group={group}
                    isOpen={openProjectIds.has(group.id)}
                    onOpenChange={(nextOpen) => {
                      setOpenProjectIds((current) => {
                        const next = new Set(current);
                        if (nextOpen) {
                          next.add(group.id);
                        } else {
                          next.delete(group.id);
                        }
                        return next;
                      });
                    }}
                  >
                    {group.threads.map((thread) => (
                      <ThreadRow
                        key={thread.id}
                        item={thread}
                        isSelected={thread.id === props.selectedThreadId}
                        pinActionPendingThreadId={props.pendingPinThreadId}
                        relativeTimeReferenceMs={props.relativeTimeReferenceMs}
                        className="pl-10"
                        onPinChange={props.onThreadPinChange}
                        onSelect={props.onThreadSelect}
                      />
                    ))}
                  </ProjectSection>
                ))}
              </div>
            </div>
          </div>
        }
        rightSidebarHeader={null}
        rightSidebarContent={null}
      >
        <WorkspaceScene
          workspacePaneClassName="bg-background"
          workspaceScrollClassName="overflow-hidden bg-background"
          workspaceBody={
            <MachinesWorkspaceThreadPane
              errorMessage={props.selectedThreadError}
              isLoading={props.selectedThreadLoading}
              isSubmittingTurn={props.isSubmittingTurn}
              onTurnDraftChange={props.onTurnDraftChange}
              onTurnSubmit={props.onTurnSubmit}
              selectedMachineDisplayName={props.selectedMachineDisplayName}
              selectedMachineHostname={props.selectedMachineHostname}
              selectedMachineStatusReason={props.selectedMachineStatusReason}
              selectedThreadId={props.selectedThreadId}
              thread={props.selectedThread}
              turnDraft={props.turnDraft}
            />
          }
        />
      </RepositoryWorkspaceFrame>
    </SidebarProvider>
  );
}
