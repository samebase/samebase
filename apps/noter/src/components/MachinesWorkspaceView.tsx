import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/collapsible";
import { SidebarProvider } from "@/components/sidebar";
import { RepositoryWorkspaceFrame } from "@/components/workspace-layout/RepositoryWorkspaceFrame";
import { WorkspaceScene } from "@/components/workspace-layout/WorkspaceScene";
import type { CodexAppServerThread } from "@/lib/codexAppServerResearch";
import {
  buildMachineThreadGroups,
  dedupeMachineThreadsById,
  type MachineThreadGroup,
} from "@/lib/machineThreadInventory";
import { cn } from "@/lib/utils";
import { ArrowUpRight, Pin } from "lucide-react";

type MachinesWorkspaceViewProps = {
  threads: CodexAppServerThread[];
  pinnedThreadIds: string[];
  selectedThreadId: string | null;
  relativeTimeReferenceMs?: number;
  dataTestId?: string;
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

function readProjectLabel(group: MachineThreadGroup): string {
  const explicitLabel = group.label.trim();
  if (explicitLabel.length > 0) {
    return explicitLabel;
  }

  const pathParts = group.detail.split("/").filter((part) => part.length > 0);
  return pathParts.at(-1) ?? group.detail;
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

function ThreadRow(props: {
  thread: CodexAppServerThread;
  isSelected: boolean;
  relativeTimeReferenceMs?: number;
  leadingIcon?: ReactNode;
  className?: string;
  onSelect?: (threadId: string) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-10 w-full items-center gap-3 px-3 text-left text-sm transition-colors",
        props.isSelected
          ? "bg-accent text-foreground"
          : "bg-background text-foreground hover:bg-accent/60",
        props.className,
      )}
      onClick={() => {
        props.onSelect?.(props.thread.id);
      }}
    >
      {props.leadingIcon ? (
        <div className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
          {props.leadingIcon}
        </div>
      ) : null}
      <div
        className="min-w-0 flex-1 truncate text-[15px] font-medium leading-5"
        title={readThreadTitle(props.thread)}
      >
        {readThreadTitle(props.thread)}
      </div>
      <div className="flex shrink-0 items-center gap-2 text-[12px] tabular-nums text-muted-foreground">
        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span>
          {formatRelativeTime(
            props.thread.updatedAt,
            props.relativeTimeReferenceMs,
          )}
        </span>
      </div>
    </button>
  );
}

function ProjectSection(props: {
  group: MachineThreadGroup;
  isOpen: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Collapsible open={props.isOpen} onOpenChange={props.onOpenChange}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex min-h-[32px] w-full items-center gap-2 px-3 py-1 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/60"
          title={props.group.detail}
        >
          {props.isOpen ? (
            <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="flex h-4 w-4 shrink-0 items-center justify-center">
            <div className="h-2.5 w-2.5 bg-muted-foreground/30 corner-notch-1" />
          </div>
          <span className="truncate text-[13px] font-medium leading-5 text-muted-foreground">
            {readProjectLabel(props.group)}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-1 py-1">{props.children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * The first implementation pass intentionally ships only the thread rail. The
 * shared workspace shell stays in place so the default sidebar controls remain
 * available while the main pane is reset to an empty canvas for later work.
 */
export function MachinesWorkspaceView(props: MachinesWorkspaceViewProps) {
  const uniqueThreads = useMemo(
    () => dedupeMachineThreadsById(props.threads),
    [props.threads],
  );
  const pinnedThreadIdSet = useMemo(
    () => new Set(props.pinnedThreadIds),
    [props.pinnedThreadIds],
  );
  const pinnedThreads = useMemo(
    () => uniqueThreads.filter((thread) => pinnedThreadIdSet.has(thread.id)),
    [pinnedThreadIdSet, uniqueThreads],
  );
  const projectGroups = useMemo(
    () =>
      buildMachineThreadGroups({
        threads: uniqueThreads.filter(
          (thread) => !pinnedThreadIdSet.has(thread.id),
        ),
      }),
    [pinnedThreadIdSet, uniqueThreads],
  );
  const selectedThread = useMemo(
    () =>
      props.selectedThreadId
        ? uniqueThreads.find(
            (thread) => thread.id === props.selectedThreadId,
          ) ?? null
        : null,
    [props.selectedThreadId, uniqueThreads],
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
    selectedThread && !pinnedThreadIdSet.has(selectedThread.id)
      ? selectedThread.project.id
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
            className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background px-2 py-2"
          >
            <div className="grid gap-2">
              {pinnedThreads.length > 0 ? (
                <div className="grid gap-1">
                  {pinnedThreads.map((thread) => (
                    <ThreadRow
                      key={thread.id}
                      thread={thread}
                      isSelected={thread.id === props.selectedThreadId}
                      relativeTimeReferenceMs={props.relativeTimeReferenceMs}
                      leadingIcon={
                        <Pin
                          className="h-3.5 w-3.5 rotate-45"
                          strokeWidth={1.75}
                        />
                      }
                      onSelect={props.onThreadSelect}
                    />
                  ))}
                </div>
              ) : null}

              <div className="grid gap-1">
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
                        thread={thread}
                        isSelected={thread.id === props.selectedThreadId}
                        relativeTimeReferenceMs={props.relativeTimeReferenceMs}
                        className="pl-10"
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
          workspaceScrollClassName="bg-background"
          workspaceBody={<div className="min-h-full bg-background" />}
        />
      </RepositoryWorkspaceFrame>
    </SidebarProvider>
  );
}
