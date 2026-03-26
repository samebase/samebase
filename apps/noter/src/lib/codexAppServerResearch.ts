export const CODEX_APP_SERVER_RESEARCH_ROUTE = "/research/codex-app-server";
export const CODEX_APP_SERVER_RESEARCH_API_BASE =
  "/__noter/research/codex-app-server";

export type CodexAppServerRequestId = string | number;

export type CodexAppServerEventLevel = "info" | "success" | "warning" | "error";

export type CodexAppServerNormalizedEventKind =
  | "runtime.ready"
  | "runtime.exit"
  | "runtime.stderr"
  | "approval.requested"
  | "item.started"
  | "item.completed"
  | "provider.event"
  | "provider.notification";

export type CodexAppServerNormalizedEvent = {
  kind: CodexAppServerNormalizedEventKind;
  level: CodexAppServerEventLevel;
  title: string;
  summary?: string;
  threadId?: string;
  turnId?: string;
  itemId?: string;
  itemType?: string;
  rawMethod: string;
  data: unknown;
};

export type CodexAppServerResearchEvent = {
  cursor: number;
  at: number;
  method: string;
  params: unknown;
  normalized: CodexAppServerNormalizedEvent | null;
};

export type CodexAppServerApprovalRequest = {
  id: CodexAppServerRequestId;
  method: string;
  params: unknown;
  createdAt: number;
};

export type CodexAppServerRuntimeSnapshot = {
  running: boolean;
  initialized: boolean;
  startedAt: number | null;
  currentThreadId: string | null;
  lastError: string | null;
  lastExitCode: number | null;
  lastExitSignal: string | null;
  pendingRequestCount: number;
  pendingApprovalCount: number;
  eventCursor: number;
};

export type CodexAppServerStatusResponse = {
  workspaceRoot: string;
  codexInstalled: boolean;
  codexVersion: string | null;
  codexInstallError: string | null;
  runtime: CodexAppServerRuntimeSnapshot;
};

export type CodexAppServerEventsResponse = {
  events: CodexAppServerResearchEvent[];
  nextCursor: number;
};

export type CodexAppServerRequestsResponse = {
  requests: CodexAppServerApprovalRequest[];
};

export type CodexAppServerProtocolArtifact = {
  path: string;
  content: string;
};

export type CodexAppServerProtocolResponse = {
  generatedAt: number;
  experimental: boolean;
  files: CodexAppServerProtocolArtifact[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function summarizeCommandItem(
  item: Record<string, unknown>,
): string | undefined {
  const command = readString(item.command);
  const cwd = readString(item.cwd);

  if (command && cwd) {
    return `${command} (${cwd})`;
  }
  if (command) {
    return command;
  }
  return cwd;
}

function summarizeFileChangeItem(
  item: Record<string, unknown>,
): string | undefined {
  const changes = item.changes;
  if (!Array.isArray(changes)) {
    return undefined;
  }
  const count = changes.length;
  if (count === 0) {
    return "0 changes";
  }
  if (count === 1) {
    return "1 change";
  }
  return `${count} changes`;
}

function summarizeCodexProviderEvent(
  method: string,
  params: Record<string, unknown> | null,
): string | undefined {
  const msg = asRecord(params?.msg);
  const eventType = readString(msg?.event_type) ?? readString(msg?.type);
  const title = readString(msg?.title);
  const callId = readString(msg?.call_id);
  const turnId = readString(params?.turnId);

  if (title) {
    return title;
  }
  if (eventType && callId) {
    return `${eventType} (${callId})`;
  }
  if (eventType) {
    return eventType;
  }
  if (turnId) {
    return `turn ${turnId}`;
  }
  return method.replace("codex/event/", "");
}

/**
 * Keep the research surface provider-neutral by collapsing noisy raw JSON-RPC
 * notifications into a smaller set of categories that other runtimes can
 * plausibly map onto later.
 */
export function normalizeCodexAppServerEvent(args: {
  method: string;
  params: unknown;
}): CodexAppServerNormalizedEvent | null {
  const { method, params } = args;
  const record = asRecord(params);

  if (method === "codex/runtime_ready") {
    return {
      kind: "runtime.ready",
      level: "success",
      title: "Runtime ready",
      rawMethod: method,
      data: params,
    };
  }

  if (method === "codex/runtime_exit") {
    const code = record?.code;
    const signal = readString(record?.signal);
    return {
      kind: "runtime.exit",
      level: "warning",
      title: "Runtime exited",
      summary:
        typeof code === "number"
          ? `code ${code}${signal ? `, signal ${signal}` : ""}`
          : signal
            ? `signal ${signal}`
            : undefined,
      rawMethod: method,
      data: params,
    };
  }

  if (method === "codex/runtime_stderr") {
    return {
      kind: "runtime.stderr",
      level: "warning",
      title: "Runtime stderr",
      summary: readString(record?.line),
      rawMethod: method,
      data: params,
    };
  }

  if (
    method === "item/commandExecution/requestApproval" ||
    method === "item/fileChange/requestApproval" ||
    method === "item/fileRead/requestApproval"
  ) {
    return {
      kind: "approval.requested",
      level: "warning",
      title: "Approval requested",
      summary: readString(record?.commandText) ?? readString(record?.cwd),
      itemId: readString(record?.itemId),
      rawMethod: method,
      data: params,
    };
  }

  if (method === "item/started" || method === "item/completed") {
    const item = asRecord(record?.item);
    const itemType = readString(item?.type);
    const itemId = readString(item?.id);
    const isCompleted = method === "item/completed";
    const summary =
      itemType === "commandExecution"
        ? summarizeCommandItem(item ?? {})
        : itemType === "fileChange"
          ? summarizeFileChangeItem(item ?? {})
          : undefined;

    return {
      kind: isCompleted ? "item.completed" : "item.started",
      level: isCompleted ? "success" : "info",
      title:
        itemType !== undefined
          ? `${itemType} ${isCompleted ? "completed" : "started"}`
          : `Item ${isCompleted ? "completed" : "started"}`,
      summary,
      itemId,
      itemType,
      rawMethod: method,
      data: params,
    };
  }

  if (method.startsWith("codex/event/")) {
    return {
      kind: "provider.event",
      level: "info",
      title: method.replace("codex/event/", ""),
      summary: summarizeCodexProviderEvent(method, record),
      threadId: readString(record?.threadId),
      turnId: readString(record?.turnId),
      rawMethod: method,
      data: params,
    };
  }

  if (method.length > 0) {
    return {
      kind: "provider.notification",
      level: "info",
      title: method,
      summary: readString(record?.threadId) ?? readString(record?.turnId),
      rawMethod: method,
      data: params,
    };
  }

  return null;
}
