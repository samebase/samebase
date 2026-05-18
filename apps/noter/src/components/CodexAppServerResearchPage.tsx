import { Badge } from "@/components/ui/badge";
import { ConnectedMachineHeartbeatLogSection } from "@/components/ConnectedMachineHeartbeatLog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CodexAppServerThreadHistoryItemCard } from "@/components/CodexAppServerThreadHistoryItemCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  CODEX_APP_SERVER_RESEARCH_API_BASE,
  CODEX_APP_SERVER_RESEARCH_ROUTE,
  CODEX_APP_SERVER_THREAD_BROWSER_ROUTE,
  requestCodexAppServerJson as requestJson,
  type CodexAppServerApprovalRequest,
  type CodexAppServerEventsResponse,
  type CodexAppServerProtocolResponse,
  type CodexAppServerRequestsResponse,
  type CodexAppServerRuntimeSnapshot,
  type CodexAppServerStatusResponse,
  type CodexAppServerThread,
  type CodexAppServerThreadDetailResponse,
  type CodexAppServerThreadListSortKey,
  type CodexAppServerThreadsResponse,
  type CodexAppServerResearchEvent,
} from "@/lib/codexAppServerResearch";
import { buildCodexResearchRouteSearch } from "@/lib/codexResearchRouteSearch";
import { useConnectedMachineHeartbeatLog } from "@/lib/connectedMachineHeartbeatLog";
import { useNow } from "@/hooks/useNow";
import { getRouteApi, linkOptions, useRouter } from "@tanstack/react-router";
import { clsx } from "clsx";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { resolveConnectedMachineStatus } from "../../shared/connectedMachinePresence";
import { api } from "../../convex/_generated/api";

type RuntimeFormState = {
  cwd: string;
  model: string;
  approvalPolicy: string;
  sandbox: string;
  personality: string;
  persistExtendedHistory: boolean;
};

type TurnFormState = {
  threadId: string;
  prompt: string;
  effort: string;
  timeoutMs: string;
  summary: string;
};

type InterruptFormState = {
  threadId: string;
  turnId: string;
};

type ThreadListQueryState = {
  searchTerm: string;
  sortKey: CodexAppServerThreadListSortKey;
};

type ThreadActionResponse = {
  result?: unknown;
  runtime: CodexAppServerRuntimeSnapshot;
};

const DEFAULT_TURN_PROMPT =
  "Reply with exactly the word READY and nothing else.";
const THREAD_LIST_LIMIT = 100;
const DEFAULT_THREAD_LIST_QUERY: ThreadListQueryState = {
  searchTerm: "",
  sortKey: "updated_at",
};
type ProtocolMode = "json-schema" | "ts";

const codexResearchRouteApi = getRouteApi(CODEX_APP_SERVER_RESEARCH_ROUTE);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
}

function normalizeTimestampToMilliseconds(value: number): number {
  return value < 10_000_000_000 ? value * 1000 : value;
}

function formatTimestamp(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "n/a";
  }

  return new Date(normalizeTimestampToMilliseconds(value)).toLocaleTimeString();
}

function formatDateTime(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "n/a";
  }

  return new Date(normalizeTimestampToMilliseconds(value)).toLocaleString();
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function readCurrentThreadId(value: unknown): string | null {
  const runtime = asRecord(asRecord(value)?.runtime);
  return typeof runtime?.currentThreadId === "string"
    ? runtime.currentThreadId
    : null;
}

function getEventListKey(args: {
  scope: "normalized" | "raw";
  event: CodexAppServerResearchEvent;
  index: number;
}): string {
  return `${args.scope}-${args.event.cursor}-${args.event.method}-${args.index}`;
}

function getThreadStatusLabel(thread: CodexAppServerThread): string {
  if (thread.status.type === "active" && thread.status.activeFlags.length > 0) {
    return `active:${thread.status.activeFlags.join(",")}`;
  }

  return thread.status.type;
}

function readProtocolRequestPath(args: {
  mode: ProtocolMode;
  experimental: boolean;
}): string {
  const pathname =
    args.mode === "json-schema" ? "/protocol/json-schema" : "/protocol/ts";
  if (!args.experimental) {
    return pathname;
  }

  const searchParams = new URLSearchParams();
  searchParams.set("experimental", "true");
  return `${pathname}?${searchParams.toString()}`;
}

function buildCodexThreadBrowserLinkOptions(selectedThreadId: string | null) {
  return linkOptions({
    to: CODEX_APP_SERVER_THREAD_BROWSER_ROUTE,
    search: buildCodexResearchRouteSearch(selectedThreadId),
  });
}

