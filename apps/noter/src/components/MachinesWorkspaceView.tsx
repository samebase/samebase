import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/collapsible";
import { useSidebar } from "@/hooks/use-sidebar";
import { RepositoryWorkspaceFrame } from "@/components/workspace-layout/RepositoryWorkspaceFrame";
import { WorkspaceScene } from "@/components/workspace-layout/WorkspaceScene";
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
import { MachinesWorkspaceThreadPane } from "@/components/MachinesWorkspaceThreadPane";
import {
  DropdownMenu,
  DropdownMenuContent,
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
const MIN_LEFT_SIDEBAR_WIDTH_FOR_CODEX_THREAD_ROW_PX = 320;
// Export the shared desktop width so the parent persisted provider and the
// workspace shell stay aligned with the Codex-like row treatment.
export const MACHINES_WORKSPACE_LEFT_SIDEBAR_WIDTH_PX = 384;
export const MACHINES_WORKSPACE_LEFT_SIDEBAR_MOBILE_WIDTH_PX = 288;
const MACOS_APP_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif";

function buildMachineThreadKey(machineId: string, threadId: string): string {
  return `${machineId}\u0000${threadId}`;
}

function WorktreeMetaIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.2 9.9h6.7" />
      <path d="m8.9 9.9 5.7-5.7" />
      <path d="M10.8 4.2h3.8V8" />
      <path d="m8.9 10.1 5.7 5.7" />
      <path d="M10.8 15.8h3.8V12" />
    </svg>
  );
}

function ReadyPrMetaIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="4.6" cy="4.4" r="1.7" />
      <circle cx="4.6" cy="15.6" r="1.7" />
      <path d="M4.6 6.3v7.4" />
      <path d="M11.5 7.3h2.8a1.7 1.7 0 0 1 1.7 1.7v2.3" />
      <path d="m11.5 7.3 1.9-1.9" />
      <path d="m11.5 7.3 1.9 1.9" />
      <path d="M13.4 15.5h4.4" />
      <path d="M15.6 13.3v4.4" />
    </svg>
  );
}

function DraftPrMetaIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="4.6" cy="4.4" r="1.7" />
      <circle cx="4.6" cy="15.6" r="1.7" />
      <path d="M4.6 6.3v7.4" />
      <circle cx="14.8" cy="5.2" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="9.8" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="15.2" r="1.7" />
    </svg>
  );
}

function MetaIndicatorIcon(props: {
  indicator: "worktree" | "prDraft" | "prReady";
  className?: string;
}) {
  if (props.indicator === "worktree") {
    return <WorktreeMetaIcon className={props.className} />;
  }

  if (props.indicator === "prDraft") {
    return <DraftPrMetaIcon className={props.className} />;
  }

  return <ReadyPrMetaIcon className={props.className} />;
}

function ThreadPinActionButton(props: {
  isPinned: boolean;
  isVisible: boolean;
  isPending: boolean;
  disabled: boolean;
  visualVariant?: "compact" | "codex";
  onClick?: () => void;
}) {
  const label = props.isPinned ? "Unpin thread" : "Pin thread";
  const visualVariant = props.visualVariant ?? "compact";
  const isCodexVariant = visualVariant === "codex";

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={props.isPinned}
      className={cn(
        isCodexVariant
          ? "flex h-4 w-4 items-center justify-center rounded-sm text-[#a0a0a0] transition-opacity"
          : "flex h-6 w-6 items-center justify-center rounded-sm transition-[opacity,color,background-color]",
        isCodexVariant
          ? null
          : props.isPinned
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
        <Loader2
          className={
            isCodexVariant
              ? "h-[14px] w-[14px] animate-spin"
              : "h-3 w-3 animate-spin"
          }
          strokeWidth={1.6}
        />
      ) : (
        <Pin
          className={
            isCodexVariant ? "h-[14px] w-[14px] rotate-45" : "h-3 w-3 rotate-45"
          }
          strokeWidth={isCodexVariant ? 1.65 : 1.6}
        />
      )}
    </button>
  );
}

/**
 * Let thread and project names grow with the live sidebar width while still
 * capping them at three lines so the rail stays compact when labels are long.
 */
