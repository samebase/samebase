import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CodexAppServerThreadHistoryItemCard } from "@/components/CodexAppServerThreadHistoryItemCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  codexThreadPathIsArchived,
  type CodexAppServerThread,
  type CodexAppServerThreadTurn,
} from "@/lib/codexAppServerResearch";
import {
  type CodexThreadSidebarProject,
  type CodexThreadSidebarThread,
} from "@/lib/codexThreadSidebar";
import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

export type CodexThreadBrowserMode = "active" | "archived";

export type CodexThreadBrowserGroup = CodexThreadSidebarProject;

export type CodexThreadBrowserDetailState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "archived"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready" };

type CodexThreadBrowserViewProps = {
  browserMode: CodexThreadBrowserMode;
  pinnedThreads: CodexThreadSidebarThread[];
  groups: CodexThreadBrowserGroup[];
  searchTerm: string;
  loadedThreadIds: string[];
  selectedThreadId: string | null;
  selectedThread: CodexAppServerThread | null;
  detailState: CodexThreadBrowserDetailState;
  errorMessage?: string | null;
  isBusy: boolean;
  fillViewport?: boolean;
  relativeTimeReferenceMs?: number;
  labHref?: string;
  allowArchivedMode?: boolean;
  headingEyebrow?: string;
  headingTitle?: string;
  headingDescription?: string;
  onBrowserModeChange?: (mode: CodexThreadBrowserMode) => void;
  onSearchTermChange?: (value: string) => void;
  onThreadSelect?: (threadId: string) => void;
  onRefresh?: () => void;
  onResumeSelected?: () => void;
  onArchiveSelected?: () => void;
  onUnarchiveSelected?: () => void;
  turnDraft: string;
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

/**
 * Use a compact relative label so the grouped sidebar stays close to the Codex
 * mental model without flooding the left rail with full timestamps.
 */
function formatRelativeTime(
  value: number,
  referenceTimeMs: number = Date.now(),
): string {
  const now = referenceTimeMs;
  const diffMs = Math.max(0, now - normalizeTimestampToMilliseconds(value));
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

function readShortThreadId(value: string): string {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 8)}…${value.slice(-6)}`;
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

function formatJsonValue(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Collapsed turn rows need one stable summary line so long histories stay scannable.
 */
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

/**
 * New thread selections start with only the latest turn expanded to keep deep histories compact.
 */
function readDefaultExpandedTurnIds(
  thread: CodexAppServerThread | null,
): string[] {
  const lastTurnId = thread?.turns.at(-1)?.id;
  return lastTurnId ? [lastTurnId] : [];
}

function readSelectedThreadIsArchived(args: {
  selectedThread: CodexAppServerThread | null;
  detailState: CodexThreadBrowserDetailState;
}): boolean {
  if (args.detailState.kind === "archived") {
    return true;
  }

  return (
    args.selectedThread !== null &&
    codexThreadPathIsArchived(args.selectedThread.path)
  );
}

function ThreadRow(props: {
  thread: CodexThreadSidebarThread;
  isSelected: boolean;
  projectLabel?: string | null;
  relativeTimeReferenceMs?: number;
  onSelect?: (threadId: string) => void;
}) {
  const preview = readThreadPreview(props.thread.thread);
  const workspaceLabel = props.thread.showWorkspaceIndicator
    ? props.thread.workspaceLabel
    : null;

  return (
    <button
      type="button"
      className={clsx(
        "grid w-full gap-2 border px-3 py-3 text-left transition-colors",
        props.isSelected
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-900 hover:bg-slate-100",
      )}
      onClick={() => {
        props.onSelect?.(props.thread.id);
      }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-sm font-medium"
            title={props.thread.title}
          >
            {props.thread.title}
          </div>
          {preview ? (
            <div
              className={clsx(
                "truncate text-xs",
                props.isSelected ? "text-slate-300" : "text-slate-500",
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
            props.isSelected ? "text-slate-300" : "text-slate-500",
          )}
        >
          {formatRelativeTime(
            props.thread.thread.updatedAt,
            props.relativeTimeReferenceMs,
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <div
          className={clsx(
            "h-2 w-2 shrink-0 rounded-ui",
            props.thread.isLoaded
              ? props.isSelected
                ? "bg-emerald-300"
                : "bg-emerald-500"
              : props.isSelected
                ? "bg-slate-500"
                : "bg-slate-300",
          )}
        />
        <span
          className={clsx(
            "font-mono",
            props.isSelected ? "text-slate-300" : "text-slate-500",
          )}
          title={props.thread.id}
        >
          {readShortThreadId(props.thread.id)}
        </span>
        {props.projectLabel ? (
          <span
            className={clsx(
              "rounded-ui border px-1.5 py-0.5 font-mono",
              props.isSelected
                ? "border-amber-300/60 text-amber-100"
                : "border-amber-200 text-amber-700",
            )}
            title={props.thread.thread.project.rootCwd}
          >
            {props.projectLabel}
          </span>
        ) : null}
        {workspaceLabel ? (
          <span
            className={clsx(
              "rounded-ui border px-1.5 py-0.5 font-mono",
              props.isSelected
                ? "border-sky-400/50 text-sky-200"
                : "border-sky-200 text-sky-700",
            )}
            title={props.thread.workspaceTooltip ?? props.thread.thread.cwd}
          >
            {workspaceLabel}
          </span>
        ) : null}
        <span
          className={clsx(
            "rounded-ui border px-1.5 py-0.5 font-mono",
            props.isSelected
              ? "border-slate-600 text-slate-300"
              : "border-slate-300 text-slate-500",
          )}
        >
          {props.thread.thread.status.type}
        </span>
      </div>
    </button>
  );
}

function PinnedSection(props: {
  threads: CodexThreadSidebarThread[];
  selectedThreadId: string | null;
  relativeTimeReferenceMs?: number;
  onThreadSelect?: (threadId: string) => void;
}) {
  return (
    <section className="grid gap-2 border-b border-slate-200 pb-4">
      <div className="grid gap-1 px-1">
        <div className="flex items-center justify-between gap-3">
          <div className="truncate text-sm font-semibold text-slate-900">
            Pinned
          </div>
          <div className="shrink-0 text-[11px] font-medium text-slate-500">
            {props.threads.length}
          </div>
        </div>
        <div className="text-[11px] text-slate-500">
          Desktop-pinned threads stay outside the project groups.
        </div>
      </div>
      <div className="grid gap-2">
        {props.threads.map((thread) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            isSelected={thread.id === props.selectedThreadId}
            projectLabel={thread.thread.project.label}
            relativeTimeReferenceMs={props.relativeTimeReferenceMs}
            onSelect={props.onThreadSelect}
          />
        ))}
      </div>
    </section>
  );
}

function GroupSection(props: {
  group: CodexThreadBrowserGroup;
  selectedThreadId: string | null;
  relativeTimeReferenceMs?: number;
  onThreadSelect?: (threadId: string) => void;
}) {
  return (
    <section className="grid gap-2 border-t border-slate-200 pt-4 first:border-t-0 first:pt-0">
      <div className="grid gap-1 px-1">
        <div className="flex items-center justify-between gap-3">
          <div className="truncate text-sm font-semibold text-slate-900">
            {props.group.label}
          </div>
          <div className="shrink-0 text-[11px] font-medium text-slate-500">
            {props.group.count}
          </div>
        </div>
        <div
          className="truncate text-[11px] text-slate-500"
          title={props.group.detail}
        >
          {props.group.detail}
        </div>
        {props.group.loadedCount > 0 ? (
          <div className="text-[11px] text-emerald-700">
            {props.group.loadedCount} loaded
          </div>
        ) : null}
      </div>
      <div className="grid gap-2">
        {props.group.threads.map((thread) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            isSelected={thread.id === props.selectedThreadId}
            relativeTimeReferenceMs={props.relativeTimeReferenceMs}
            onSelect={props.onThreadSelect}
          />
        ))}
      </div>
    </section>
  );
}

function EmptyState(props: { title: string; body: string }) {
  return (
    <div className="border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-500">
      <div className="font-medium text-slate-800">{props.title}</div>
      <div className="mt-2 leading-6">{props.body}</div>
    </div>
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
      className="border border-slate-200 bg-slate-50"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="grid w-full gap-3 px-3 py-3 text-left transition-colors hover:bg-slate-100"
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
                "h-4 w-4 shrink-0 text-slate-500 transition-transform",
                props.isExpanded ? "rotate-180" : null,
              )}
            />
          </div>
          {preview ? (
            <div className="line-clamp-2 text-sm leading-6 text-slate-600">
              {preview}
            </div>
          ) : (
            <div aria-hidden="true" className="h-6" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-3 border-t border-slate-200 px-3 py-3">
        {props.turn.errorMessage ? (
          <div className="text-sm text-red-700">{props.turn.errorMessage}</div>
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

export function CodexThreadBrowserView(props: CodexThreadBrowserViewProps) {
  const fillViewport = props.fillViewport ?? true;
  const allowArchivedMode = props.allowArchivedMode ?? true;
  const headingEyebrow = props.headingEyebrow ?? "Local control";
  const headingTitle = props.headingTitle ?? "Codex threads";
  const headingDescription =
    props.headingDescription ??
    "Browse local Codex threads, inspect hydrated turns, and continue work from the browser.";
  const [expandedTurnIds, setExpandedTurnIds] = useState<string[]>(() =>
    readDefaultExpandedTurnIds(props.selectedThread),
  );
  const selectedThreadIsArchived = readSelectedThreadIsArchived({
    selectedThread: props.selectedThread,
    detailState: props.detailState,
  });
  const selectedThreadIsLoaded =
    props.selectedThread !== null &&
    props.loadedThreadIds.includes(props.selectedThread.id);
  const lastSelectedTurnId = props.selectedThread?.turns.at(-1)?.id ?? null;
  const visibleThreadCount =
    props.pinnedThreads.length +
    props.groups.reduce((total, group) => total + group.count, 0);
  const sendTurnDisabled =
    props.isBusy ||
    props.selectedThreadId === null ||
    selectedThreadIsArchived ||
    props.turnDraft.trim().length === 0;

  // Reset expansion only when the selected thread changes or a newer turn arrives.
  useEffect(() => {
    setExpandedTurnIds(lastSelectedTurnId ? [lastSelectedTurnId] : []);
  }, [lastSelectedTurnId, props.selectedThread?.id]);

  return (
    <div
      className={clsx(
        "bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] text-slate-950",
        fillViewport ? "min-h-screen" : null,
      )}
    >
      <div
        className="mx-auto grid max-w-[1680px] gap-4 px-4 py-4 md:px-6"
        data-testid="codex-thread-browser-view"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          <div className="grid gap-1">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              {headingEyebrow}
            </div>
            <div className="font-mono text-xl font-semibold">
              {headingTitle}
            </div>
            <div className="text-sm text-slate-600">{headingDescription}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {allowArchivedMode ? (
              <>
                <Button
                  variant={
                    props.browserMode === "active" ? "default" : "outline"
                  }
                  size="sm"
                  disabled={props.isBusy}
                  onClick={() => {
                    props.onBrowserModeChange?.("active");
                  }}
                >
                  Active
                </Button>
                <Button
                  variant={
                    props.browserMode === "archived" ? "default" : "outline"
                  }
                  size="sm"
                  disabled={props.isBusy}
                  onClick={() => {
                    props.onBrowserModeChange?.("archived");
                  }}
                >
                  Archived
                </Button>
              </>
            ) : null}
            {props.labHref ? (
              <Button asChild variant="outline" size="sm">
                <a href={props.labHref}>Open protocol lab</a>
              </Button>
            ) : null}
          </div>
        </div>

        {props.errorMessage ? (
          <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {props.errorMessage}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card>
            <CardHeader className="gap-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="font-mono text-base">
                  Pinned and projects
                </CardTitle>
                <div className="text-xs text-slate-500">
                  {visibleThreadCount} visible
                </div>
              </div>
              <Input
                placeholder="Search thread title, prompt, id, or path"
                value={props.searchTerm}
                onChange={(event) => {
                  props.onSearchTermChange?.(event.target.value);
                }}
              />
            </CardHeader>
            <CardContent className="grid max-h-[calc(100vh-220px)] gap-4 overflow-auto">
              {props.pinnedThreads.length === 0 && props.groups.length === 0 ? (
                <EmptyState
                  title={
                    props.browserMode === "archived"
                      ? "No archived threads"
                      : "No matching threads"
                  }
                  body={
                    props.browserMode === "archived"
                      ? "Archive a thread from the active view to test the cold-storage workflow."
                      : "Adjust the search term to inspect a different slice of the local provider inventory."
                  }
                />
              ) : null}
              {props.pinnedThreads.length > 0 ? (
                <PinnedSection
                  threads={props.pinnedThreads}
                  selectedThreadId={props.selectedThreadId}
                  relativeTimeReferenceMs={props.relativeTimeReferenceMs}
                  onThreadSelect={props.onThreadSelect}
                />
              ) : null}
              {props.groups.map((group) => (
                <GroupSection
                  key={group.id}
                  group={group}
                  selectedThreadId={props.selectedThreadId}
                  relativeTimeReferenceMs={props.relativeTimeReferenceMs}
                  onThreadSelect={props.onThreadSelect}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-2">
                  <CardTitle className="font-mono text-base">
                    {props.selectedThread
                      ? readThreadTitle(props.selectedThread)
                      : "Thread detail"}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {props.browserMode === "archived" ? "archived" : "active"}
                    </Badge>
                    {props.selectedThread ? (
                      <Badge variant="outline">
                        {props.selectedThread.sourceLabel}
                      </Badge>
                    ) : null}
                    {selectedThreadIsLoaded ? (
                      <Badge className="bg-emerald-600 text-white">
                        loaded
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={props.isBusy || props.selectedThreadId === null}
                    onClick={props.onRefresh}
                  >
                    Refresh
                  </Button>
                  {allowArchivedMode ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          props.isBusy ||
                          props.selectedThreadId === null ||
                          selectedThreadIsArchived
                        }
                        onClick={props.onResumeSelected}
                      >
                        Resume
                      </Button>
                      {selectedThreadIsArchived ? (
                        <Button
                          size="sm"
                          disabled={
                            props.isBusy || props.selectedThreadId === null
                          }
                          onClick={props.onUnarchiveSelected}
                        >
                          Unarchive
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            props.isBusy || props.selectedThreadId === null
                          }
                          onClick={props.onArchiveSelected}
                        >
                          Archive
                        </Button>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              {!props.selectedThread ? (
                <EmptyState
                  title="No thread selected"
                  body="Pick a thread from the left sidebar to inspect its preview, metadata, and hydrated turn history."
                />
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Preview</span>
                        <span
                          className="font-mono text-[11px]"
                          title={props.selectedThread.id}
                        >
                          {props.selectedThread.id}
                        </span>
                      </div>
                      <div className="rounded-ui border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-800">
                        {props.selectedThread.preview}
                      </div>
                    </div>
                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Updated</span>
                        <span className="font-mono text-xs">
                          {formatDateTime(props.selectedThread.updatedAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Created</span>
                        <span className="font-mono text-xs">
                          {formatDateTime(props.selectedThread.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Branch</span>
                        <span className="font-mono text-xs">
                          {props.selectedThread.gitInfo?.branch ?? "n/a"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Project root</span>
                        <span
                          className="max-w-[360px] truncate font-mono text-xs"
                          title={props.selectedThread.project.rootCwd}
                        >
                          {props.selectedThread.project.rootCwd}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Workspace</span>
                        <span className="font-mono text-xs">
                          {readThreadWorkspaceLabel(props.selectedThread) ??
                            "project root"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Path</span>
                        <span
                          className="max-w-[360px] truncate font-mono text-xs"
                          title={props.selectedThread.path ?? "n/a"}
                        >
                          {props.selectedThread.path ?? "n/a"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">CWD</span>
                        <span
                          className="max-w-[360px] truncate font-mono text-xs"
                          title={props.selectedThread.cwd}
                        >
                          {props.selectedThread.cwd}
                        </span>
                      </div>
                    </div>
                  </div>

                  {props.detailState.kind === "loading" ? (
                    <EmptyState
                      title="Loading thread detail"
                      body="Hydrating the selected thread from the provider runtime."
                    />
                  ) : null}

                  <div className="grid gap-3 border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="grid gap-1">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Continue thread
                        </div>
                        <div className="text-sm text-slate-600">
                          Send a prompt to the selected Codex thread.
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">
                        {selectedThreadIsArchived
                          ? "Unarchive before sending"
                          : selectedThreadIsLoaded
                            ? "Loaded in runtime"
                            : "Will resume on send"}
                      </div>
                    </div>
                    <Textarea
                      value={props.turnDraft}
                      onChange={(event) => {
                        props.onTurnDraftChange?.(event.target.value);
                      }}
                      placeholder="Continue this thread from the browser..."
                      disabled={
                        props.selectedThreadId === null ||
                        selectedThreadIsArchived
                      }
                      className="min-h-[128px] border-slate-200 bg-slate-50 font-mono text-sm"
                    />
                    <div className="flex justify-end">
                      <Button
                        disabled={sendTurnDisabled}
                        onClick={props.onTurnSubmit}
                      >
                        {props.isBusy ? "Sending..." : "Send prompt"}
                      </Button>
                    </div>
                  </div>

                  {props.detailState.kind === "archived" ? (
                    <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      {props.detailState.message}
                    </div>
                  ) : null}

                  {props.detailState.kind === "error" ? (
                    <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {props.detailState.message}
                    </div>
                  ) : null}

                  {props.detailState.kind === "ready" &&
                  props.selectedThread.turns.length > 0 ? (
                    <div className="grid gap-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
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
                  ) : null}

                  {props.detailState.kind === "ready" &&
                  props.selectedThread.turns.length === 0 ? (
                    <EmptyState
                      title="No hydrated turns"
                      body="This thread is visible in inventory, but the provider did not return any hydrated turns for the current detail read."
                    />
                  ) : null}

                  {props.detailState.kind === "ready" &&
                  props.selectedThread.raw !== null &&
                  props.selectedThread.raw !== undefined ? (
                    <div className="grid gap-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Raw thread JSON
                      </div>
                      <pre
                        className="max-h-[480px] overflow-auto border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-6 text-slate-100"
                        title={formatJsonValue(props.selectedThread.raw)}
                      >
                        <code>{formatJsonValue(props.selectedThread.raw)}</code>
                      </pre>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