function RuntimeStatusBadge(props: {
  status: CodexAppServerStatusResponse | null;
}) {
  const { status } = props;
  if (!status) {
    return <Badge variant="outline">Loading</Badge>;
  }

  if (!status.codexInstalled) {
    return <Badge variant="destructive">Codex missing</Badge>;
  }

  if (status.runtime.running && status.runtime.initialized) {
    return <Badge className="bg-emerald-600 text-white">Runtime ready</Badge>;
  }

  if (status.runtime.running) {
    return <Badge variant="secondary">Starting</Badge>;
  }

  return <Badge variant="outline">Stopped</Badge>;
}

function EventLevelBadge(props: {
  level: "info" | "success" | "warning" | "error";
}) {
  const className =
    props.level === "success"
      ? "bg-emerald-600 text-white"
      : props.level === "warning"
        ? "bg-amber-500 text-black"
        : props.level === "error"
          ? "bg-red-600 text-white"
          : "bg-slate-200 text-slate-900";

  return <Badge className={className}>{props.level}</Badge>;
}

function ThreadStatusBadge(props: { thread: CodexAppServerThread }) {
  const className =
    props.thread.status.type === "active"
      ? "bg-emerald-600 text-white"
      : props.thread.status.type === "systemError"
        ? "bg-red-600 text-white"
        : "bg-slate-200 text-slate-900";

  return (
    <Badge className={className}>{getThreadStatusLabel(props.thread)}</Badge>
  );
}

function ProtocolFilesViewer(props: {
  protocol: CodexAppServerProtocolResponse | null;
  activeFilePath: string | null;
  onSelectFile: (path: string) => void;
}) {
  const activeFile =
    props.protocol?.files.find((file) => file.path === props.activeFilePath) ??
    props.protocol?.files[0] ??
    null;

  return (
    <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="border border-border bg-white">
        <div className="border-b border-border px-3 py-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
          Files
        </div>
        <div className="max-h-[280px] overflow-auto">
          {props.protocol?.files.map((file) => (
            <button
              key={file.path}
              type="button"
              className={clsx(
                "block w-full border-b border-border px-3 py-2 text-left text-xs font-medium",
                file.path === activeFile?.path
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-900 hover:bg-slate-100",
              )}
              onClick={() => {
                props.onSelectFile(file.path);
              }}
            >
              {file.path}
            </button>
          ))}
          {props.protocol?.files.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              No files.
            </div>
          ) : null}
        </div>
      </div>
      <Textarea
        readOnly
        value={activeFile?.content ?? ""}
        className="min-h-[320px] font-mono text-xs"
      />
    </div>
  );
}