export function MachinesWorkspaceThreadRow(props: {
  item: CodexThreadSidebarThread;
  threadKey: string;
  isSelected: boolean;
  pinActionPendingKey: string | null;
  isDisabled?: boolean;
  relativeTimeReferenceMs?: number;
  leadingIcon?: ReactNode;
  dataTestId?: string;
  forceShowTrailingMeta?: boolean;
  metaCounts?: {
    added: number;
    removed: number;
  } | null;
  trailingIndicators?: Array<"worktree" | "prDraft" | "prReady">;
  visualVariant?: "sidebar" | "reference";
  className?: string;
  onPinChange?: (threadId: string, nextPinned: boolean) => void;
  onSelect?: (threadId: string) => void;
}) {
  const { isMobile, leftDesktopWidthPx, leftMobileWidthPx } = useSidebar();
  const leftSidebarWidthPx = isMobile ? leftMobileWidthPx : leftDesktopWidthPx;
  const visualVariant = props.visualVariant ?? "sidebar";
  const isReferenceVariant = visualVariant === "reference";
  const usesCodexSidebarStyle =
    visualVariant === "sidebar" &&
    !isMobile &&
    leftSidebarWidthPx >= MIN_LEFT_SIDEBAR_WIDTH_FOR_CODEX_THREAD_ROW_PX;
  const usesReferenceTypography = isReferenceVariant || usesCodexSidebarStyle;
  const threadRowTestId =
    props.dataTestId ??
    `machines-thread-row-${props.threadKey.split("\u0000").join("-")}`;
  // Once the rail gets very narrow, the fixed timestamp chrome can starve the
  // flex title column down to zero width, which makes line-clamp appear stuck.
  const showTrailingMeta =
    props.forceShowTrailingMeta ??
    leftSidebarWidthPx >= MIN_LEFT_SIDEBAR_WIDTH_FOR_THREAD_META_PX;
  const pinActionVisibleBecauseSelected = isMobile && props.isSelected;
  const pinActionVisible = usesCodexSidebarStyle
    ? props.item.isPinned
    : props.item.isPinned || pinActionVisibleBecauseSelected;
  const pinActionIsPending = props.pinActionPendingKey === props.threadKey;
  const pinActionDisabled = pinActionIsPending || props.isDisabled === true;
  const rootClassName = isReferenceVariant
    ? "group flex h-16 w-full items-stretch bg-white text-[#1a1a1a] antialiased"
    : usesCodexSidebarStyle
      ? cn(
          "group flex h-[46px] w-full items-stretch rounded-[14px] text-[#1a1a1a] antialiased transition-colors",
          props.isSelected
            ? "bg-[#efefef]"
            : props.isDisabled
              ? "bg-transparent"
              : "bg-transparent hover:bg-[#f2f2f2] focus-within:bg-[#f2f2f2]",
          props.isDisabled ? "opacity-60" : null,
        )
      : cn(
          "group flex min-h-9 w-full items-start gap-0 text-[13px] transition-colors",
          props.isSelected
            ? "bg-accent text-foreground"
            : props.isDisabled
              ? "bg-background text-foreground"
              : "bg-background text-foreground hover:bg-accent/60 focus-within:bg-accent/60",
          props.isDisabled ? "opacity-60" : null,
        );
  const buttonClassName = isReferenceVariant
    ? "flex min-w-0 flex-1 items-center gap-[16px] px-[16px] py-0 text-left"
    : usesCodexSidebarStyle
      ? cn(
          "flex min-w-0 flex-1 items-center gap-[6px] px-0 py-0 text-left",
          props.isDisabled ? "cursor-default" : null,
        )
      : cn(
          "flex min-w-0 flex-1 items-start gap-2 py-2 pr-3 text-left",
          props.onPinChange ? null : "px-3",
          props.isDisabled ? "cursor-default" : null,
        );
  const leadingIconClassName =
    isReferenceVariant || usesCodexSidebarStyle
      ? isReferenceVariant
        ? "flex h-[20px] w-[20px] shrink-0 items-center justify-center text-[#a0a0a0]"
        : "flex h-[14px] w-[14px] shrink-0 items-center justify-center text-[#a0a0a0]"
      : "flex h-3 w-3 shrink-0 items-center justify-center pt-px text-muted-foreground";
  const contentClassName =
    isReferenceVariant || usesCodexSidebarStyle
      ? isReferenceVariant
        ? "flex min-w-0 flex-1 items-center gap-[10px]"
        : "flex min-w-0 flex-1 items-center gap-[6px]"
      : "flex min-w-0 flex-1 items-start gap-1";
  const workspaceIndicatorClassName =
    isReferenceVariant || usesCodexSidebarStyle
      ? isReferenceVariant
        ? "flex h-[18px] w-[18px] shrink-0 items-center justify-center text-[#9a9a9a]"
        : "flex h-[14px] w-[14px] shrink-0 items-center justify-center text-[#9a9a9a]"
      : "flex h-3 w-3 shrink-0 items-center justify-center pt-px text-muted-foreground";
  const titleClassName =
    isReferenceVariant || usesCodexSidebarStyle
      ? isReferenceVariant
        ? "min-w-0 flex-auto truncate text-[20px] font-normal leading-[1.08] tracking-[-0.02em] text-[#1c1c1c]"
        : "min-w-0 flex-auto truncate text-[14px] font-normal leading-[1.05] tracking-[-0.012em] text-[#1c1c1c]"
      : "min-w-0 flex-auto line-clamp-3 [overflow-wrap:anywhere] text-[13px] font-medium leading-[1.15rem]";
  const trailingMetaClassName =
    isReferenceVariant || usesCodexSidebarStyle
      ? isReferenceVariant
        ? "flex shrink-0 items-center gap-[11px] text-[17px] font-medium leading-none tabular-nums text-[#8f8f8f]"
        : "flex shrink-0 items-center gap-[6px] text-[13px] font-medium leading-none tabular-nums text-[#8f8f8f]"
      : "flex shrink-0 items-center gap-0.5 pt-px text-[11px] tabular-nums text-muted-foreground";
  const metaIndicatorClassName =
    isReferenceVariant || usesCodexSidebarStyle
      ? isReferenceVariant
        ? "h-[18px] w-[18px] shrink-0 text-[#8c8c8c]"
        : "h-[14px] w-[14px] shrink-0 text-[#8c8c8c]"
      : "h-2.5 w-2.5 shrink-0";
  const resolvedTrailingIndicators =
    props.trailingIndicators ??
    (usesCodexSidebarStyle && props.item.showWorkspaceIndicator
      ? (["worktree"] as const)
      : undefined);
  const showLeadingWorkspaceIndicator =
    props.item.showWorkspaceIndicator &&
    !isReferenceVariant &&
    !usesCodexSidebarStyle;
  const showInlinePinSlot =
    usesCodexSidebarStyle && props.onPinChange !== undefined;

  return (
    <div
      data-testid={threadRowTestId}
      className={cn(rootClassName, props.className)}
      style={
        usesReferenceTypography
          ? { fontFamily: MACOS_APP_FONT_FAMILY }
          : undefined
      }
    >
      {showInlinePinSlot ? (
        <div className="flex shrink-0 items-center pl-0">
          <ThreadPinActionButton
            isPinned={props.item.isPinned}
            isVisible={pinActionVisible}
            isPending={pinActionIsPending}
            disabled={pinActionDisabled}
            visualVariant="codex"
            onClick={() => {
              props.onPinChange?.(props.item.id, !props.item.isPinned);
            }}
          />
        </div>
      ) : props.onPinChange ? (
        <div className="flex shrink-0 items-start pl-2.5 pr-0.5 pt-2">
          <ThreadPinActionButton
            isPinned={props.item.isPinned}
            isVisible={pinActionVisible}
            isPending={pinActionIsPending}
            disabled={pinActionDisabled}
            visualVariant="compact"
            onClick={() => {
              props.onPinChange?.(props.item.id, !props.item.isPinned);
            }}
          />
        </div>
      ) : null}
      <button
        type="button"
        disabled={props.isDisabled}
        className={buttonClassName}
        onClick={() => {
          props.onSelect?.(props.item.id);
        }}
      >
        {props.leadingIcon ? (
          <div className={leadingIconClassName}>{props.leadingIcon}</div>
        ) : null}
        <div className={contentClassName}>
          {showLeadingWorkspaceIndicator ? (
            <div
              className={workspaceIndicatorClassName}
              title={props.item.workspaceTooltip ?? undefined}
            >
              <GitBranch className="h-2.5 w-2.5" strokeWidth={1.6} />
            </div>
          ) : null}
          <div
            className={titleClassName}
            title={props.item.workspaceTooltip ?? props.item.title}
          >
            {props.item.title}
          </div>
        </div>
        {showTrailingMeta ? (
          <div className={trailingMetaClassName}>
            {props.metaCounts ? (
              <>
                <span className="text-[#18a34a]">
                  +{props.metaCounts.added}
                </span>
                <span className="text-[#d33b31]">
                  -{props.metaCounts.removed}
                </span>
              </>
            ) : null}
            {resolvedTrailingIndicators?.map((indicator, index) => (
              <MetaIndicatorIcon
                key={`${indicator}-${index}`}
                indicator={indicator}
                className={metaIndicatorClassName}
              />
            )) ?? (
              <ArrowUpRight
                className={metaIndicatorClassName}
                strokeWidth={1.6}
              />
            )}
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
            className="flex min-h-[28px] min-w-0 flex-1 items-start gap-1 px-3 py-1 text-left text-[12px] text-muted-foreground transition-colors hover:bg-accent/60"
            title={props.group.detail}
          >
            {props.isOpen ? (
              <ChevronDownIcon className="mt-px h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="mt-px h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <div className="flex h-3 w-3 shrink-0 items-center justify-center pt-px">
              <div className="h-1.5 w-1.5 bg-muted-foreground/30 corner-notch-1" />
            </div>
            <span className="line-clamp-3 min-w-0 flex-1 [overflow-wrap:anywhere] text-[12px] font-medium leading-4 text-muted-foreground">
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
                  "mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors",
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
                    className="h-3 w-3 animate-spin"
                    strokeWidth={1.75}
                  />
                ) : (
                  <Plus className="h-3 w-3" strokeWidth={1.75} />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4}>
              <DropdownMenuLabel>New conversation</DropdownMenuLabel>
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
            "flex min-h-[40px] w-full items-start gap-1.5 px-3 py-1.5 text-left transition-colors hover:bg-accent/60",
            props.isSelected ? "bg-accent/60" : "bg-background",
          )}
          title={props.section.machineHostname}
        >
          {props.isOpen ? (
            <ChevronDownIcon className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[12px] font-medium text-foreground">
                {props.section.machineDisplayName}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.05em]",
                  readMachineSectionStatusClassName(props.section),
                )}
              >
                {readMachineSectionStatusLabel(props.section)}
              </span>
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
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
        ? machineSections.find(
            (section) => section.machineId === props.selectedMachineId,
          ) ?? null
        : null,
    [machineSections, props.selectedMachineId],
  );
  const selectedThreadSummary = useMemo(
    () =>
      props.selectedThreadId
        ? selectedMachineSection?.uniqueThreads.find(
            (thread) => thread.id === props.selectedThreadId,
          ) ?? null
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
    <RepositoryWorkspaceFrame
      dataTestId={props.dataTestId}
      headerTestId={headerTestId}
      contentClassName="min-h-0 flex-1 p-0"
      leftSidebarHeader={props.leftSidebarHeader ?? null}
      leftSidebarContent={
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
                  <div className="grid min-w-0 gap-0.5 py-0.5">
                    {section.pinnedThreads.map((thread) => (
                      <MachinesWorkspaceThreadRow
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
                        relativeTimeReferenceMs={props.relativeTimeReferenceMs}
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

                <div className="grid min-w-0 gap-0.5 pb-0.5">
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
                          <MachinesWorkspaceThreadRow
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
                      </ProjectSection>
                    );
                  })}
                </div>
              </MachineSection>
            ))}
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
            hasPendingStartedThread={props.hasPendingStartedThread}
            isLoading={props.selectedThreadLoading}
            isSubmittingTurn={props.isSubmittingTurn}
            onTurnDraftChange={props.onTurnDraftChange}
            onTurnSubmit={props.onTurnSubmit}
            pendingConversation={props.pendingConversation}
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
  );
}
