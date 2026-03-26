import { Badge } from "@/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import { CodexAppServerThreadHistoryItemCard } from "@/components/CodexAppServerThreadHistoryItemCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CodexAppServerThread } from "@/lib/codexAppServerResearch";
import { clsx } from "clsx";

export type CodexThreadBrowserMode = "active" | "archived";

export type CodexThreadBrowserProject = {
  id: string;
  label: string;
  detail: string;
  count: number;
  loadedCount: number;
};

export type CodexThreadBrowserDetailState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "archived"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready" };

type CodexThreadBrowserViewProps = {
  browserMode: CodexThreadBrowserMode;
  projects: CodexThreadBrowserProject[];
  selectedProjectId: string;
  searchTerm: string;
  threads: CodexAppServerThread[];
  loadedThreadIds: string[];
  selectedThreadId: string | null;
  selectedThread: CodexAppServerThread | null;
  detailState: CodexThreadBrowserDetailState;
  errorMessage?: string | null;
  isBusy: boolean;
  labHref?: string;
  onBrowserModeChange?: (mode: CodexThreadBrowserMode) => void;
  onProjectSelect?: (projectId: string) => void;
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
 * Use a compact relative label so the browser list reads more like the Codex
 * sidebar than the detail-heavy protocol research page.
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

function threadIsArchived(thread: CodexAppServerThread): boolean {
  return thread.path?.includes("/archived_sessions/") ?? false;
}

function readFirstNonEmptyLine(value: string): string {
  const firstLine = value
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine ?? value.trim();
}

function readPathLeaf(value: string): string {
  const normalized = value.split("\\").join("/");
  const segments = normalized
    .split("/")
    .filter((segment: string) => segment.length > 0);
  return segments[segments.length - 1] ?? value;
}

function readThreadTitle(thread: CodexAppServerThread): string {
  const explicitName = thread.name?.trim();
  if (explicitName) {
    return explicitName;
  }

  return readFirstNonEmptyLine(thread.preview);
}

function readThreadSubtitle(thread: CodexAppServerThread): string {
  const previewLine = readFirstNonEmptyLine(thread.preview);
  const title = readThreadTitle(thread);
  if (previewLine !== title) {
    return previewLine;
  }

  return readPathLeaf(thread.cwd);
}

function ThreadRow(props: {
  thread: CodexAppServerThread;
  isSelected: boolean;
  isLoaded: boolean;
  onSelect?: (threadId: string) => void;
}) {
  const handleSelect = () => {
    props.onSelect?.(props.thread.id);
  };

  return (
    <button
      type="button"
      className={clsx(
        "grid w-full gap-1 border px-3 py-2 text-left transition-colors",
        props.isSelected
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-900 hover:bg-slate-100",
      )}
      onClick={handleSelect}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-sm font-medium"
            title={readThreadTitle(props.thread)}
          >
            {readThreadTitle(props.thread)}
          </div>
          <div
            className={clsx(
              "truncate text-xs",
              props.isSelected ? "text-slate-300" : "text-slate-500",
            )}
            title={readThreadSubtitle(props.thread)}
          >
            {readThreadSubtitle(props.thread)}
          </div>
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
      <div className="flex items-center gap-2 text-[11px]">
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
            "truncate",
            props.isSelected ? "text-slate-300" : "text-slate-500",
          )}
          title={props.thread.cwd}
        >
          {readPathLeaf(props.thread.cwd)}
        </span>
      </div>
    </button>
  );
}

function ProjectRow(props: {
  project: CodexThreadBrowserProject;
  isSelected: boolean;
  onSelect?: (projectId: string) => void;
}) {
  return (
    <button
      type="button"
      className={clsx(
        "grid w-full gap-1 border px-3 py-2 text-left transition-colors",
        props.isSelected
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-900 hover:bg-slate-100",
      )}
      onClick={() => {
        props.onSelect?.(props.project.id);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-sm font-medium">
          {props.project.label}
        </div>
        <div
          className={clsx(
            "shrink-0 text-[11px] font-medium",
            props.isSelected ? "text-slate-300" : "text-slate-500",
          )}
        >
          {props.project.count}
        </div>
      </div>
      <div
        className={clsx(
          "truncate text-[11px]",
          props.isSelected ? "text-slate-300" : "text-slate-500",
        )}
        title={props.project.detail}
      >
        {props.project.detail}
      </div>
      {props.project.loadedCount > 0 ? (
        <div
          className={clsx(
            "text-[11px]",
            props.isSelected ? "text-emerald-300" : "text-emerald-700",
          )}
        >
          {props.project.loadedCount} loaded
        </div>
      ) : null}
    </button>
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

export function CodexThreadBrowserView(props: CodexThreadBrowserViewProps) {
  const selectedThreadIsArchived =
    props.selectedThread !== null && threadIsArchived(props.selectedThread);
  const selectedThreadIsLoaded =
    props.selectedThread !== null &&
    props.loadedThreadIds.includes(props.selectedThread.id);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] text-slate-950">
      <div
        className="mx-auto grid max-w-[1680px] gap-4 px-4 py-4 md:px-6"
        data-testid="codex-thread-browser-view"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          <div className="grid gap-1">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Research Surface
            </div>
            <div className="font-mono text-xl font-semibold">
              Codex Thread Browser
            </div>
            <div className="text-sm text-slate-600">
              A Codex-style thread browser driven by the local{" "}
              <code>codex app-server</code> inventory.
            </div>
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

        <div className="grid gap-4 xl:grid-cols-[240px_320px_minmax(0,1fr)]">
          <Card cornerNotch={0}>
            <CardHeader>
              <CardTitle className="font-mono text-base">Projects</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {props.projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  isSelected={project.id === props.selectedProjectId}
                  onSelect={props.onProjectSelect}
                />
              ))}
            </CardContent>
          </Card>

          <Card cornerNotch={0}>
            <CardHeader className="gap-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="font-mono text-base">Threads</CardTitle>
                <div className="text-xs text-slate-500">
                  {props.loadedThreadIds.length} loaded
                </div>
              </div>
              <Input
                placeholder="Search thread title"
                value={props.searchTerm}
                onChange={(event) => {
                  props.onSearchTermChange?.(event.target.value);
                }}
              />
            </CardHeader>
            <CardContent className="grid max-h-[calc(100vh-220px)] gap-2 overflow-auto">
              {props.threads.length === 0 ? (
                <EmptyState
                  title={
                    props.browserMode === "archived"
                      ? "No archived threads"
                      : "No matching threads"
                  }
                  body={
                    props.browserMode === "archived"
                      ? "Archive a thread from the active view to test the cold-storage workflow."
                      : "Adjust the project filter or search term to inspect a different slice of the local provider inventory."
                  }
                />
              ) : null}
              {props.threads.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  isSelected={thread.id === props.selectedThreadId}
                  isLoaded={props.loadedThreadIds.includes(thread.id)}
                  onSelect={props.onThreadSelect}
                />
              ))}
            </CardContent>
          </Card>

          <Card cornerNotch={0}>
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
                  body="Pick a thread from the middle column to inspect its preview, metadata, and hydrated turn history."
                />
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Preview</span>
                        <span className="font-mono text-[11px]">
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
                              <CodexAppServerThreadHistoryItemCard
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
                      body="This thread is visible in inventory, but the provider did not return any hydrated turns for the current detail read."
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