function SelectedThreadDetailPanel(props: {
  thread: CodexAppServerThread | null;
  selectedThreadId: string | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  isBusy: boolean;
  browserViewHref: string;
}) {
  return (
    <div className="grid gap-4 border border-border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Selected thread
        </div>
        <Button
          variant="outline"
          disabled={props.isBusy || !props.selectedThreadId}
          onClick={props.onRefresh}
        >
          Refresh detail
        </Button>
      </div>

      {!props.selectedThreadId ? (
        <div className="border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
          Use the{" "}
          <a
            href={props.browserViewHref}
            className="font-medium text-slate-900 underline underline-offset-2"
          >
            browser view
          </a>{" "}
          to choose a local provider thread, then return here for detail and
          control actions.
        </div>
      ) : null}

      {props.selectedThreadId && props.isLoading ? (
        <div className="border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
          Loading thread detail for {props.selectedThreadId}.
        </div>
      ) : null}

      {props.selectedThreadId && props.error ? (
        <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {props.error}
        </div>
      ) : null}

      {props.thread && props.thread.id === props.selectedThreadId ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Status</span>
                <ThreadStatusBadge thread={props.thread} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Provider thread</span>
                <span className="font-mono text-xs">{props.thread.id}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Source</span>
                <span className="font-mono text-xs">
                  {props.thread.sourceLabel}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Model provider</span>
                <span className="font-mono text-xs">
                  {props.thread.modelProvider ?? "n/a"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Turns</span>
                <span className="font-mono text-xs">
                  {props.thread.turns.length}
                </span>
              </div>
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Created</span>
                <span className="font-mono text-xs">
                  {formatDateTime(props.thread.createdAt)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Updated</span>
                <span className="font-mono text-xs">
                  {formatDateTime(props.thread.updatedAt)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Path</span>
                <span className="font-mono text-xs">
                  {props.thread.path ?? "n/a"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Branch</span>
                <span className="font-mono text-xs">
                  {props.thread.gitInfo?.branch ?? "n/a"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">CWD</span>
                <span className="font-mono text-xs">{props.thread.cwd}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-2 border border-border bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Preview
            </div>
            <div className="text-sm text-slate-800">{props.thread.preview}</div>
          </div>

          <div className="grid gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Turn history
            </div>
            {props.thread.turns.length === 0 ? (
              <div className="border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                No hydrated turns returned for this thread.
              </div>
            ) : null}
            {props.thread.turns.map((turn) => (
              <div
                key={turn.id}
                className="grid gap-3 border border-border bg-slate-50 p-3"
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

          <div className="grid gap-3 border border-border bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Raw thread JSON
            </div>
            <Textarea
              readOnly
              value={formatJson(props.thread.raw)}
              className="min-h-[260px] font-mono text-xs"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

export function CodexAppServerSelectedThreadCard(props: {
  threadsCount: number;
  hasMoreThreads: boolean;
  browserViewHref: string;
  thread: CodexAppServerThread | null;
  selectedThreadId: string | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  isBusy: boolean;
}) {
  const loadedThreadSummary = `${props.threadsCount} loaded thread${
    props.threadsCount === 1 ? "" : "s"
  }${props.hasMoreThreads ? " with more available" : ""}.`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-base">Selected thread</CardTitle>
        <CardDescription className="max-w-4xl text-sm leading-6">
          {loadedThreadSummary} Use the{" "}
          <a
            href={props.browserViewHref}
            className="font-medium text-slate-900 underline underline-offset-2"
          >
            browser view
          </a>{" "}
          to browse and switch threads; this page stays focused on detailed
          inspection and runtime controls.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SelectedThreadDetailPanel
          thread={props.thread}
          selectedThreadId={props.selectedThreadId}
          isLoading={props.isLoading}
          error={props.error}
          onRefresh={props.onRefresh}
          isBusy={props.isBusy}
          browserViewHref={props.browserViewHref}
        />
      </CardContent>
    </Card>
  );
}

export function CodexAppServerResearchPage() {
  const router = useRouter();
  const navigate = codexResearchRouteApi.useNavigate();
  const routeSearch = codexResearchRouteApi.useSearch();
  const connectedMachinesQuery = useQuery(
    api.connectedMachines.listConnectedMachines,
  );
  const now = useNow({
    enabled: (connectedMachinesQuery?.length ?? 0) > 0,
    intervalMs: 1_000,
  });
  const [status, setStatus] = useState<CodexAppServerStatusResponse | null>(
    null,
  );
  const [events, setEvents] = useState<CodexAppServerResearchEvent[]>([]);
  const [requests, setRequests] = useState<CodexAppServerApprovalRequest[]>([]);
  const [threads, setThreads] = useState<CodexAppServerThread[]>([]);
  const [nextThreadCursor, setNextThreadCursor] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    () => routeSearch.threadId ?? null,
  );
  const [selectedThread, setSelectedThread] =
    useState<CodexAppServerThread | null>(null);
  const [selectedThreadError, setSelectedThreadError] = useState<string | null>(
    null,
  );
  const [isSelectedThreadLoading, setIsSelectedThreadLoading] = useState(false);
  const [protocol, setProtocol] =
    useState<CodexAppServerProtocolResponse | null>(null);
  const [protocolMode, setProtocolMode] = useState<ProtocolMode>("json-schema");
  const [protocolExperimental, setProtocolExperimental] = useState(true);
  const [activeProtocolFilePath, setActiveProtocolFilePath] = useState<
    string | null
  >(null);
  const [lastResponse, setLastResponse] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [runtimeForm, setRuntimeForm] = useState<RuntimeFormState>({
    cwd: "",
    model: "",
    approvalPolicy: "",
    sandbox: "workspace-write",
    personality: "",
    persistExtendedHistory: false,
  });
  const [resumeThreadId, setResumeThreadId] = useState("");
  const [turnForm, setTurnForm] = useState<TurnFormState>({
    threadId: "",
    prompt: DEFAULT_TURN_PROMPT,
    effort: "",
    timeoutMs: "",
    summary: "",
  });
  const [interruptForm, setInterruptForm] = useState<InterruptFormState>({
    threadId: "",
    turnId: "",
  });
  const nextCursorRef = useRef(0);
  const selectedThreadRequestRef = useRef(0);

  const refreshStatus = async () => {
    const nextStatus = await requestJson<CodexAppServerStatusResponse>({
      path: "/status",
    });
    setStatus(nextStatus);
    setRuntimeForm((current) =>
      current.cwd.length > 0
        ? current
        : {
            ...current,
            cwd: nextStatus.workspaceRoot,
          },
    );
    return nextStatus;
  };

  const refreshRequests = async () => {
    const nextRequests = await requestJson<CodexAppServerRequestsResponse>({
      path: "/requests",
    });
    setRequests(nextRequests.requests);
    return nextRequests;
  };

  const refreshEvents = async () => {
    const response = await requestJson<CodexAppServerEventsResponse>({
      path: `/events?since=${nextCursorRef.current}`,
    });
    nextCursorRef.current = response.nextCursor;
    if (response.events.length === 0) {
      return response;
    }

    setEvents((current) => {
      const mergedByCursor = new Map<number, CodexAppServerResearchEvent>();
      for (const event of current) {
        mergedByCursor.set(event.cursor, event);
      }
      for (const event of response.events) {
        mergedByCursor.set(event.cursor, event);
      }
      return Array.from(mergedByCursor.values()).slice(-200);
    });
    return response;
  };

  function buildThreadsPath(query: ThreadListQueryState): string {
    const searchParams = new URLSearchParams();
    const trimmedSearchTerm = query.searchTerm.trim();
    searchParams.set("limit", `${THREAD_LIST_LIMIT}`);
    searchParams.set("sortKey", query.sortKey);
    if (trimmedSearchTerm.length > 0) {
      searchParams.set("searchTerm", trimmedSearchTerm);
    }
    return `/threads?${searchParams.toString()}`;
  }

  const refreshThreads = async (
    query: ThreadListQueryState = DEFAULT_THREAD_LIST_QUERY,
  ) => {
    const response = await requestJson<CodexAppServerThreadsResponse>({
      path: buildThreadsPath(query),
    });
    setThreads(response.threads);
    setNextThreadCursor(response.nextCursor);
    setSelectedThreadId((current) => {
      if (typeof current === "string") {
        return current;
      }
      return response.threads.length > 0 ? response.threads[0].id : null;
    });
    setSelectedThread((current) => {
      if (!current) {
        return current;
      }

      const refreshedSummary = response.threads.find(
        (thread) => thread.id === current.id,
      );
      return refreshedSummary
        ? {
            ...current,
            ...refreshedSummary,
            turns: current.turns,
          }
        : current;
    });
    return response;
  };

  const refreshSelectedThread = async (
    threadId: string | null = selectedThreadId,
  ) => {
    const requestId = selectedThreadRequestRef.current + 1;
    selectedThreadRequestRef.current = requestId;

    if (!threadId) {
      setSelectedThread(null);
      setSelectedThreadError(null);
      setIsSelectedThreadLoading(false);
      return null;
    }

    setIsSelectedThreadLoading(true);
    try {
      const response = await requestJson<CodexAppServerThreadDetailResponse>({
        path: `/threads/${encodeURIComponent(threadId)}`,
      });
      if (selectedThreadRequestRef.current === requestId) {
        setSelectedThread(response.thread);
        setSelectedThreadError(null);
      }
      return response;
    } catch (nextError) {
      if (selectedThreadRequestRef.current === requestId) {
        setSelectedThreadError(
          nextError instanceof Error
            ? nextError.message
            : "Failed to load thread detail.",
        );
      }
      throw nextError;
    } finally {
      if (selectedThreadRequestRef.current === requestId) {
        setIsSelectedThreadLoading(false);
      }
    }
  };

  const runAction = async (action: () => Promise<unknown>) => {
    setIsBusy(true);
    try {
      const response = await action();
      setLastResponse(response);
      setError(null);
      await Promise.all([refreshStatus(), refreshRequests(), refreshEvents()]);
      return response;
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Request failed.",
      );
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  const refreshStatusRef = useRef(refreshStatus);
  const refreshRequestsRef = useRef(refreshRequests);
  const refreshEventsRef = useRef(refreshEvents);
  const refreshThreadsRef = useRef(refreshThreads);
  const refreshSelectedThreadRef = useRef(refreshSelectedThread);
  const connectedMachines = (connectedMachinesQuery ?? []).map((machine) => ({
    displayName: machine.displayName,
    hostname: machine.hostname,
    lastSeenAt: machine.lastSeenAt,
    machineId: machine.machineId,
    status: resolveConnectedMachineStatus({
      lastSeenAt: machine.lastSeenAt,
      now,
      status: machine.status,
    }),
  }));
  const heartbeatLog = useConnectedMachineHeartbeatLog(connectedMachines);

  refreshStatusRef.current = refreshStatus;
  refreshRequestsRef.current = refreshRequests;
  refreshEventsRef.current = refreshEvents;
  refreshThreadsRef.current = refreshThreads;
  refreshSelectedThreadRef.current = refreshSelectedThread;
  const browserViewHref = router.buildLocation(
    buildCodexThreadBrowserLinkOptions(selectedThreadId),
  ).href;

  useEffect(() => {
    const requestedThreadId = routeSearch.threadId ?? null;
    setSelectedThreadId((current) =>
      current === requestedThreadId ? current : requestedThreadId,
    );
  }, [routeSearch.threadId]);

  useEffect(() => {
    const nextSearch = buildCodexResearchRouteSearch(selectedThreadId);
    if (nextSearch.threadId === routeSearch.threadId) {
      return;
    }

    void navigate({
      replace: true,
      search: nextSearch,
    });
  }, [navigate, routeSearch.threadId, selectedThreadId]);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        await Promise.all([
          refreshStatusRef.current(),
          refreshRequestsRef.current(),
          refreshEventsRef.current(),
          refreshThreadsRef.current(),
        ]);
        if (!cancelled) {
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Failed to load Codex app-server research state.",
          );
        }
      }
    };

    void hydrate();
    const intervalId = window.setInterval(() => {
      void hydrate();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    void refreshSelectedThreadRef.current(selectedThreadId);
  }, [selectedThreadId]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(148,163,184,0.18),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] text-slate-950">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-6 md:px-6">
        <div className="flex flex-col gap-3 border border-slate-200 bg-white/80 p-5 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Research Surface
              </div>
              <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight">
                Codex App Server
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={browserViewHref}>Open browser view</a>
              </Button>
              <RuntimeStatusBadge status={status} />
            </div>
          </div>
          <p className="max-w-4xl text-sm text-slate-600">
            Local-only dev page for exploring the repo-owned bridge around{" "}
            <code>codex app-server</code>. This phase treats the runtime as a
            machine-scoped thread inventory, not a single current-thread demo.
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="border border-slate-300 bg-slate-100 px-2 py-1 font-mono">
              route: /research/codex-app-server
            </span>
            <span className="border border-slate-300 bg-slate-100 px-2 py-1 font-mono">
              api: {CODEX_APP_SERVER_RESEARCH_API_BASE}
            </span>
            <span className="border border-slate-300 bg-slate-100 px-2 py-1 font-mono">
              cwd: {status?.workspaceRoot ?? "loading"}
            </span>
          </div>
        </div>

        {connectedMachines.length > 0 ? (
          <ConnectedMachineHeartbeatLogSection heartbeatLog={heartbeatLog} />
        ) : null}

        {error ? (
          <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-mono text-base">Runtime</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Codex</span>
                    <span className="font-mono">
                      {status?.codexVersion ??
                        status?.codexInstallError ??
                        "loading"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Started</span>
                    <span className="font-mono">
                      {formatTimestamp(status?.runtime.startedAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Current thread
                    </span>
                    <span className="font-mono">
                      {status?.runtime.currentThreadId ?? "none"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Selected thread
                    </span>
                    <span className="font-mono">
                      {selectedThreadId ?? "none"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Pending approvals
                    </span>
                    <span className="font-mono">
                      {status?.runtime.pendingApprovalCount ?? "0"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Event cursor</span>
                    <span className="font-mono">
                      {status?.runtime.eventCursor ?? "0"}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3">
                  <Button
                    onClick={() => {
                      void runAction(() =>
                        requestJson({
                          path: "/runtime/ensure",
                          method: "POST",
                          body: { forceRestart: false },
                        }),
                      );
                    }}
                    disabled={isBusy}
                  >
                    Ensure runtime
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void runAction(() =>
                        requestJson({
                          path: "/runtime/ensure",
                          method: "POST",
                          body: { forceRestart: true },
                        }),
                      );
                    }}
                    disabled={isBusy}
                  >
                    Force restart
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void runAction(() =>
                        requestJson({
                          path: "/runtime/stop",
                          method: "POST",
                          body: {},
                        }),
                      );
                    }}
                    disabled={isBusy}
                  >
                    Stop runtime
                  </Button>
                </div>

                <div className="grid gap-3 border border-border bg-slate-50 p-3">
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Working directory
                    </label>
                    <Input
                      value={runtimeForm.cwd}
                      onChange={(event) => {
                        setRuntimeForm((current) => ({
                          ...current,
                          cwd: event.target.value,
                        }));
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Model
                    </label>
                    <Input
                      placeholder="Leave blank to use Codex config default"
                      value={runtimeForm.model}
                      onChange={(event) => {
                        setRuntimeForm((current) => ({
                          ...current,
                          model: event.target.value,
                        }));
                      }}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Approval policy
                      </label>
                      <Input
                        placeholder="on-request"
                        value={runtimeForm.approvalPolicy}
                        onChange={(event) => {
                          setRuntimeForm((current) => ({
                            ...current,
                            approvalPolicy: event.target.value,
                          }));
                        }}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Sandbox
                      </label>
                      <Input
                        placeholder="workspace-write"
                        value={runtimeForm.sandbox}
                        onChange={(event) => {
                          setRuntimeForm((current) => ({
                            ...current,
                            sandbox: event.target.value,
                          }));
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Personality
                    </label>
                    <Input
                      placeholder="Leave blank to use Codex default"
                      value={runtimeForm.personality}
                      onChange={(event) => {
                        setRuntimeForm((current) => ({
                          ...current,
                          personality: event.target.value,
                        }));
                      }}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <Checkbox
                      checked={runtimeForm.persistExtendedHistory}
                      onCheckedChange={(checked) => {
                        setRuntimeForm((current) => ({
                          ...current,
                          persistExtendedHistory: checked === true,
                        }));
                      }}
                    />
                    Persist extended history when starting a thread
                  </label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-mono text-base">
                  Protocol export
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant={
                      protocolMode === "json-schema" ? "default" : "outline"
                    }
                    onClick={() => {
                      setProtocolMode("json-schema");
                    }}
                  >
                    JSON Schema
                  </Button>
                  <Button
                    variant={protocolMode === "ts" ? "default" : "outline"}
                    onClick={() => {
                      setProtocolMode("ts");
                    }}
                  >
                    TypeScript
                  </Button>
                  <label className="ml-auto flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={protocolExperimental}
                      onCheckedChange={(checked) => {
                        setProtocolExperimental(checked === true);
                      }}
                    />
                    experimental
                  </label>
                </div>
                <Button
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => {
                    void runAction(async () => {
                      const nextProtocol =
                        await requestJson<CodexAppServerProtocolResponse>({
                          path: readProtocolRequestPath({
                            mode: protocolMode,
                            experimental: protocolExperimental,
                          }),
                        });
                      setProtocol(nextProtocol);
                      setActiveProtocolFilePath(
                        nextProtocol.files[0]?.path ?? null,
                      );
                      return nextProtocol;
                    });
                  }}
                >
                  Load{" "}
                  {protocolMode === "json-schema"
                    ? "JSON Schema"
                    : "TypeScript"}
                </Button>
                {protocol ? (
                  <ProtocolFilesViewer
                    protocol={protocol}
                    activeFilePath={activeProtocolFilePath}
                    onSelectFile={setActiveProtocolFilePath}
                  />
                ) : (
                  <div className="border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                    Load generated protocol files to inspect the current
                    app-server contract.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6">
            <CodexAppServerSelectedThreadCard
              threadsCount={threads.length}
              hasMoreThreads={nextThreadCursor !== null}
              browserViewHref={browserViewHref}
              thread={selectedThread}
              selectedThreadId={selectedThreadId}
              isLoading={isSelectedThreadLoading}
              error={selectedThreadError}
              onRefresh={() => {
                void runAction(async () => {
                  const response =
                    await refreshSelectedThread(selectedThreadId);
                  return response;
                });
              }}
              isBusy={isBusy}
            />

            <Card>
              <CardHeader>
                <CardTitle className="font-mono text-base">
                  Thread and turn control
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="grid gap-3 border border-border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Thread
                    </div>
                    <Button
                      disabled={isBusy}
                      onClick={() => {
                        void runAction(async () => {
                          const response =
                            await requestJson<ThreadActionResponse>({
                              path: "/thread/start",
                              method: "POST",
                              body: {
                                cwd: runtimeForm.cwd || undefined,
                                model: runtimeForm.model || undefined,
                                approvalPolicy:
                                  runtimeForm.approvalPolicy || undefined,
                                sandbox: runtimeForm.sandbox || undefined,
                                personality:
                                  runtimeForm.personality || undefined,
                                persistExtendedHistory:
                                  runtimeForm.persistExtendedHistory,
                              },
                            });
                          const nextThreadId = response.runtime.currentThreadId;
                          await refreshThreads();
                          if (nextThreadId) {
                            setSelectedThreadId(nextThreadId);
                            await refreshSelectedThread(nextThreadId);
                          }
                          return response;
                        });
                      }}
                    >
                      Start thread
                    </Button>
                    <Input
                      placeholder="Resume thread id"
                      value={resumeThreadId}
                      onChange={(event) => {
                        setResumeThreadId(event.target.value);
                      }}
                    />
                    <Button
                      variant="outline"
                      disabled={isBusy || resumeThreadId.trim().length === 0}
                      onClick={() => {
                        void runAction(async () => {
                          const response =
                            await requestJson<ThreadActionResponse>({
                              path: "/thread/resume",
                              method: "POST",
                              body: {
                                threadId: resumeThreadId.trim(),
                                cwd: runtimeForm.cwd || undefined,
                                model: runtimeForm.model || undefined,
                                approvalPolicy:
                                  runtimeForm.approvalPolicy || undefined,
                                sandbox: runtimeForm.sandbox || undefined,
                                personality:
                                  runtimeForm.personality || undefined,
                              },
                            });
                          const nextThreadId =
                            response.runtime.currentThreadId ??
                            resumeThreadId.trim();
                          await refreshThreads();
                          setSelectedThreadId(nextThreadId);
                          await refreshSelectedThread(nextThreadId);
                          return response;
                        });
                      }}
                    >
                      Resume thread
                    </Button>
                  </div>

                  <div className="grid gap-3 border border-border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Turn
                    </div>
                    <Input
                      placeholder="Thread id (blank uses selected thread)"
                      value={turnForm.threadId}
                      onChange={(event) => {
                        setTurnForm((current) => ({
                          ...current,
                          threadId: event.target.value,
                        }));
                      }}
                    />
                    <Textarea
                      value={turnForm.prompt}
                      onChange={(event) => {
                        setTurnForm((current) => ({
                          ...current,
                          prompt: event.target.value,
                        }));
                      }}
                      className="min-h-[180px] font-mono text-xs"
                    />
                    <div className="grid gap-3 md:grid-cols-3">
                      <Input
                        placeholder="effort"
                        value={turnForm.effort}
                        onChange={(event) => {
                          setTurnForm((current) => ({
                            ...current,
                            effort: event.target.value,
                          }));
                        }}
                      />
                      <Input
                        placeholder="timeoutMs"
                        value={turnForm.timeoutMs}
                        onChange={(event) => {
                          setTurnForm((current) => ({
                            ...current,
                            timeoutMs: event.target.value,
                          }));
                        }}
                      />
                      <Input
                        placeholder="summary"
                        value={turnForm.summary}
                        onChange={(event) => {
                          setTurnForm((current) => ({
                            ...current,
                            summary: event.target.value,
                          }));
                        }}
                      />
                    </div>
                    <Button
                      disabled={isBusy || turnForm.prompt.trim().length === 0}
                      onClick={() => {
                        void runAction(async () => {
                          const targetThreadId =
                            turnForm.threadId.trim() || selectedThreadId;
                          const response = await requestJson({
                            path: "/turn/start",
                            method: "POST",
                            body: {
                              threadId: targetThreadId || undefined,
                              text: turnForm.prompt,
                              cwd: runtimeForm.cwd || undefined,
                              model: runtimeForm.model || undefined,
                              approvalPolicy:
                                runtimeForm.approvalPolicy || undefined,
                              sandbox: runtimeForm.sandbox || undefined,
                              personality: runtimeForm.personality || undefined,
                              effort: turnForm.effort || undefined,
                              summary: turnForm.summary || undefined,
                              timeoutMs:
                                turnForm.timeoutMs.length > 0
                                  ? Number(turnForm.timeoutMs)
                                  : undefined,
                            },
                          });
                          const nextThreadId =
                            targetThreadId ?? readCurrentThreadId(response);
                          await refreshThreads();
                          if (nextThreadId) {
                            setSelectedThreadId(nextThreadId);
                            await refreshSelectedThread(nextThreadId);
                          }
                          return response;
                        });
                      }}
                    >
                      Start turn
                    </Button>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input
                        placeholder="Interrupt thread id"
                        value={interruptForm.threadId}
                        onChange={(event) => {
                          setInterruptForm((current) => ({
                            ...current,
                            threadId: event.target.value,
                          }));
                        }}
                      />
                      <Input
                        placeholder="Turn id"
                        value={interruptForm.turnId}
                        onChange={(event) => {
                          setInterruptForm((current) => ({
                            ...current,
                            turnId: event.target.value,
                          }));
                        }}
                      />
                    </div>
                    <Button
                      variant="outline"
                      disabled={
                        isBusy || interruptForm.turnId.trim().length === 0
                      }
                      onClick={() => {
                        void runAction(async () => {
                          const targetThreadId =
                            interruptForm.threadId.trim() || selectedThreadId;
                          const response = await requestJson({
                            path: "/turn/interrupt",
                            method: "POST",
                            body: {
                              threadId: targetThreadId || undefined,
                              turnId: interruptForm.turnId,
                            },
                          });
                          if (targetThreadId) {
                            await refreshSelectedThread(targetThreadId);
                          }
                          return response;
                        });
                      }}
                    >
                      Interrupt turn
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 border border-border bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Last response
                  </div>
                  <Textarea
                    readOnly
                    value={lastResponse ? formatJson(lastResponse) : ""}
                    className="min-h-[220px] font-mono text-xs"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-mono text-base">Approvals</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {requests.length === 0 ? (
                  <div className="border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                    No pending approvals.
                  </div>
                ) : null}
                {requests.map((request) => (
                  <div
                    key={`${request.id}`}
                    className="grid gap-3 border border-border bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-mono text-sm">{request.method}</div>
                      <Badge variant="outline">#{request.id}</Badge>
                    </div>
                    <Textarea
                      readOnly
                      value={formatJson(request.params)}
                      className="min-h-[160px] font-mono text-xs"
                    />
                    <div className="flex flex-wrap gap-2">
                      {["accept", "acceptForSession", "decline", "cancel"].map(
                        (decision) => (
                          <Button
                            key={decision}
                            variant={
                              decision === "accept" ? "default" : "outline"
                            }
                            disabled={isBusy}
                            onClick={() => {
                              void runAction(() =>
                                requestJson({
                                  path: "/approval/respond",
                                  method: "POST",
                                  body: {
                                    requestId: request.id,
                                    decision,
                                  },
                                }),
                              );
                            }}
                          >
                            {decision}
                          </Button>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-mono text-base">
                  Event stream
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="normalized">
                  <TabsList>
                    <TabsTrigger value="normalized">Normalized</TabsTrigger>
                    <TabsTrigger value="raw">Raw</TabsTrigger>
                  </TabsList>
                  <TabsContent value="normalized">
                    <div className="grid gap-3">
                      {events.length === 0 ? (
                        <div className="border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                          Waiting for events.
                        </div>
                      ) : null}
                      {events
                        .filter((event) => event.normalized !== null)
                        .map((event, index) => (
                          <div
                            key={getEventListKey({
                              scope: "normalized",
                              event,
                              index,
                            })}
                            className="grid gap-2 border border-border bg-white p-4"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-mono text-sm">
                                {event.normalized?.title}
                              </div>
                              {event.normalized ? (
                                <EventLevelBadge
                                  level={event.normalized.level}
                                />
                              ) : null}
                              <Badge variant="outline">#{event.cursor}</Badge>
                              <span className="ml-auto text-xs text-muted-foreground">
                                {formatTimestamp(event.at)}
                              </span>
                            </div>
                            {event.normalized?.summary ? (
                              <div className="text-sm text-slate-700">
                                {event.normalized.summary}
                              </div>
                            ) : null}
                            <div className="text-xs text-slate-500">
                              {event.method}
                            </div>
                            <Textarea
                              readOnly
                              value={formatJson(event.normalized?.data)}
                              className="min-h-[120px] font-mono text-xs"
                            />
                          </div>
                        ))}
                    </div>
                  </TabsContent>
                  <TabsContent value="raw">
                    <div className="grid gap-3">
                      {events.map((event, index) => (
                        <div
                          key={getEventListKey({
                            scope: "raw",
                            event,
                            index,
                          })}
                          className="grid gap-2 border border-border bg-white p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-mono text-sm">
                              {event.method}
                            </div>
                            <Badge variant="outline">#{event.cursor}</Badge>
                            <span className="ml-auto text-xs text-muted-foreground">
                              {formatTimestamp(event.at)}
                            </span>
                          </div>
                          <Textarea
                            readOnly
                            value={formatJson(event.params)}
                            className="min-h-[140px] font-mono text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
