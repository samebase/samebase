import { Badge } from "@/components/badge";
import { CodexAppServerThreadHistoryItemCard } from "@/components/CodexAppServerThreadHistoryItemCard";
import { Input } from "@/components/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/collapsible";
import { RepositoryWorkspaceFrame } from "@/components/workspace-layout/RepositoryWorkspaceFrame";
import {
  WorkspaceScene,
  type WorkspaceBottomDockRenderProps,
} from "@/components/workspace-layout/WorkspaceScene";
import { SidebarProvider } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  buildMachineThreadGroups,
  dedupeMachineThreadsById,
  filterMachineThreadsBySearch,
} from "@/lib/machineThreadInventory";
import { MACHINE_CONNECT_ROUTE } from "@/lib/noterSync";
import {
  codexThreadPathIsArchived,
  type CodexAppServerThread,
  type CodexAppServerThreadTurn,
} from "@/lib/codexAppServerResearch";
import { clsx } from "clsx";
import { ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { CodexThreadBrowserDetailState } from "@/components/CodexThreadBrowserView";
import type { ConnectedMachineView } from "../../convex/connectedMachineModel";

type MachinesWorkspaceViewProps = {
  machines: ConnectedMachineView[];
  selectedMachine: ConnectedMachineView | null;
  selectedMachineStatusReason: string | null;
  threads: CodexAppServerThread[];
  pinnedThreadIds: string[];
  loadedThreadIds: string[];
  selectedThreadId: string | null;
  selectedThread: CodexAppServerThread | null;
  detailState: CodexThreadBrowserDetailState;
  searchTerm: string;
  turnDraft: string;
  errorMessage: string | null;
  isBusy: boolean;
  relativeTimeReferenceMs?: number;
  dataTestId?: string;
  onMachineSelect?: (machineId: string) => void;
  onRefresh?: () => void;
  onSearchTermChange?: (value: string) => void;
  onThreadSelect?: (threadId: string) => void;
  onTurnDraftChange?: (value: string) => void;
  onTurnSubmit?: () => void;
};

function normalizeTimestampToMilliseconds(value: number): number {
  return value < 10_000_000_000 ? value * 1000 : value;
}

function formatDateTime(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "n/a";
  }

  return new Date(normalizeTimestampToMilliseconds(value)).toLocaleString();
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

function readThreadPreview(thread: CodexAppServerThread): string | null {
  const previewLine = readFirstNonEmptyLine(thread.preview);
  const title = readThreadTitle(thread);
  if (previewLine === title) {
    return null;
  }

  return previewLine;
}

function readThreadWorkspaceLabel(thread: CodexAppServerThread): string | null {
  if (thread.workspace.isProjectRoot) {
    return null;
  }

  return thread.workspace.label;
}

function readShortThreadId(value: string): string {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function readTurnPreview(turn: CodexAppServerThreadTurn): string | null {
  if (turn.errorMessage) {
    return turn.errorMessage;
  }

  for (let index = turn.items.length - 1; index >= 0; index -= 1) {
    const summary = turn.items[index]?.summary?.trim();
    if (summary) {
      return summary;
    }
  }

  return null;
}

function readMachineSummary(machine: ConnectedMachineView): string {
  if (machine.status !== "online") {
    return "Offline";
  }

  if (machine.controlStatus === "ready") {
    return "Live control ready";
  }

  if (machine.controlStatus === "starting") {
    return "Live control starting";
  }

  return "Presence only";
}

function EmptyState(props: {
  title: string;
  body: string;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={props.testId}
      className="grid gap-3 border border-dashed border-border bg-background px-4 py-8 text-sm text-muted-foreground"
    >
      <div className="text-base font-medium text-foreground">{props.title}</div>
      <div className="max-w-2xl leading-6">{props.body}</div>
      {props.action}
    </div>
  );
}

function MachineRow(props: {
  machine: ConnectedMachineView;
  isSelected: boolean;
  onSelect?: (machineId: string) => void;
}) {
  const statusClassName = props.isSelected
    ? "border-white/30 text-white/80"
    : props.machine.controlStatus === "ready" &&
        props.machine.status === "online"
      ? "border-emerald-300 text-emerald-700"
      : "border-border text-muted-foreground";

  return (
    <button
      type="button"
      className={clsx(
        "grid w-full gap-2 border px-3 py-3 text-left transition-colors",
        props.isSelected
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-border bg-background text-foreground hover:bg-accent",
      )}
      onClick={() => {
        props.onSelect?.(props.machine.machineId);
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {props.machine.displayName}
          </div>
          <div
            className={clsx(
              "truncate text-xs",
              props.isSelected ? "text-white/70" : "text-muted-foreground",
            )}
            title={props.machine.hostname}
          >
            {props.machine.hostname}
          </div>
        </div>
        <div
          className={clsx(
            "shrink-0 text-[11px] font-medium",
            props.isSelected ? "text-white/70" : "text-muted-foreground",
          )}
        >
          {props.machine.status === "online" ? "Online" : "Offline"}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className={clsx("border px-1.5 py-0.5 font-mono", statusClassName)}
        >
          {readMachineSummary(props.machine)}
        </span>
        <span
          className={clsx(
            "font-mono",
            props.isSelected ? "text-white/70" : "text-muted-foreground",
          )}
        >
          {props.machine.connectorVersion}
        </span>
      </div>
    </button>
  );
}

function ThreadRow(props: {
  thread: CodexAppServerThread;
  isSelected: boolean;
  isLoaded: boolean;
  relativeTimeReferenceMs?: number;
  onSelect?: (threadId: string) => void;
}) {
  const preview = readThreadPreview(props.thread);
  const workspaceLabel = readThreadWorkspaceLabel(props.thread);

  return (
    <button
      type="button"
      className={clsx(
        "grid w-full gap-2 border px-3 py-3 text-left transition-colors",
        props.isSelected
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-border bg-background text-foreground hover:bg-accent",
      )}
      onClick={() => {
        props.onSelect?.(props.thread.id);
      }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-sm font-medium"
            title={readThreadTitle(props.thread)}
          >
            {readThreadTitle(props.thread)}
          </div>
          {preview ? (
            <div
              className={clsx(
                "line-clamp-2 text-xs leading-5",
                props.isSelected ? "text-white/70" : "text-muted-foreground",
              )}
              title={preview}
            >
              {preview}
            </div>
          ) : null}
        </div>
        <div
          className={clsx(
            "shrink-0 text-[11px] font-medium",
            props.isSelected ? "text-white/70" : "text-muted-foreground",
          )}
        >
          {formatRelativeTime(
            props.thread.updatedAt,
            props.relativeTimeReferenceMs,
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <div
          className={clsx(
            "h-2 w-2 shrink-0",
            props.isLoaded
              ? props.isSelected
                ? "bg-emerald-300"
                : "bg-emerald-500"
              : props.isSelected
                ? "bg-white/40"
                : "bg-border",
          )}
        />
        <span
          className={clsx(
            "font-mono",
            props.isSelected ? "text-white/70" : "text-muted-foreground",
          )}
          title={props.thread.id}
        >
          {readShortThreadId(props.thread.id)}
        </span>
        {workspaceLabel ? (
          <span
            className={clsx(
              "border px-1.5 py-0.5 font-mono",
              props.isSelected
                ? "border-white/30 text-white/80"
                : "border-sky-200 text-sky-700",
            )}
            title={props.thread.cwd}
          >
            {workspaceLabel}
          </span>
        ) : null}
        {props.thread.gitInfo?.branch ? (
          <span
            className={clsx(
              "border px-1.5 py-0.5 font-mono",
              props.isSelected
                ? "border-white/30 text-white/80"
                : "border-amber-200 text-amber-700",
            )}
            title={props.thread.gitInfo.branch}
          >
            {props.thread.gitInfo.branch}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function ThreadSection(props: {
  label: string;
  detail?: string;
  countLabel: string;
  threads: CodexAppServerThread[];
  loadedThreadIds: string[];
  selectedThreadId: string | null;
  relativeTimeReferenceMs?: number;
  onThreadSelect?: (threadId: string) => void;
}) {
  return (
    <section className="grid gap-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="grid gap-1 px-1">
        <div className="flex items-center justify-between gap-3">
          <div className="truncate text-sm font-semibold text-foreground">
            {props.label}
          </div>
          <div className="shrink-0 text-[11px] font-medium text-muted-foreground">
            {props.countLabel}
          </div>
        </div>
        {props.detail ? (
          <div
            className="truncate text-[11px] text-muted-foreground"
            title={props.detail}
          >
            {props.detail}
          </div>
        ) : null}
      </div>
      <div className="grid gap-2">
        {props.threads.map((thread) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            isSelected={thread.id === props.selectedThreadId}
            isLoaded={props.loadedThreadIds.includes(thread.id)}
            relativeTimeReferenceMs={props.relativeTimeReferenceMs}
            onSelect={props.onThreadSelect}
          />
        ))}
      </div>
    </section>
  );
}

function TurnHistoryCard(props: {
  turn: CodexAppServerThreadTurn;
  isExpanded: boolean;
  onExpandedChange: (nextOpen: boolean) => void;
}) {
  const preview = readTurnPreview(props.turn);

  return (
    <Collapsible
      open={props.isExpanded}
      onOpenChange={props.onExpandedChange}
      className="border border-border bg-background"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="grid w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-accent"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="font-mono text-sm">{props.turn.id}</div>
              <Badge variant="outline">{props.turn.status}</Badge>
              <Badge variant="outline">
                {props.turn.items.length} item
                {props.turn.items.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <ChevronDown
              className={clsx(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                props.isExpanded ? "rotate-180" : null,
              )}
            />
          </div>
          {preview ? (
            <div className="line-clamp-2 text-sm leading-6 text-muted-foreground">
              {preview}
            </div>
          ) : null}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-3 border-t border-border px-4 py-4">
        {props.turn.errorMessage ? (
          <div className="text-sm text-destructive">
            {props.turn.errorMessage}
          </div>
        ) : null}
        <div className="grid gap-2">
          {props.turn.items.map((item, index) => (
            <CodexAppServerThreadHistoryItemCard
              key={`${props.turn.id}-${item.id ?? item.type}-${index}`}
              item={item}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Report the rendered composer height back into the shared workspace scene so
 * mobile scroll padding keeps the latest turn visible above the dock.
 */
function ComposerDock({
  canSend,
  helperText,
  isBusy,
  onMobileDockInsetChange,
  onTurnDraftChange,
  onTurnSubmit,
  turnDraft,
}: WorkspaceBottomDockRenderProps & {
  canSend: boolean;
  isBusy: boolean;
  turnDraft: string;
  helperText: string;
  onTurnDraftChange?: (value: string) => void;
  onTurnSubmit?: () => void;
}) {
  const dockRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const dockNode = dockRef.current;
    if (!dockNode) {
      return;
    }

    const updateDockInset = () => {
      const dockHeight = Math.ceil(dockNode.getBoundingClientRect().height);
      onMobileDockInsetChange(`${dockHeight}px`);
    };

    updateDockInset();
    window.addEventListener("resize", updateDockInset);

    if (typeof ResizeObserver === "undefined") {
      return () => {
        window.removeEventListener("resize", updateDockInset);
        onMobileDockInsetChange(undefined);
      };
    }

    const resizeObserver = new ResizeObserver(updateDockInset);
    resizeObserver.observe(dockNode);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateDockInset);
      onMobileDockInsetChange(undefined);
    };
  }, [onMobileDockInsetChange]);

  return (
    <div
      ref={dockRef}
      className="border-t border-border bg-background px-4 py-4 md:px-6"
    >
      <div className="mx-auto grid w-full max-w-5xl gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Continue thread
          </div>
          <div className="text-xs text-muted-foreground">{helperText}</div>
        </div>
        <Textarea
          value={turnDraft}
          onChange={(event) => {
            onTurnDraftChange?.(event.target.value);
          }}
          placeholder="Continue this thread from the machines workspace..."
          disabled={!canSend}
          className="min-h-[120px] border-border bg-muted/20 font-mono text-sm"
        />
        <div className="flex justify-end">
          <Button
            disabled={!canSend || turnDraft.trim().length === 0}
            onClick={onTurnSubmit}
          >
            {isBusy ? "Sending..." : "Send prompt"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function MachinesWorkspaceView(props: MachinesWorkspaceViewProps) {
  const uniqueThreads = useMemo(
    () => dedupeMachineThreadsById(props.threads),
    [props.threads],
  );
  const visibleThreads = useMemo(
    () =>
      filterMachineThreadsBySearch({
        searchTerm: props.searchTerm,
        threads: uniqueThreads,
      }),
    [props.searchTerm, uniqueThreads],
  );
  const pinnedThreads = useMemo(() => {
    const visibleThreadById = new Map(
      visibleThreads.map((thread) => [thread.id, thread]),
    );

    return props.pinnedThreadIds
      .map((threadId) => visibleThreadById.get(threadId) ?? null)
      .filter((thread): thread is CodexAppServerThread => thread !== null);
  }, [props.pinnedThreadIds, visibleThreads]);
  const groups = useMemo(() => {
    const pinnedThreadIds = new Set(props.pinnedThreadIds);

    return buildMachineThreadGroups({
      loadedThreadIds: props.loadedThreadIds,
      threads: visibleThreads.filter(
        (thread) => !pinnedThreadIds.has(thread.id),
      ),
    });
  }, [props.loadedThreadIds, props.pinnedThreadIds, visibleThreads]);
  const lastSelectedTurnId = props.selectedThread?.turns.at(-1)?.id ?? null;
  const [expandedTurnIds, setExpandedTurnIds] = useState<string[]>(() =>
    lastSelectedTurnId ? [lastSelectedTurnId] : [],
  );
  const selectedMachineReady =
    props.selectedMachine !== null &&
    props.selectedMachineStatusReason === null;
  const selectedThreadIsArchived =
    props.selectedThread !== null &&
    (props.detailState.kind === "archived" ||
      codexThreadPathIsArchived(props.selectedThread.path));
  const selectedThreadIsLoaded =
    props.selectedThread !== null &&
    props.loadedThreadIds.includes(props.selectedThread.id);
  const emptySidebarContent = (
    <div aria-hidden="true" className="flex min-h-0 flex-1 bg-background" />
  );

  useEffect(() => {
    setExpandedTurnIds(lastSelectedTurnId ? [lastSelectedTurnId] : []);
  }, [lastSelectedTurnId, props.selectedThread?.id]);

  return (
    <SidebarProvider className="h-full min-h-0" defaultOpen={true}>
      <RepositoryWorkspaceFrame
        dataTestId={props.dataTestId}
        headerTitle="Machines"
        contentClassName="flex-1 min-h-0 p-0"
        headerRight={
          <>
            {selectedMachineReady ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 md:h-6 md:px-2"
                disabled={props.isBusy}
                onClick={props.onRefresh}
              >
                {props.isBusy ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Refreshing
                  </>
                ) : (
                  "Refresh"
                )}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 md:h-6 md:px-2"
              asChild
            >
              <Link to={MACHINE_CONNECT_ROUTE}>Connect machine</Link>
            </Button>
          </>
        }
        leftSidebarHeader={
          <div className="grid gap-2 border-b border-border bg-background px-3 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Connected machines
            </div>
            {props.selectedMachine ? (
              <div className="grid gap-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {props.selectedMachine.displayName}
                </div>
                <div
                  className="truncate text-xs text-muted-foreground"
                  title={props.selectedMachine.hostname}
                >
                  {props.selectedMachine.hostname}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="border border-border px-1.5 py-0.5 font-mono text-muted-foreground">
                    {readMachineSummary(props.selectedMachine)}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {props.machines.length} machine
                    {props.machines.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Connect a machine to browse its local Codex threads here.
              </div>
            )}
          </div>
        }
        leftSidebarContent={
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
            <div className="grid gap-4 p-3">
              {props.machines.length > 0 ? (
                <section className="grid gap-2">
                  <div className="px-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Available machines
                  </div>
                  <div className="grid gap-2">
                    {props.machines.map((machine) => (
                      <MachineRow
                        key={machine.machineId}
                        machine={machine}
                        isSelected={
                          machine.machineId === props.selectedMachine?.machineId
                        }
                        onSelect={props.onMachineSelect}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="grid gap-3 border-t border-border pt-4">
                <div className="flex items-center justify-between gap-3 px-1">
                  <div className="text-sm font-semibold text-foreground">
                    Threads
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {visibleThreads.length} visible
                  </div>
                </div>
                <Input
                  placeholder="Search title, prompt, branch, or path"
                  value={props.searchTerm}
                  disabled={!selectedMachineReady}
                  onChange={(event) => {
                    props.onSearchTermChange?.(event.target.value);
                  }}
                />
                {!selectedMachineReady ? (
                  props.machines.length === 0 ? (
                    <EmptyState
                      title="No connected machines"
                      body="Approve a machine first, then its local thread inventory will appear in this sidebar."
                    />
                  ) : (
                    <EmptyState
                      title="Machine unavailable"
                      body={
                        props.selectedMachineStatusReason ??
                        "Select a connected machine to browse its local thread inventory."
                      }
                    />
                  )
                ) : pinnedThreads.length === 0 && groups.length === 0 ? (
                  <EmptyState
                    title="No matching threads"
                    body="Adjust the search term or refresh the selected machine to inspect another slice of its local thread inventory."
                  />
                ) : (
                  <div className="grid gap-4">
                    {pinnedThreads.length > 0 ? (
                      <ThreadSection
                        label="Pinned"
                        countLabel={`${pinnedThreads.length}`}
                        detail="Desktop-pinned threads stay outside the project groups."
                        threads={pinnedThreads}
                        loadedThreadIds={props.loadedThreadIds}
                        selectedThreadId={props.selectedThreadId}
                        relativeTimeReferenceMs={props.relativeTimeReferenceMs}
                        onThreadSelect={props.onThreadSelect}
                      />
                    ) : null}
                    {groups.map((group) => (
                      <ThreadSection
                        key={group.id}
                        label={group.label}
                        countLabel={`${group.count}`}
                        detail={group.detail}
                        threads={group.threads}
                        loadedThreadIds={props.loadedThreadIds}
                        selectedThreadId={props.selectedThreadId}
                        relativeTimeReferenceMs={props.relativeTimeReferenceMs}
                        onThreadSelect={props.onThreadSelect}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        }
        rightSidebarHeader={null}
        rightSidebarContent={emptySidebarContent}
      >
        <WorkspaceScene
          workspacePaneClassName="bg-background"
          workspaceScrollClassName="bg-background"
          workspaceBody={
            <div className="flex min-h-full flex-col bg-background">
              <div className="border-b border-border px-4 py-4 md:px-6">
                <div className="mx-auto grid w-full max-w-5xl gap-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    {props.selectedMachine
                      ? props.selectedMachine.displayName
                      : "Machines workspace"}
                  </div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                        {props.selectedThread
                          ? readThreadTitle(props.selectedThread)
                          : props.selectedMachine
                            ? "Select a thread"
                            : "Connected machines"}
                      </h1>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                        {props.selectedThread
                          ? props.selectedThread.preview
                          : props.selectedMachine
                            ? props.selectedMachineStatusReason ??
                              "Choose a thread from the left sidebar to inspect it here and continue the conversation from the bottom composer."
                            : "Approve a machine, keep its connector running, and browse the same local Codex threads from this shared workspace shell."}
                      </p>
                    </div>
                    {props.selectedMachine ? (
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="border border-border px-1.5 py-0.5 font-mono text-muted-foreground">
                          {props.selectedMachine.hostname}
                        </span>
                        <span className="border border-border px-1.5 py-0.5 font-mono text-muted-foreground">
                          {readMachineSummary(props.selectedMachine)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">
                {props.errorMessage ? (
                  <div className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {props.errorMessage}
                  </div>
                ) : null}

                {props.machines.length === 0 ? (
                  <EmptyState
                    title="No connected machines yet"
                    body="Start from the machine connect flow, then this workspace will reuse the same dashboard/file-view shell to show local thread inventory on the left."
                    action={
                      <div>
                        <Button asChild>
                          <Link to={MACHINE_CONNECT_ROUTE}>
                            Connect machine
                          </Link>
                        </Button>
                      </div>
                    }
                  />
                ) : props.selectedMachine === null ? (
                  <EmptyState
                    title="Select a machine"
                    body="Pick one of the connected machines from the left sidebar to browse its local Codex threads."
                  />
                ) : !selectedMachineReady ? (
                  <EmptyState
                    title="Live control unavailable"
                    body={
                      props.selectedMachineStatusReason ??
                      "This machine is not currently ready to serve local thread inventory."
                    }
                  />
                ) : props.selectedThread === null ? (
                  <EmptyState
                    title="Select a thread"
                    body="The sidebar now owns thread browsing. Pick a thread there, and the main pane will keep the conversation history above the bottom composer."
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {props.selectedThread.sourceLabel}
                      </Badge>
                      <Badge variant="outline">
                        {props.selectedThread.status.type}
                      </Badge>
                      {selectedThreadIsLoaded ? (
                        <Badge className="bg-emerald-600 text-white">
                          loaded
                        </Badge>
                      ) : null}
                      {selectedThreadIsArchived ? (
                        <Badge variant="outline">archived</Badge>
                      ) : null}
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatDateTime(props.selectedThread.updatedAt)}
                      </span>
                    </div>

                    <div className="grid gap-3 border border-border bg-muted/20 px-4 py-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          Project root
                        </span>
                        <span
                          className="max-w-[32rem] truncate font-mono text-xs text-foreground"
                          title={props.selectedThread.project.rootCwd}
                        >
                          {props.selectedThread.project.rootCwd}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-muted-foreground">Workspace</span>
                        <span className="font-mono text-xs text-foreground">
                          {readThreadWorkspaceLabel(props.selectedThread) ??
                            "project root"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-muted-foreground">Branch</span>
                        <span className="font-mono text-xs text-foreground">
                          {props.selectedThread.gitInfo?.branch ?? "n/a"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-muted-foreground">Thread id</span>
                        <span className="font-mono text-xs text-foreground">
                          {props.selectedThread.id}
                        </span>
                      </div>
                    </div>

                    {props.detailState.kind === "loading" ? (
                      <EmptyState
                        title="Loading thread detail"
                        body="Hydrating the selected thread from the machine-local provider runtime."
                      />
                    ) : null}

                    {props.detailState.kind === "archived" ? (
                      <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        {props.detailState.message}
                      </div>
                    ) : null}

                    {props.detailState.kind === "error" ? (
                      <div className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        {props.detailState.message}
                      </div>
                    ) : null}

                    {props.detailState.kind === "ready" &&
                    props.selectedThread.turns.length > 0 ? (
                      <div className="grid gap-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Turn history
                        </div>
                        {props.selectedThread.turns.map((turn) => (
                          <TurnHistoryCard
                            key={turn.id}
                            turn={turn}
                            isExpanded={expandedTurnIds.includes(turn.id)}
                            onExpandedChange={(nextOpen) => {
                              setExpandedTurnIds((current) =>
                                nextOpen
                                  ? Array.from(new Set([...current, turn.id]))
                                  : current.filter(
                                      (expandedTurnId) =>
                                        expandedTurnId !== turn.id,
                                    ),
                              );
                            }}
                          />
                        ))}
                      </div>
                    ) : props.detailState.kind === "ready" ? (
                      <EmptyState
                        title="No hydrated turns"
                        body="This thread is visible in the machine inventory, but the provider did not return any hydrated turns for the current detail read."
                      />
                    ) : null}
                  </>
                )}
              </div>
            </div>
          }
          bottomDock={
            selectedMachineReady
              ? (bottomDockProps) => (
                  <ComposerDock
                    {...bottomDockProps}
                    canSend={
                      props.selectedThread !== null &&
                      !selectedThreadIsArchived &&
                      !props.isBusy
                    }
                    helperText={
                      selectedThreadIsArchived
                        ? "Unarchive before sending"
                        : selectedThreadIsLoaded
                          ? "Loaded in runtime"
                          : "Will resume on send"
                    }
                    isBusy={props.isBusy}
                    turnDraft={props.turnDraft}
                    onTurnDraftChange={props.onTurnDraftChange}
                    onTurnSubmit={props.onTurnSubmit}
                  />
                )
              : undefined
          }
        />
      </RepositoryWorkspaceFrame>
    </SidebarProvider>
  );
}
