import { ChevronDownIcon, ChevronRightIcon } from "@/lib/radixIcons";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/collapsible";
import { useSidebar } from "@/hooks/use-sidebar";
import { WorkspaceLayoutV2FullPage } from "@/components/workspace-layout-v2/WorkspaceLayoutV2";
import {
  type CodexThreadSidebarProject,
  type CodexThreadSidebarThread,
} from "@/lib/codexThreadSidebar";
import {
  readMachinesWorkspaceConversationEnvLabel,
  type MachinesWorkspaceConversationEnvMode,
  type MachinesWorkspaceProjectConversationSelection,
} from "@/lib/machinesWorkspaceConversation";
import {
  buildMachinesWorkspaceSidebarSections,
  type MachinesWorkspaceSidebarInventory,
  type MachinesWorkspaceSidebarSection,
} from "@/lib/machinesWorkspaceSidebar";
import type { CodexAppServerThread } from "@/lib/codexAppServerResearch";
import { cn } from "@/lib/utils";
import {
  MachinesWorkspaceThreadHeader,
  MachinesWorkspaceThreadPane,
} from "@/components/MachinesWorkspaceThreadPane";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import {
  ArrowUpRight,
  Folder,
  GitBranch,
  GitFork,
  Loader2,
  Pin,
  Plus,
} from "lucide-react";

type MachinesWorkspaceViewProps = {
  machineInventories: MachinesWorkspaceSidebarInventory[];
  leftSidebarHeader?: ReactNode;
  selectedMachineId: string | null;
  selectedThreadId: string | null;
  selectedThread: CodexAppServerThread | null;
  pendingConversation: MachinesWorkspaceProjectConversationSelection | null;
  selectedMachineDisplayName: string | null;
  selectedMachineHostname: string | null;
  selectedMachineStatusReason: string | null;
  hasPendingStartedThread: boolean;
  selectedThreadError: string | null;
  selectedThreadLoading: boolean;
  isSubmittingTurn: boolean;
  turnDraft: string;
  pendingPinThreadKey: string | null;
  relativeTimeReferenceMs?: number;
  dataTestId?: string;
  onTurnDraftChange: (value: string) => void;
  onTurnSubmit: () => void;
  onThreadPinChange?: (selection: {
    machineId: string;
    nextPinned: boolean;
    threadId: string;
  }) => void;
  onProjectStartConversation?: (
    selection: MachinesWorkspaceProjectConversationSelection,
  ) => void;
  onThreadSelect?: (selection: { machineId: string; threadId: string }) => void;
};

/** Normalize mixed second- and millisecond-based timestamps from Codex APIs. */
function normalizeTimestampToMilliseconds(value: number): number {
  return value < 10_000_000_000 ? value * 1000 : value;
}

/** Render the compact sidebar age badges used beside each thread row. */
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

/** Avoid replacing accordion state when the machine/project membership is stable. */
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
// Export the shared default width so the parent persisted provider and the
// workspace shell stay aligned. The narrower metadata threshold stays local.
export const MACHINES_WORKSPACE_LEFT_SIDEBAR_WIDTH_PX = 288;

function buildMachineThreadKey(machineId: string, threadId: string): string {
  return `${machineId}\u0000${threadId}`;
}

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
 * capping them at two lines so the rail stays compact when labels are long.
 */
