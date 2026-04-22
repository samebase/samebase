import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import { ThreadHistoryItemCard } from "@/components/ThreadHistoryItemCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type ThreadBrowserDetailState,
  type ThreadBrowserGroup,
  type ThreadBrowserMode,
  type ThreadBrowserThread,
} from "@/lib/threadBrowser";
import { clsx } from "clsx";
import { type ReactNode } from "react";

export type ThreadBrowserViewProps = {
  browserMode: ThreadBrowserMode;
  pinnedThreads: ThreadBrowserThread[];
  groups: ThreadBrowserGroup[];
  searchTerm: string;
  loadedThreadIds: string[];
  selectedThreadId: string | null;
  selectedThread: ThreadBrowserThread | null;
  detailState: ThreadBrowserDetailState;
  eyebrow?: string;
  title: string;
  description: ReactNode;
  errorMessage?: string | null;
  isBusy: boolean;
  labHref?: string;
  labLabel?: string;
  onBrowserModeChange?: (mode: ThreadBrowserMode) => void;
  onSearchTermChange?: (value: string) => void;
  onThreadSelect?: (threadId: string) => void;
  onRefresh?: () => void;
  onResumeSelected?: () => void;
  onArchiveSelected?: () => void;
  onUnarchiveSelected?: () => void;
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
function formatRelativeTime(value: number): string {
  const now = Date.now();
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

function readThreadPreview(thread: ThreadBrowserThread): string | null {
  const previewLine = readFirstNonEmptyLine(thread.preview);
  if (previewLine === thread.title) {
    return null;
  }

  return previewLine;
}

function readThreadWorkspaceLabel(thread: ThreadBrowserThread): string | null {
  if (thread.workspace.isProjectRoot) {
    return null;
  }

  return thread.workspace.label;
}

function ThreadRow(props: {
  thread: ThreadBrowserThread;
  isSelected: boolean;
  isLoaded: boolean;
  projectLabel?: string | null;
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
          {formatRelativeTime(props.thread.updatedAt)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <div
          className={clsx(
            "h-2 w-2 shrink-0 rounded-full",
            props.isLoaded
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
            title={props.thread.project.rootPath}
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
            title={props.thread.cwd}
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
          {props.thread.statusLabel}
        </span>
      </div>
    </button>
  );
}

function PinnedSection(props: {
  threads: ThreadBrowserThread[];
  loadedThreadIds: string[];
  selectedThreadId: string | null;
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
          Pinned threads stay outside the project groups.
        </div>
      </div>
      <div className="grid gap-2">
        {props.threads.map((thread) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            isSelected={thread.id === props.selectedThreadId}
            isLoaded={props.loadedThreadIds.includes(thread.id)}
            projectLabel={thread.project.label}
            onSelect={props.onThreadSelect}
          />
        ))}
      </div>
    </section>
  );
}

function GroupSection(props: {
  group: ThreadBrowserGroup;
  loadedThreadIds: string[];
  selectedThreadId: string | null;
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
            isLoaded={props.loadedThreadIds.includes(thread.id)}
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

export function ThreadBrowserView(props: ThreadBrowserViewProps) {
  const selectedThreadIsArchived = props.selectedThread?.isArchived ?? false;
  const selectedThreadIsLoaded =
    props.selectedThread !== null &&
    props.loadedThreadIds.includes(props.selectedThread.id);
  const visibleThreadCount =
    props.pinnedThreads.length +
    props.groups.reduce((total, group) => total + group.count, 0);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] text-slate-950">
      <div
        className="mx-auto grid max-w-[1680px] gap-4 px-4 py-4 md:px-6"
        data-testid="thread-browser-view"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          <div className="grid gap-1">
            {props.eyebrow ? (
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                {props.eyebrow}
              </div>
            ) : null}
            <div className="font-mono text-xl font-semibold">{props.title}</div>
            <div className="text-sm text-slate-600">{props.description}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={props.browserMode === "active" ? "default" : "outline"}
              size="sm"
              disabled={props.isBusy}
              onClick={() => {
                props.onBrowserModeChange?.("active");
              }}
            >
              Active
            </Button>
            <Button
              variant={props.browserMode === "archived" ? "default" : "outline"}
              size="sm"
              disabled={props.isBusy}
              onClick={() => {
                props.onBrowserModeChange?.("archived");
              }}
            >
              Archived
            </Button>
            {props.labHref ? (
              <Button asChild variant="outline" size="sm">
                <a href={props.labHref}>
                  {props.labLabel ?? "Open linked surface"}
                </a>
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
                      : "Adjust the search term to inspect a different slice of the available thread inventory."
                  }
                />
              ) : null}
              {props.pinnedThreads.length > 0 ? (
                <PinnedSection
                  threads={props.pinnedThreads}
                  loadedThreadIds={props.loadedThreadIds}
                  selectedThreadId={props.selectedThreadId}
                  onThreadSelect={props.onThreadSelect}
                />
              ) : null}
              {props.groups.map((group) => (
                <GroupSection
                  key={group.id}
                  group={group}
                  loadedThreadIds={props.loadedThreadIds}
                  selectedThreadId={props.selectedThreadId}
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
                    {props.selectedThread?.title ?? "Thread detail"}
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
                      disabled={props.isBusy || props.selectedThreadId === null}
                      onClick={props.onUnarchiveSelected}
                    >
                      Unarchive
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={props.isBusy || props.selectedThreadId === null}
                      onClick={props.onArchiveSelected}
                    >
                      Archive
                    </Button>
                  )}
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
                          {props.selectedThread.branch ?? "n/a"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Project root</span>
                        <span
                          className="max-w-[360px] truncate font-mono text-xs"
                          title={props.selectedThread.project.rootPath}
                        >
                          {props.selectedThread.project.rootPath}
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
                      body="Hydrating the selected thread from the connected runtime."
                    />
                  ) : null}

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
                        <div
                          key={turn.id}
                          className="grid gap-3 border border-slate-200 bg-slate-50 p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-mono text-sm">{turn.id}</div>
                            <Badge variant="outline">{turn.status}</Badge>
                            <Badge variant="outline">
                              {turn.items.length} item
                              {turn.items.length === 1 ? "" : "s"}
                            </Badge>
                          </div>
                          {turn.errorMessage ? (
                            <div className="text-sm text-red-700">
                              {turn.errorMessage}
                            </div>
                          ) : null}
                          <div className="grid gap-2">
                            {turn.items.map((item, index) => (
                              <ThreadHistoryItemCard
                                key={`${turn.id}-${item.id ?? item.type}-${index}`}
                                item={item}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {props.detailState.kind === "ready" &&
                  props.selectedThread.turns.length === 0 ? (
                    <EmptyState
                      title="No hydrated turns"
                      body="This thread is visible in inventory, but the current detail source did not return hydrated turns."
                    />
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
