import { Badge } from "@/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  CODEX_APP_SERVER_RESEARCH_API_BASE,
  type CodexAppServerApprovalRequest,
  type CodexAppServerEventsResponse,
  type CodexAppServerProtocolResponse,
  type CodexAppServerResearchEvent,
  type CodexAppServerRequestsResponse,
  type CodexAppServerStatusResponse,
} from "@/lib/codexAppServerResearch";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";

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

const DEFAULT_TURN_PROMPT =
  "Reply with exactly the word READY and nothing else.";

async function requestJson<T>(args: {
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch(
    `${CODEX_APP_SERVER_RESEARCH_API_BASE}${args.path}`,
    {
      method: args.method ?? "GET",
      headers:
        args.body !== undefined
          ? {
              "Content-Type": "application/json",
            }
          : undefined,
      body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : `Request failed: ${response.status}`,
    );
  }
  return payload;
}

function formatTimestamp(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "n/a";
  }
  return new Date(value).toLocaleTimeString();
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function getEventListKey(args: {
  scope: "normalized" | "raw";
  event: CodexAppServerResearchEvent;
  index: number;
}): string {
  return `${args.scope}-${args.event.cursor}-${args.event.method}-${args.index}`;
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

export function CodexAppServerResearchPage() {
  const [status, setStatus] = useState<CodexAppServerStatusResponse | null>(
    null,
  );
  const [events, setEvents] = useState<CodexAppServerResearchEvent[]>([]);
  const [requests, setRequests] = useState<CodexAppServerApprovalRequest[]>([]);
  const [protocol, setProtocol] =
    useState<CodexAppServerProtocolResponse | null>(null);
  const [protocolMode, setProtocolMode] = useState<"json-schema" | "ts">(
    "json-schema",
  );
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
    setTurnForm((current) =>
      current.threadId.length > 0 || !nextStatus.runtime.currentThreadId
        ? current
        : {
            ...current,
            threadId: nextStatus.runtime.currentThreadId,
          },
    );
  };

  const refreshRequests = async () => {
    const nextRequests = await requestJson<CodexAppServerRequestsResponse>({
      path: "/requests",
    });
    setRequests(nextRequests.requests);
  };

  const refreshEvents = async () => {
    const response = await requestJson<CodexAppServerEventsResponse>({
      path: `/events?since=${nextCursorRef.current}`,
    });
    nextCursorRef.current = response.nextCursor;
    if (response.events.length === 0) {
      return;
    }
    setEvents((current) => {
      // Dev-mode effect replays and action-triggered refreshes can overlap, so
      // the same cursor window may arrive more than once. Deduping by cursor
      // keeps the research log stable and avoids duplicate React keys.
      const mergedByCursor = new Map<number, CodexAppServerResearchEvent>();
      for (const event of current) {
        mergedByCursor.set(event.cursor, event);
      }
      for (const event of response.events) {
        mergedByCursor.set(event.cursor, event);
      }
      return Array.from(mergedByCursor.values()).slice(-200);
    });
  };

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        await Promise.all([
          refreshStatus(),
          refreshRequests(),
          refreshEvents(),
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

  const runAction = async (action: () => Promise<unknown>) => {
    setIsBusy(true);
    try {
      const response = await action();
      setLastResponse(response);
      setError(null);
      await Promise.all([refreshStatus(), refreshRequests(), refreshEvents()]);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Request failed.",
      );
    } finally {
      setIsBusy(false);
    }
  };

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
            <RuntimeStatusBadge status={status} />
          </div>
          <p className="max-w-4xl text-sm text-slate-600">
            Local-only dev page for exploring the repo-owned bridge around{" "}
            <code>codex app-server</code>. The goal is to inspect raw protocol
            behavior, compare it to a smaller normalized runtime model, and
            learn what actually needs to cross into Noter/Convex later.
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

        {error ? (
          <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="grid gap-6">
            <Card cornerNotch={0}>
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
                    <span className="text-muted-foreground">Thread</span>
                    <span className="font-mono">
                      {status?.runtime.currentThreadId ?? "none"}
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

            <Card cornerNotch={0}>
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
                          path:
                            protocolMode === "json-schema"
                              ? `/protocol/json-schema?experimental=${protocolExperimental ? "1" : "0"}`
                              : `/protocol/ts?experimental=${protocolExperimental ? "1" : "0"}`,
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
            <Card cornerNotch={0}>
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
                        void runAction(() =>
                          requestJson({
                            path: "/thread/start",
                            method: "POST",
                            body: {
                              cwd: runtimeForm.cwd || undefined,
                              model: runtimeForm.model || undefined,
                              approvalPolicy:
                                runtimeForm.approvalPolicy || undefined,
                              sandbox: runtimeForm.sandbox || undefined,
                              personality: runtimeForm.personality || undefined,
                              persistExtendedHistory:
                                runtimeForm.persistExtendedHistory,
                            },
                          }),
                        );
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
                        void runAction(() =>
                          requestJson({
                            path: "/thread/resume",
                            method: "POST",
                            body: {
                              threadId: resumeThreadId.trim(),
                              cwd: runtimeForm.cwd || undefined,
                              model: runtimeForm.model || undefined,
                              approvalPolicy:
                                runtimeForm.approvalPolicy || undefined,
                              sandbox: runtimeForm.sandbox || undefined,
                              personality: runtimeForm.personality || undefined,
                            },
                          }),
                        );
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
                      placeholder="Thread id (blank uses current thread)"
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
                        void runAction(() =>
                          requestJson({
                            path: "/turn/start",
                            method: "POST",
                            body: {
                              threadId: turnForm.threadId || undefined,
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
                          }),
                        );
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
                        void runAction(() =>
                          requestJson({
                            path: "/turn/interrupt",
                            method: "POST",
                            body: {
                              threadId: interruptForm.threadId || undefined,
                              turnId: interruptForm.turnId,
                            },
                          }),
                        );
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

            <Card cornerNotch={0}>
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

            <Card cornerNotch={0}>
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