function ThreadRow(props: {
  item: CodexThreadSidebarThread;
  threadKey: string;
  isSelected: boolean;
  pinActionPendingKey: string | null;
  isDisabled?: boolean;
  relativeTimeReferenceMs?: number;
  leadingIcon?: ReactNode;
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
  const pinActionIsPending = props.pinActionPendingKey === props.threadKey;
  const pinActionDisabled = pinActionIsPending || props.isDisabled === true;

  return (
    <div
      className={cn(
        "group flex min-h-10 w-full items-start gap-0 text-sm transition-colors",
        props.isSelected
          ? "bg-accent text-foreground"
          : props.isDisabled
            ? "bg-background text-foreground"
            : "bg-background text-foreground hover:bg-accent/60 focus-within:bg-accent/60",
        props.isDisabled ? "opacity-60" : null,
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
        disabled={props.isDisabled}
        className={cn(
          "flex min-w-0 flex-1 items-start gap-2 py-2 pr-3 text-left",
          props.onPinChange ? null : "px-3",
          props.isDisabled ? "cursor-default" : null,
        )}
        onClick={() => {
          props.onSelect?.(props.item.id);
        }}
      >
        {props.leadingIcon ? (
          <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center pt-0.5 text-muted-foreground">
            {props.leadingIcon}
          </div>
        ) : null}
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
            className="min-w-0 flex-auto line-clamp-2 [overflow-wrap:anywhere] text-[15px] font-medium leading-5"
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

/** Reuse the existing project-group accordion styling inside each machine section. */
function ProjectSection(props: {
  group: CodexThreadSidebarProject;
  isOpen: boolean;
  isStartConversationDisabled: boolean;
  isStartConversationPending: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  onStartConversation?: (envMode: MachinesWorkspaceConversationEnvMode) => void;
  children: ReactNode;
}) {
  const startConversationLabel = `Start new conversation in ${props.group.label}`;

  return (
    <Collapsible open={props.isOpen} onOpenChange={props.onOpenChange}>
      <div className="flex min-w-0 items-start gap-1 pr-1">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-h-[32px] min-w-0 flex-1 items-start gap-1.5 px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/60"
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
            <span className="line-clamp-2 min-w-0 flex-1 [overflow-wrap:anywhere] text-[13px] font-medium leading-5 text-muted-foreground">
              {props.group.label}
            </span>
          </button>
        </CollapsibleTrigger>
        {props.onStartConversation ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={startConversationLabel}
                className={cn(
                  "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors",
                  props.isStartConversationDisabled
                    ? "cursor-default opacity-50"
                    : "hover:bg-accent/80 hover:text-foreground focus-visible:bg-accent/80 focus-visible:text-foreground",
                )}
                disabled={props.isStartConversationDisabled}
                title={startConversationLabel}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                {props.isStartConversationPending ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    strokeWidth={1.75}
                  />
                ) : (
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4}>
              <DropdownMenuGroup>
                <DropdownMenuLabel>New conversation</DropdownMenuLabel>
              </DropdownMenuGroup>
              {(
                [
                  "local",
                  "worktree",
                ] as const satisfies ReadonlyArray<MachinesWorkspaceConversationEnvMode>
              ).map((envMode) => {
                const EnvIcon = envMode === "worktree" ? GitFork : Folder;
                return (
                  <DropdownMenuItem
                    key={envMode}
                    onSelect={() => {
                      props.onStartConversation?.(envMode);
                    }}
                  >
                    <span className="inline-flex items-center gap-2 text-sm">
                      <EnvIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {readMachinesWorkspaceConversationEnvLabel(envMode)}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <CollapsibleContent>
        <div className="grid min-w-0 gap-1 py-1">{props.children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Map machine connectivity into the small status pill copy shown in the rail. */
function readMachineSectionStatusLabel(
  section: MachinesWorkspaceSidebarSection,
): string {
  if (section.machineStatus !== "online") {
    return "Offline";
  }

  if (section.machineStatusReason === null) {
    return "Ready";
  }

  return "Unavailable";
}

/** Keep machine status styling literal so Tailwind can statically extract it. */
function readMachineSectionStatusClassName(
  section: MachinesWorkspaceSidebarSection,
): string {
  if (section.machineStatus !== "online") {
    return "border-border text-muted-foreground";
  }

  if (section.machineStatusReason === null) {
    return "border-emerald-200 text-emerald-700";
  }

  return "border-amber-200 text-amber-700";
}

/** Give each machine a clearly separated accordion root in the left sidebar. */
function MachineSection(props: {
  section: MachinesWorkspaceSidebarSection;
  isOpen: boolean;
  isSelected: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Collapsible open={props.isOpen} onOpenChange={props.onOpenChange}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex min-h-[44px] w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/60",
            props.isSelected ? "bg-accent/60" : "bg-background",
          )}
          title={props.section.machineHostname}
        >
          {props.isOpen ? (
            <ChevronDownIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[13px] font-semibold text-foreground">
                {props.section.machineDisplayName}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]",
                  readMachineSectionStatusClassName(props.section),
                )}
              >
                {readMachineSectionStatusLabel(props.section)}
              </span>
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {props.section.machineHostname}
            </div>
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-5 grid min-w-0 gap-1 border-l border-border/60 pl-1">
          {props.children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Machine-local project ids need a composite key once the sidebar is multi-rooted. */
function buildProjectKey(machineId: string, projectId: string): string {
  return `${machineId}\u0000${projectId}`;
}

/**
 * Keep the sidebar grouping rules from PR #403, but let the shared workspace
 * shell host a real selected-thread pane instead of an empty canvas.
 */
export function MachinesWorkspaceView(props: MachinesWorkspaceViewProps) {
  const machineSections = useMemo(
    () =>
      buildMachinesWorkspaceSidebarSections({
        inventories: props.machineInventories,
      }),
    [props.machineInventories],
  );
  // Serialize ids through a nul-delimited signature so the split array and
  // derived Set only change identity when the underlying contents change.
  const machineIds = useMemo(
    () => machineSections.map((section) => section.machineId),
    [machineSections],
  );
  const machineIdsSignature = useMemo(
    () => machineIds.join("\u0000"),
    [machineIds],
  );
  const stableMachineIds = useMemo(
    () =>
      machineIdsSignature.length > 0 ? machineIdsSignature.split("\u0000") : [],
    [machineIdsSignature],
  );
  const validMachineIds = useMemo(
    () => new Set(stableMachineIds),
    [stableMachineIds],
  );
  const selectedMachineSection = useMemo(
    () =>
      props.selectedMachineId
        ? (machineSections.find(
            (section) => section.machineId === props.selectedMachineId,
          ) ?? null)
        : null,
    [machineSections, props.selectedMachineId],
  );
  const selectedThreadSummary = useMemo(
    () =>
      props.selectedThreadId
        ? (selectedMachineSection?.uniqueThreads.find(
            (thread) => thread.id === props.selectedThreadId,
          ) ?? null)
        : null,
    [props.selectedThreadId, selectedMachineSection],
  );
  const projectKeys = useMemo(
    () =>
      machineSections.flatMap((section) =>
        section.projects.map((project) =>
          buildProjectKey(section.machineId, project.id),
        ),
      ),
    [machineSections],
  );
  const projectKeysSignature = useMemo(
    () => projectKeys.join("\u0000"),
    [projectKeys],
  );
  const stableProjectKeys = useMemo(
    () =>
      projectKeysSignature.length > 0
        ? projectKeysSignature.split("\u0000")
        : [],
    [projectKeysSignature],
  );
  const validProjectKeys = useMemo(
    () => new Set(stableProjectKeys),
    [stableProjectKeys],
  );
  const selectedProjectKey =
    selectedMachineSection &&
    selectedThreadSummary &&
    !selectedMachineSection.pinnedThreads.some(
      (thread) => thread.id === selectedThreadSummary.id,
    )
      ? buildProjectKey(
          selectedMachineSection.machineId,
          selectedThreadSummary.project.id,
        )
      : null;
  const fallbackProjectMachine =
    selectedMachineSection ??
    (machineSections.length > 0 ? machineSections[0] : null);
  const fallbackProject =
    fallbackProjectMachine && fallbackProjectMachine.projects.length > 0
      ? fallbackProjectMachine.projects[0]
      : null;
  const firstProjectKey =
    fallbackProjectMachine && fallbackProject
      ? buildProjectKey(fallbackProjectMachine.machineId, fallbackProject.id)
      : null;
  const [openMachineIds, setOpenMachineIds] = useState<Set<string>>(() => {
    const next = new Set<string>();
    if (props.selectedMachineId !== null) {
      next.add(props.selectedMachineId);
    } else {
      const firstMachineId = stableMachineIds[0];
      if (firstMachineId) {
        next.add(firstMachineId);
      }
    }
    return next;
  });
  const [openProjectIds, setOpenProjectIds] = useState<Set<string>>(() => {
    const next = new Set<string>();
    if (selectedProjectKey) {
      next.add(selectedProjectKey);
    } else if (firstProjectKey) {
      next.add(firstProjectKey);
    }
    return next;
  });
  const sidebarTestId = props.dataTestId
    ? `${props.dataTestId}-sidebar`
    : undefined;
  const headerTestId = props.dataTestId
    ? `${props.dataTestId}-header`
    : undefined;

  useEffect(() => {
    setOpenMachineIds((current) => {
      const next = new Set<string>();
      for (const machineId of current) {
        if (validMachineIds.has(machineId)) {
          next.add(machineId);
        }
      }

      if (
        props.selectedMachineId !== null &&
        validMachineIds.has(props.selectedMachineId)
      ) {
        next.add(props.selectedMachineId);
      }

      if (next.size === 0) {
        const firstMachineId = stableMachineIds[0];
        if (firstMachineId) {
          next.add(firstMachineId);
        }
      }

      return setsAreEqual(current, next) ? current : next;
    });
  }, [props.selectedMachineId, stableMachineIds, validMachineIds]);

  useEffect(() => {
    setOpenProjectIds((current) => {
      const next = new Set<string>();
      for (const projectKey of current) {
        if (validProjectKeys.has(projectKey)) {
          next.add(projectKey);
        }
      }

      if (selectedProjectKey && validProjectKeys.has(selectedProjectKey)) {
        next.add(selectedProjectKey);
      }

      if (next.size === 0 && firstProjectKey) {
        next.add(firstProjectKey);
      }

      return setsAreEqual(current, next) ? current : next;
    });
  }, [
    firstProjectKey,
    projectKeysSignature,
    selectedProjectKey,
    validProjectKeys,
  ]);

  return (
    <WorkspaceLayoutV2FullPage
      dataTestId={props.dataTestId}
      left={{
        header: props.leftSidebarHeader ?? null,
        content: (
          <div
            data-testid={sidebarTestId}
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-background px-2 py-2"
          >
            <div className="grid min-w-0 gap-2">
              {machineSections.map((section) => (
                <MachineSection
                  key={section.machineId}
                  section={section}
                  isOpen={openMachineIds.has(section.machineId)}
                  isSelected={section.machineId === props.selectedMachineId}
                  onOpenChange={(nextOpen) => {
                    setOpenMachineIds((current) => {
                      const next = new Set(current);
                      if (nextOpen) {
                        next.add(section.machineId);
                      } else {
                        next.delete(section.machineId);
                      }
                      return next;
                    });
                  }}
                >
                  {section.machineStatusReason !== null ? (
                    <div className="px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                      {section.machineStatusReason}
                    </div>
                  ) : null}

                  {section.machineStatusReason === null &&
                  !section.hasLoadedThreadInventory ? (
                    <div className="px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                      Loading threads...
                    </div>
                  ) : null}

                  {section.pinnedThreads.length > 0 ? (
                    <div className="grid min-w-0 gap-1 py-1">
                      {section.pinnedThreads.map((thread) => (
                        <ThreadRow
                          key={thread.id}
                          item={thread}
                          threadKey={buildMachineThreadKey(
                            section.machineId,
                            thread.id,
                          )}
                          isSelected={
                            section.machineId === props.selectedMachineId &&
                            thread.id === props.selectedThreadId
                          }
                          pinActionPendingKey={props.pendingPinThreadKey}
                          isDisabled={
                            section.machineStatusReason !== null ||
                            props.isSubmittingTurn
                          }
                          relativeTimeReferenceMs={
                            props.relativeTimeReferenceMs
                          }
                          onPinChange={
                            props.onThreadPinChange
                              ? (threadId, nextPinned) => {
                                  props.onThreadPinChange?.({
                                    machineId: section.machineId,
                                    nextPinned,
                                    threadId,
                                  });
                                }
                              : undefined
                          }
                          onSelect={(threadId) => {
                            props.onThreadSelect?.({
                              machineId: section.machineId,
                              threadId,
                            });
                          }}
                        />
                      ))}
                    </div>
                  ) : null}

                  <div className="grid min-w-0 gap-1 pb-1">
                    {section.projects.map((group) => {
                      const projectKey = buildProjectKey(
                        section.machineId,
                        group.id,
                      );
                      const projectStartIsPending =
                        props.isSubmittingTurn &&
                        props.pendingConversation?.machineId ===
                          section.machineId &&
                        props.pendingConversation.projectId === group.id;
                      return (
                        <ProjectSection
                          key={projectKey}
                          group={group}
                          isOpen={openProjectIds.has(projectKey)}
                          isStartConversationDisabled={
                            section.machineStatusReason !== null ||
                            props.isSubmittingTurn
                          }
                          isStartConversationPending={projectStartIsPending}
                          onOpenChange={(nextOpen) => {
                            setOpenProjectIds((current) => {
                              const next = new Set(current);
                              if (nextOpen) {
                                next.add(projectKey);
                              } else {
                                next.delete(projectKey);
                              }
                              return next;
                            });
                          }}
                          onStartConversation={
                            props.onProjectStartConversation
                              ? (envMode) => {
                                  props.onProjectStartConversation?.({
                                    envMode,
                                    machineId: section.machineId,
                                    projectId: group.id,
                                    projectLabel: group.label,
                                    projectRootCwd: group.rootCwd,
                                  });
                                }
                              : undefined
                          }
                        >
                          {group.threads.map((thread) => (
                            <ThreadRow
                              key={thread.id}
                              item={thread}
                              threadKey={buildMachineThreadKey(
                                section.machineId,
                                thread.id,
                              )}
                              isSelected={
                                section.machineId === props.selectedMachineId &&
                                thread.id === props.selectedThreadId
                              }
                              pinActionPendingKey={props.pendingPinThreadKey}
                              isDisabled={
                                section.machineStatusReason !== null ||
                                props.isSubmittingTurn
                              }
                              relativeTimeReferenceMs={
                                props.relativeTimeReferenceMs
                              }
                              className="pl-10"
                              onPinChange={
                                props.onThreadPinChange
                                  ? (threadId, nextPinned) => {
                                      props.onThreadPinChange?.({
                                        machineId: section.machineId,
                                        nextPinned,
                                        threadId,
                                      });
                                    }
                                  : undefined
                              }
                              onSelect={(threadId) => {
                                props.onThreadSelect?.({
                                  machineId: section.machineId,
                                  threadId,
                                });
                              }}
                            />
                          ))}
                        </ProjectSection>
                      );
                    })}
                  </div>
                </MachineSection>
              ))}
            </div>
          </div>
        ),
      }}
      main={{
        header: (
          <MachinesWorkspaceThreadHeader
            hasPendingStartedThread={props.hasPendingStartedThread}
            isLoading={props.selectedThreadLoading}
            pendingConversation={
              props.pendingConversation === null
                ? null
                : {
                    envMode: props.pendingConversation.envMode,
                    projectLabel: props.pendingConversation.projectLabel,
                  }
            }
            selectedMachineDisplayName={props.selectedMachineDisplayName}
            selectedMachineHostname={props.selectedMachineHostname}
            selectedMachineStatusReason={props.selectedMachineStatusReason}
            selectedThreadId={props.selectedThreadId}
            thread={props.selectedThread}
          />
        ),
        headerTestId,
        content: (
          <MachinesWorkspaceThreadPane
            errorMessage={props.selectedThreadError}
            hasPendingStartedThread={props.hasPendingStartedThread}
            isLoading={props.selectedThreadLoading}
            isSubmittingTurn={props.isSubmittingTurn}
            onTurnDraftChange={props.onTurnDraftChange}
            onTurnSubmit={props.onTurnSubmit}
            pendingConversation={props.pendingConversation}
            selectedMachineStatusReason={props.selectedMachineStatusReason}
            selectedThreadId={props.selectedThreadId}
            thread={props.selectedThread}
            turnDraft={props.turnDraft}
          />
        ),
      }}
      right={{}}
    />
  );
}
