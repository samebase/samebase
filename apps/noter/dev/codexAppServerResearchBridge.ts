import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Plugin, ViteDevServer } from "vite";

import {
  CODEX_APP_SERVER_RESEARCH_API_BASE,
  normalizeCodexAppServerEvent,
  type CodexAppServerApprovalRequest,
  type CodexAppServerEventsResponse,
  type CodexAppServerLoadedThreadsResponse,
  type CodexAppServerProtocolArtifact,
  type CodexAppServerProtocolResponse,
  type CodexAppServerResearchEvent,
  type CodexAppServerRequestId,
  type CodexAppServerRequestsResponse,
  type CodexAppServerRuntimeSnapshot,
  type CodexAppServerStatusResponse,
  type CodexAppServerThread,
  type CodexAppServerThreadDetailResponse,
  type CodexAppServerThreadProject,
  type CodexAppServerThreadItem,
  type CodexAppServerThreadsResponse,
  type CodexAppServerThreadTurn,
  type CodexAppServerThreadWorkspace,
} from "../src/lib/codexAppServerResearch";

const execFileAsync = promisify(execFile);

const CODEX_RPC_TIMEOUT_MS = 120_000;
const CODEX_INIT_TIMEOUT_MS = 30_000;
const CODEX_EVENT_BUFFER_SIZE = 500;
const CODEX_REQUEST_BUFFER_SIZE = 100;
const CODEX_APPROVAL_CONTEXT_BUFFER_SIZE = 100;
const DEFAULT_THREAD_SOURCE_KINDS = ["cli", "vscode", "exec", "appServer"];
const CODEX_GLOBAL_STATE_FILENAME = ".codex-global-state.json";

type JsonRpcId = string | number;

type JsonRpcMessage = {
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  };
};

type PendingRequest = {
  method: string;
  timeoutId: NodeJS.Timeout;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type ApprovalContext = {
  command?: unknown;
  commandActions?: unknown;
  commandText?: string;
  cwd?: string;
  parsedCommand?: unknown;
  fileChanges?: unknown;
  changeList?: unknown;
};

type RuntimeApprovalRequest = CodexAppServerApprovalRequest;

type ThreadProjectInfo = {
  project: CodexAppServerThreadProject;
  workspace: CodexAppServerThreadWorkspace;
  resolvedFromGit: boolean;
};

const threadProjectInfoByCwd = new Map<string, Promise<ThreadProjectInfo>>();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function readPinnedThreadIds(value: unknown): string[] {
  return Array.from(new Set(readStringArray(value)));
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizePathForDisplay(value: string): string {
  return value.split("\\").join("/");
}

function resolveCodexHomeDirectory(): string {
  const configuredHome = process.env.CODEX_HOME?.trim();
  if (configuredHome && configuredHome.length > 0) {
    return configuredHome;
  }

  return path.join(homedir(), ".codex");
}

async function readDesktopPinnedThreadIds(): Promise<string[]> {
  const globalStatePath = path.join(
    resolveCodexHomeDirectory(),
    CODEX_GLOBAL_STATE_FILENAME,
  );

  try {
    const rawGlobalState = await readFile(globalStatePath, "utf8");
    const parsedGlobalState = asRecord(JSON.parse(rawGlobalState));
    return readPinnedThreadIds(parsedGlobalState?.["pinned-thread-ids"]);
  } catch {
    // The research bridge should fail closed here: an unreadable desktop state
    // file means "no known pinned threads", not a broken thread inventory.
    return [];
  }
}

function readPathLeaf(value: string): string {
  const normalized = normalizePathForDisplay(value);
  const segments = normalized
    .split("/")
    .filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? value;
}

function readCodexWorktreeId(value: string): string | null {
  const match = normalizePathForDisplay(value).match(/\/worktrees\/([^/]+)\//);
  return match?.[1] ?? null;
}

/**
 * Use the shared git common dir as the project identity so sibling worktrees
 * collapse into one project while keeping their individual cwd labels.
 */
function buildThreadProjectInfo(args: {
  cwd: string;
  projectRoot: string;
  resolvedFromGit: boolean;
}): ThreadProjectInfo {
  const normalizedCwd = normalizePathForDisplay(path.resolve(args.cwd));
  const normalizedProjectRoot = normalizePathForDisplay(
    path.resolve(args.projectRoot),
  );
  const isProjectRoot = normalizedCwd === normalizedProjectRoot;

  if (isProjectRoot) {
    return {
      project: {
        id: normalizedProjectRoot,
        label: readPathLeaf(normalizedProjectRoot),
        rootCwd: normalizedProjectRoot,
      },
      workspace: {
        label: null,
        isProjectRoot: true,
      },
      resolvedFromGit: args.resolvedFromGit,
    };
  }

  const codexWorktreeId = readCodexWorktreeId(normalizedCwd);
  const cwdLeaf = readPathLeaf(normalizedCwd);
  const projectRootLeaf = readPathLeaf(normalizedProjectRoot);
  const cwdParentLeaf = readPathLeaf(path.dirname(normalizedCwd));
  const projectParentLeaf = readPathLeaf(path.dirname(normalizedProjectRoot));
  const workspaceLabel =
    codexWorktreeId ??
    (cwdLeaf !== projectRootLeaf ? cwdLeaf : null) ??
    (cwdParentLeaf !== projectParentLeaf ? cwdParentLeaf : null) ??
    cwdLeaf;

  return {
    project: {
      id: normalizedProjectRoot,
      label: projectRootLeaf,
      rootCwd: normalizedProjectRoot,
    },
    workspace: {
      label: workspaceLabel,
      isProjectRoot: false,
    },
    resolvedFromGit: args.resolvedFromGit,
  };
}

function buildFallbackThreadProjectInfo(cwd: string): ThreadProjectInfo {
  return buildThreadProjectInfo({
    cwd,
    projectRoot: cwd,
    resolvedFromGit: false,
  });
}

async function readThreadProjectInfo(cwd: string): Promise<ThreadProjectInfo> {
  const cached = threadProjectInfoByCwd.get(cwd);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const fallback = buildFallbackThreadProjectInfo(cwd);

    try {
      const { stdout } = await execFileAsync(
        "git",
        [
          "-C",
          cwd,
          "rev-parse",
          "--path-format=absolute",
          "--show-toplevel",
          "--git-common-dir",
        ],
        {
          timeout: 5_000,
          maxBuffer: 64 * 1024,
        },
      );

      const [topLevelLine, commonDirLine] = stdout
        .trim()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (!topLevelLine || !commonDirLine) {
        return fallback;
      }

      const resolvedTopLevel = path.isAbsolute(topLevelLine)
        ? topLevelLine
        : path.resolve(cwd, topLevelLine);
      const resolvedCommonDir = path.isAbsolute(commonDirLine)
        ? commonDirLine
        : path.resolve(cwd, commonDirLine);
      const projectRoot =
        path.basename(resolvedCommonDir) === ".git"
          ? path.dirname(resolvedCommonDir)
          : resolvedTopLevel;

      return buildThreadProjectInfo({
        cwd,
        projectRoot,
        resolvedFromGit: true,
      });
    } catch {
      return fallback;
    }
  })();

  threadProjectInfoByCwd.set(cwd, promise);
  return promise;
}

function cloneJsonValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function normalizeTurnInput(
  body: Record<string, unknown>,
): unknown[] | undefined {
  const rawInput =
    body.input !== undefined
      ? body.input
      : typeof body.text === "string"
        ? body.text
        : undefined;

  if (rawInput === undefined) {
    return undefined;
  }

  if (Array.isArray(rawInput)) {
    return rawInput;
  }

  if (typeof rawInput === "string") {
    return [{ type: "text", text: rawInput }];
  }

  if (asRecord(rawInput)) {
    return [rawInput];
  }

  return undefined;
}

function normalizeSandboxMode(value: unknown): string | undefined {
  if (
    value === "read-only" ||
    value === "workspace-write" ||
    value === "danger-full-access"
  ) {
    return value;
  }

  const record = asRecord(value);
  if (record?.type === "readOnly") {
    return "read-only";
  }
  if (record?.type === "workspaceWrite") {
    return "workspace-write";
  }
  if (record?.type === "dangerFullAccess") {
    return "danger-full-access";
  }
  return undefined;
}

function normalizeSandboxPolicy(
  value: unknown,
): Record<string, unknown> | undefined {
  if (asRecord(value)) {
    const cloned = cloneJsonValue(value);
    return asRecord(cloned) ?? undefined;
  }

  if (value === "read-only") {
    return { type: "readOnly" };
  }
  if (value === "workspace-write") {
    return { type: "workspaceWrite" };
  }
  if (value === "danger-full-access") {
    return { type: "dangerFullAccess" };
  }
  return undefined;
}

function applyThreadSandbox(
  params: Record<string, unknown>,
  body: Record<string, unknown>,
) {
  const sandbox =
    body.sandbox !== undefined
      ? normalizeSandboxMode(body.sandbox)
      : normalizeSandboxMode(body.sandboxPolicy);
  if (sandbox !== undefined) {
    params.sandbox = sandbox;
  }
}

function applyTurnSandboxPolicy(
  params: Record<string, unknown>,
  body: Record<string, unknown>,
) {
  const sandboxPolicy =
    body.sandboxPolicy !== undefined
      ? normalizeSandboxPolicy(body.sandboxPolicy)
      : normalizeSandboxPolicy(body.sandbox);
  if (sandboxPolicy !== undefined) {
    params.sandboxPolicy = sandboxPolicy;
  }
}

function applyCommonTurnOptions(
  params: Record<string, unknown>,
  body: Record<string, unknown>,
) {
  if (typeof body.cwd === "string") {
    params.cwd = body.cwd;
  }
  if (body.approvalPolicy !== undefined) {
    params.approvalPolicy = body.approvalPolicy;
  }
  applyTurnSandboxPolicy(params, body);
  if (typeof body.model === "string") {
    params.model = body.model;
  }
  if (typeof body.personality === "string") {
    params.personality = body.personality;
  }
}

function applySettingsOverrides(
  params: Record<string, unknown>,
  settings: unknown,
) {
  const record = asRecord(settings);
  if (!record) {
    return;
  }

  if (params.model === undefined && typeof record.model === "string") {
    params.model = record.model;
  }

  const effort =
    typeof record.effort === "string"
      ? record.effort
      : typeof record.reasoningEffort === "string"
        ? record.reasoningEffort
        : typeof record.reasoning_effort === "string"
          ? record.reasoning_effort
          : undefined;
  if (params.effort === undefined && effort !== undefined) {
    params.effort = effort;
  }

  const summary =
    typeof record.summary === "string"
      ? record.summary
      : typeof record.reasoningSummary === "string"
        ? record.reasoningSummary
        : typeof record.reasoning_summary === "string"
          ? record.reasoning_summary
          : undefined;
  if (params.summary === undefined && summary !== undefined) {
    params.summary = summary;
  }
}

// MARK: - Thread inventory normalization

function truncateText(value: string, maxLength = 120): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function describeThreadSource(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const record = asRecord(value);
  if (!record) {
    return "unknown";
  }

  const subAgent = record.subAgent;
  if (typeof subAgent === "string") {
    return `subAgent:${subAgent}`;
  }

  const subAgentRecord = asRecord(subAgent);
  if (subAgentRecord) {
    const nestedKey = Object.keys(subAgentRecord)[0];
    if (nestedKey) {
      return `subAgent:${nestedKey}`;
    }
  }

  const key = Object.keys(record)[0];
  if (key) {
    return key;
  }

  return "unknown";
}

function summarizeUserMessageContent(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const firstText = value.find((entry) => {
    const record = asRecord(entry);
    return record?.type === "text" && typeof record.text === "string";
  });
  const firstTextRecord = asRecord(firstText);
  if (typeof firstTextRecord?.text === "string") {
    return truncateText(firstTextRecord.text);
  }

  if (value.length === 0) {
    return "Empty user message";
  }

  return `${value.length} input item${value.length === 1 ? "" : "s"}`;
}

function summarizeThreadItem(record: Record<string, unknown>): string | null {
  const itemType = readString(record.type) ?? "unknown";

  if (itemType === "userMessage") {
    return summarizeUserMessageContent(record.content);
  }

  if (itemType === "agentMessage") {
    const text = readString(record.text);
    return text ? truncateText(text) : null;
  }

  if (itemType === "commandExecution") {
    const command = readString(record.command);
    const cwd = readString(record.cwd);
    if (command && cwd) {
      return `${command} (${cwd})`;
    }
    return command ?? cwd ?? null;
  }

  if (itemType === "fileChange") {
    const changes = Array.isArray(record.changes) ? record.changes.length : 0;
    return `${changes} change${changes === 1 ? "" : "s"}`;
  }

  if (itemType === "reasoning") {
    const summary = readStringArray(record.summary).at(0);
    const content = readStringArray(record.content).at(0);
    return summary ?? content ?? "Reasoning";
  }

  if (itemType === "mcpToolCall") {
    const server = readString(record.server);
    const tool = readString(record.tool);
    if (server && tool) {
      return `${server}/${tool}`;
    }
    return server ?? tool ?? null;
  }

  if (itemType === "dynamicToolCall" || itemType === "collabAgentToolCall") {
    return readString(record.tool) ?? null;
  }

  if (itemType === "webSearch") {
    return readString(record.query) ?? null;
  }

  if (itemType === "imageView") {
    return readString(record.path) ?? null;
  }

  if (itemType === "imageGeneration") {
    return readString(record.result) ?? null;
  }

  if (itemType === "enteredReviewMode" || itemType === "exitedReviewMode") {
    return readString(record.review) ?? null;
  }

  if (itemType === "contextCompaction") {
    return "Context compaction";
  }

  return readString(record.text) ?? readString(record.command) ?? null;
}

function normalizeThreadItem(value: unknown): CodexAppServerThreadItem | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    id: readString(record.id) ?? null,
    type: readString(record.type) ?? "unknown",
    summary: summarizeThreadItem(record),
    raw: cloneJsonValue(value),
  };
}

function normalizeThreadTurn(value: unknown): CodexAppServerThreadTurn | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const id = readString(record.id);
  const status = readString(record.status);
  if (!id || !status) {
    return null;
  }

  const items = Array.isArray(record.items)
    ? record.items
        .map((item) => normalizeThreadItem(item))
        .filter((item): item is CodexAppServerThreadItem => item !== null)
    : [];

  return {
    id,
    status,
    errorMessage: readString(asRecord(record.error)?.message) ?? null,
    items,
    raw: cloneJsonValue(value),
  };
}

function normalizeThreadStatus(value: unknown) {
  const record = asRecord(value);
  return {
    type: readString(record?.type) ?? "unknown",
    activeFlags: readStringArray(record?.activeFlags),
    raw: cloneJsonValue(value),
  };
}

function normalizeThread(value: unknown): CodexAppServerThread | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const id = readString(record.id);
  const preview = readString(record.preview);
  const cwd = readString(record.cwd);
  const createdAt = readNumber(record.createdAt);
  const updatedAt = readNumber(record.updatedAt);
  if (!id || preview === undefined || !cwd || createdAt === undefined) {
    return null;
  }
  if (updatedAt === undefined) {
    return null;
  }

  const gitInfo = asRecord(record.gitInfo);
  const fallbackProjectInfo = buildFallbackThreadProjectInfo(cwd);
  const turns = Array.isArray(record.turns)
    ? record.turns
        .map((turn) => normalizeThreadTurn(turn))
        .filter((turn): turn is CodexAppServerThreadTurn => turn !== null)
    : [];

  return {
    id,
    name: readString(record.name) ?? null,
    preview,
    cwd,
    project: fallbackProjectInfo.project,
    workspace: fallbackProjectInfo.workspace,
    createdAt,
    updatedAt,
    cliVersion: readString(record.cliVersion) ?? null,
    modelProvider: readString(record.modelProvider) ?? null,
    sourceLabel: describeThreadSource(record.source),
    source: cloneJsonValue(record.source),
    status: normalizeThreadStatus(record.status),
    gitInfo: gitInfo
      ? {
          branch: readString(gitInfo.branch) ?? null,
          originUrl: readString(gitInfo.originUrl) ?? null,
          sha: readString(gitInfo.sha) ?? null,
        }
      : null,
    path: readString(record.path) ?? null,
    agentNickname: readString(record.agentNickname) ?? null,
    agentRole: readString(record.agentRole) ?? null,
    turns,
    raw: cloneJsonValue(value),
  };
}

async function enrichThreadProjectInfo(
  thread: CodexAppServerThread,
): Promise<CodexAppServerThread> {
  const projectInfo = await readThreadProjectInfo(thread.cwd);
  return applyThreadProjectInfo(thread, projectInfo);
}

function applyThreadProjectInfo(
  thread: CodexAppServerThread,
  projectInfo: ThreadProjectInfo,
): CodexAppServerThread {
  return {
    ...thread,
    project: projectInfo.project,
    workspace: projectInfo.workspace,
  };
}

function readThreadProjectAliasKey(
  thread: CodexAppServerThread,
): string | null {
  const originUrl = thread.gitInfo?.originUrl;
  if (!originUrl) {
    return null;
  }

  return `${originUrl}::${readPathLeaf(thread.cwd)}`;
}

/**
 * Some older Codex sessions point at worktree paths that no longer exist, so
 * Git cannot resolve their common dir directly. When the same repo still has a
 * live thread elsewhere on disk, reuse that canonical project root and keep
 * only the dead worktree label as per-thread metadata.
 */
function alignFallbackThreadProjects(
  entries: {
    thread: CodexAppServerThread;
    projectInfo: ThreadProjectInfo;
  }[],
): CodexAppServerThread[] {
  const canonicalProjectInfoByAliasKey = new Map<string, ThreadProjectInfo>();

  for (const entry of entries) {
    if (!entry.projectInfo.resolvedFromGit) {
      continue;
    }

    const aliasKey = readThreadProjectAliasKey(entry.thread);
    if (!aliasKey) {
      continue;
    }

    if (!canonicalProjectInfoByAliasKey.has(aliasKey)) {
      canonicalProjectInfoByAliasKey.set(aliasKey, entry.projectInfo);
    }
  }

  return entries.map((entry) => {
    if (entry.projectInfo.resolvedFromGit) {
      return applyThreadProjectInfo(entry.thread, entry.projectInfo);
    }

    const aliasKey = readThreadProjectAliasKey(entry.thread);
    if (!aliasKey) {
      return applyThreadProjectInfo(entry.thread, entry.projectInfo);
    }

    const canonicalProjectInfo = canonicalProjectInfoByAliasKey.get(aliasKey);
    if (!canonicalProjectInfo) {
      return applyThreadProjectInfo(entry.thread, entry.projectInfo);
    }

    return applyThreadProjectInfo(
      entry.thread,
      buildThreadProjectInfo({
        cwd: entry.thread.cwd,
        projectRoot: canonicalProjectInfo.project.rootCwd,
        resolvedFromGit: false,
      }),
    );
  });
}

function withApprovalContext(args: {
  requestId: CodexAppServerRequestId;
  method: string;
  params: unknown;
  approvalContextByItemId: Map<string, ApprovalContext>;
}): unknown {
  const baseParams = asRecord(cloneJsonValue(args.params)) ?? {};
  baseParams.requestId = args.requestId;

  const itemId = readString(baseParams.itemId);
  const context =
    itemId !== undefined ? args.approvalContextByItemId.get(itemId) : undefined;
  if (!context) {
    return baseParams;
  }

  if (args.method === "item/fileChange/requestApproval") {
    if (context.fileChanges !== undefined) {
      baseParams.fileChanges = cloneJsonValue(context.fileChanges);
    }
    if (context.changeList !== undefined) {
      baseParams.changes = cloneJsonValue(context.changeList);
    }
  }

  if (args.method === "item/commandExecution/requestApproval") {
    if (context.command !== undefined) {
      baseParams.command = cloneJsonValue(context.command);
    }
    if (context.commandText !== undefined) {
      baseParams.commandText = context.commandText;
    }
    if (context.cwd !== undefined) {
      baseParams.cwd = context.cwd;
    }
    if (context.commandActions !== undefined) {
      baseParams.commandActions = cloneJsonValue(context.commandActions);
    }
    if (context.parsedCommand !== undefined) {
      baseParams.parsedCommand = cloneJsonValue(context.parsedCommand);
    }
  }

  return baseParams;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (rawBody.length === 0) {
    return {};
  }

  return JSON.parse(rawBody);
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(payload));
  res.end(payload);
}

async function readFilesRecursively(args: {
  rootDir: string;
  currentDir?: string;
}): Promise<CodexAppServerProtocolArtifact[]> {
  const currentDir = args.currentDir ?? args.rootDir;
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: CodexAppServerProtocolArtifact[] = [];

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(
        ...(await readFilesRecursively({
          rootDir: args.rootDir,
          currentDir: entryPath,
        })),
      );
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    files.push({
      path: path.relative(args.rootDir, entryPath),
      content: await readFile(entryPath, "utf8"),
    });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

class CodexAppServerResearchRuntime {
  private process: ChildProcessWithoutNullStreams | null = null;
  private startPromise: Promise<void> | null = null;
  private initialized = false;
  private nextRpcId = 1;
  private pendingRequests = new Map<JsonRpcId, PendingRequest>();
  private approvalRequests = new Map<
    CodexAppServerRequestId,
    RuntimeApprovalRequest
  >();
  private approvalContextByItemId = new Map<string, ApprovalContext>();
  private stdoutBuffer = "";
  private events: CodexAppServerResearchEvent[] = [];
  private nextEventCursor = 1;
  private startedAt: number | null = null;
  private lastError: string | null = null;
  private lastExitCode: number | null = null;
  private lastExitSignal: string | null = null;
  private currentThreadId: string | null = null;

  constructor(private readonly workspaceRoot: string) {}

  private isRunning(): boolean {
    return Boolean(
      this.process && !this.process.killed && this.process.exitCode === null,
    );
  }

  private getSnapshot(): CodexAppServerRuntimeSnapshot {
    return {
      running: this.isRunning(),
      initialized: this.initialized,
      startedAt: this.startedAt,
      currentThreadId: this.currentThreadId,
      lastError: this.lastError,
      lastExitCode: this.lastExitCode,
      lastExitSignal: this.lastExitSignal,
      pendingRequestCount: this.pendingRequests.size,
      pendingApprovalCount: this.approvalRequests.size,
      eventCursor: this.nextEventCursor - 1,
    };
  }

  private pushEvent(method: string, params: unknown) {
    this.events.push({
      cursor: this.nextEventCursor++,
      at: Date.now(),
      method,
      params,
      normalized: normalizeCodexAppServerEvent({ method, params }),
    });

    if (this.events.length > CODEX_EVENT_BUFFER_SIZE) {
      this.events.shift();
    }
  }

  private rejectPendingRequests(message: string) {
    for (const [requestId, pendingRequest] of this.pendingRequests.entries()) {
      clearTimeout(pendingRequest.timeoutId);
      pendingRequest.reject(new Error(message));
      this.pendingRequests.delete(requestId);
    }
  }

  private resetRuntimeState(
    exitCode: number | null,
    exitSignal: string | null,
  ) {
    this.initialized = false;
    this.stdoutBuffer = "";
    this.currentThreadId = null;
    this.approvalRequests.clear();
    this.approvalContextByItemId.clear();
    this.process = null;
    this.lastExitCode = exitCode;
    this.lastExitSignal = exitSignal;
    this.rejectPendingRequests("Codex app-server process ended");
  }

  private rememberApprovalContext(method: string, params: unknown) {
    const record = asRecord(params);
    if (!record) {
      return;
    }

    if (method === "item/started" || method === "item/completed") {
      const item = asRecord(record.item);
      if (!item) {
        return;
      }
      const itemId = readString(item.id);
      const itemType = readString(item.type);
      if (!itemId || !itemType) {
        return;
      }

      if (itemType === "fileChange") {
        this.approvalContextByItemId.set(itemId, {
          changeList: cloneJsonValue(item.changes),
        });
      }

      if (itemType === "commandExecution") {
        this.approvalContextByItemId.set(itemId, {
          commandText: readString(item.command),
          cwd: readString(item.cwd),
          commandActions: cloneJsonValue(item.commandActions),
        });
      }

      while (
        this.approvalContextByItemId.size > CODEX_APPROVAL_CONTEXT_BUFFER_SIZE
      ) {
        const oldestKey = this.approvalContextByItemId.keys().next().value;
        if (oldestKey === undefined) {
          break;
        }
        this.approvalContextByItemId.delete(oldestKey);
      }
      return;
    }

    if (!method.startsWith("codex/event/")) {
      return;
    }

    const message = asRecord(record.msg);
    const callId = readString(message?.call_id);
    if (!callId) {
      return;
    }

    if (
      method === "codex/event/apply_patch_approval_request" ||
      method === "codex/event/patch_apply_begin" ||
      method === "codex/event/patch_apply_end"
    ) {
      this.approvalContextByItemId.set(callId, {
        fileChanges: cloneJsonValue(message?.changes),
      });
      return;
    }

    if (
      method === "codex/event/exec_command_begin" ||
      method === "codex/event/exec_command_end"
    ) {
      this.approvalContextByItemId.set(callId, {
        command: cloneJsonValue(message?.command),
        cwd: readString(message?.cwd),
        parsedCommand: cloneJsonValue(message?.parsed_cmd),
      });
    }
  }

  private parseMessageLine(line: string) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return;
    }

    let message: JsonRpcMessage;
    try {
      const parsed = JSON.parse(trimmed);
      const record = asRecord(parsed);
      if (!record) {
        this.pushEvent("codex/runtime_stderr", {
          line: `Ignored non-object JSON-RPC payload: ${trimmed}`,
        });
        return;
      }
      message = record;
    } catch (error) {
      this.pushEvent("codex/runtime_stderr", {
        line: `Failed to parse JSON-RPC line: ${describeError(error)}`,
      });
      return;
    }

    const hasId = Object.prototype.hasOwnProperty.call(message, "id");
    const hasMethod = typeof message.method === "string";
    const hasResult = Object.prototype.hasOwnProperty.call(message, "result");
    const hasError = Object.prototype.hasOwnProperty.call(message, "error");

    if (hasMethod) {
      this.rememberApprovalContext(message.method ?? "", message.params);
    }

    if (hasId && (hasResult || hasError)) {
      const requestId = message.id;
      if (requestId === undefined) {
        return;
      }
      const pendingRequest = this.pendingRequests.get(requestId);
      if (!pendingRequest) {
        return;
      }

      clearTimeout(pendingRequest.timeoutId);
      this.pendingRequests.delete(requestId);

      if (hasError) {
        const errorMessage =
          readString(asRecord(message.error)?.message) ??
          `Codex RPC ${pendingRequest.method} failed`;
        pendingRequest.reject(new Error(errorMessage));
        return;
      }

      pendingRequest.resolve(message.result);
      return;
    }

    if (hasId && hasMethod) {
      const requestId = message.id;
      if (requestId === undefined) {
        return;
      }
      const approvalParams = withApprovalContext({
        requestId,
        method: message.method ?? "",
        params: message.params,
        approvalContextByItemId: this.approvalContextByItemId,
      });
      this.approvalRequests.set(requestId, {
        id: requestId,
        method: message.method ?? "",
        params: approvalParams,
        createdAt: Date.now(),
      });

      if (this.approvalRequests.size > CODEX_REQUEST_BUFFER_SIZE) {
        const oldestKey = this.approvalRequests.keys().next().value;
        if (oldestKey !== undefined) {
          this.approvalRequests.delete(oldestKey);
        }
      }

      this.pushEvent(message.method ?? "", approvalParams);
      return;
    }

    if (hasMethod) {
      this.pushEvent(message.method ?? "", message.params);
    }
  }

  private writeMessage(message: Record<string, unknown>) {
    if (!this.process || !this.isRunning()) {
      throw new Error("Codex app-server is not running");
    }
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private async sendRequestNoEnsure(args: {
    method: string;
    params?: Record<string, unknown>;
    timeoutMs?: number;
  }): Promise<unknown> {
    if (!this.isRunning()) {
      throw new Error("Codex app-server is not running");
    }

    const requestId = this.nextRpcId++;
    return await new Promise<unknown>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Codex RPC timeout for method: ${args.method}`));
      }, args.timeoutMs ?? CODEX_RPC_TIMEOUT_MS);

      this.pendingRequests.set(requestId, {
        method: args.method,
        timeoutId,
        resolve,
        reject,
      });

      try {
        this.writeMessage({
          id: requestId,
          method: args.method,
          params: args.params ?? {},
        });
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
        reject(
          error instanceof Error ? error : new Error(describeError(error)),
        );
      }
    });
  }

  private sendNotificationNoEnsure(
    method: string,
    params: Record<string, unknown>,
  ) {
    this.writeMessage({ method, params });
  }

  private async ensureCodexBinary(): Promise<string> {
    const { stdout } = await execFileAsync("codex", ["--version"], {
      cwd: this.workspaceRoot,
      timeout: 10_000,
    });
    const version = stdout.trim();
    if (version.length === 0) {
      throw new Error("codex --version returned an empty response");
    }
    return version;
  }

  async getStatus(): Promise<CodexAppServerStatusResponse> {
    try {
      const codexVersion = await this.ensureCodexBinary();
      return {
        workspaceRoot: this.workspaceRoot,
        codexInstalled: true,
        codexVersion,
        codexInstallError: null,
        runtime: this.getSnapshot(),
      };
    } catch (error) {
      return {
        workspaceRoot: this.workspaceRoot,
        codexInstalled: false,
        codexVersion: null,
        codexInstallError: describeError(error),
        runtime: this.getSnapshot(),
      };
    }
  }

  async stopRuntime() {
    if (!this.process || this.process.exitCode !== null) {
      return { success: true, runtime: this.getSnapshot() };
    }

    const processToStop = this.process;
    await new Promise<void>((resolve) => {
      let completed = false;
      const finish = () => {
        if (completed) {
          return;
        }
        completed = true;
        resolve();
      };

      const timeoutId = setTimeout(() => {
        if (processToStop.exitCode === null) {
          processToStop.kill("SIGKILL");
        }
        finish();
      }, 5_000);

      processToStop.once("exit", () => {
        clearTimeout(timeoutId);
        finish();
      });

      processToStop.kill("SIGTERM");
    });

    return { success: true, runtime: this.getSnapshot() };
  }

  async ensureRuntime(forceRestart: boolean) {
    if (forceRestart) {
      await this.stopRuntime();
    }

    if (this.initialized && this.isRunning()) {
      return { success: true, runtime: this.getSnapshot() };
    }

    if (this.startPromise) {
      await this.startPromise;
      return { success: true, runtime: this.getSnapshot() };
    }

    this.startPromise = (async () => {
      const version = await this.ensureCodexBinary();
      this.pushEvent("codex/runtime_stderr", {
        line: `Launching codex app-server (${version})`,
      });

      const processHandle = spawn(
        "codex",
        ["app-server", "--listen", "stdio://"],
        {
          cwd: this.workspaceRoot,
          env: process.env,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      this.process = processHandle;
      this.initialized = false;
      this.startedAt = Date.now();
      this.lastError = null;
      this.lastExitCode = null;
      this.lastExitSignal = null;

      processHandle.stdout.on("data", (chunk: Buffer | string) => {
        this.stdoutBuffer += chunk.toString();
        let newlineIndex = this.stdoutBuffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = this.stdoutBuffer.slice(0, newlineIndex);
          this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
          this.parseMessageLine(line);
          newlineIndex = this.stdoutBuffer.indexOf("\n");
        }
      });

      processHandle.stderr.on("data", (chunk: Buffer | string) => {
        for (const line of chunk.toString().split("\n")) {
          const trimmed = line.trim();
          if (trimmed.length === 0) {
            continue;
          }
          this.pushEvent("codex/runtime_stderr", { line: trimmed });
        }
      });

      processHandle.on("error", (error) => {
        this.lastError = describeError(error);
        this.pushEvent("codex/runtime_stderr", {
          line: `Process error: ${this.lastError}`,
        });
      });

      processHandle.on("exit", (code, signal) => {
        this.lastError = `Codex app-server exited (code=${code}, signal=${signal})`;
        this.resetRuntimeState(code, signal);
        this.pushEvent("codex/runtime_exit", { code, signal });
      });

      try {
        await this.sendRequestNoEnsure({
          method: "initialize",
          params: {
            clientInfo: {
              name: "noter_codex_research_bridge",
              title: "Noter Codex Research Bridge",
              version: "0.1.0",
            },
          },
          timeoutMs: CODEX_INIT_TIMEOUT_MS,
        });
        this.sendNotificationNoEnsure("initialized", {});
        this.initialized = true;
        this.pushEvent("codex/runtime_ready", { startedAt: this.startedAt });
      } catch (error) {
        this.lastError = describeError(error);
        await this.stopRuntime();
        throw error;
      }
    })();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }

    return { success: true, runtime: this.getSnapshot() };
  }

  async listEvents(since: number): Promise<CodexAppServerEventsResponse> {
    return {
      events: this.events.filter((event) => event.cursor > since),
      nextCursor: this.nextEventCursor - 1,
    };
  }

  async listRequests(): Promise<CodexAppServerRequestsResponse> {
    return {
      requests: Array.from(this.approvalRequests.values()).sort(
        (left, right) => left.createdAt - right.createdAt,
      ),
    };
  }

  /**
   * The desktop sidebar can pin older sessions that fall outside the current
   * `thread/list` page. Read those by id so the research browser can mirror the
   * same pinned section instead of silently dropping them.
   */
  private async readThreadSummary(
    threadId: string,
  ): Promise<CodexAppServerThread | null> {
    try {
      const result = await this.sendRequestNoEnsure({
        method: "thread/read",
        params: {
          threadId,
          includeTurns: false,
        },
      });
      const normalizedThread = normalizeThread(asRecord(result)?.thread);
      if (normalizedThread === null) {
        return null;
      }

      return enrichThreadProjectInfo(normalizedThread);
    } catch {
      return null;
    }
  }

  /**
   * Keep the browser contract focused on the subset Noter needs for a future
   * machine connector, while preserving the raw provider payload on each thread
   * for protocol inspection.
   */
  async listThreads(
    searchParams: URLSearchParams,
  ): Promise<CodexAppServerThreadsResponse> {
    const pinnedThreadIds = await readDesktopPinnedThreadIds();
    const params: Record<string, unknown> = {};
    const archived = searchParams.get("archived");
    if (archived === "true") {
      params.archived = true;
    }
    if (archived === "false") {
      params.archived = false;
    }

    const cursor = searchParams.get("cursor");
    if (cursor) {
      params.cursor = cursor;
    }

    const cwd = searchParams.get("cwd");
    if (cwd) {
      params.cwd = cwd;
    }

    const limitValue = Number.parseInt(searchParams.get("limit") ?? "", 10);
    if (Number.isFinite(limitValue) && limitValue > 0) {
      params.limit = limitValue;
    }

    const searchTerm = searchParams.get("searchTerm");
    if (searchTerm) {
      params.searchTerm = searchTerm;
    }

    const sortKey = searchParams.get("sortKey");
    if (sortKey === "created_at" || sortKey === "updated_at") {
      params.sortKey = sortKey;
    }

    const sourceKinds = searchParams.get("sourceKinds");
    if (sourceKinds) {
      params.sourceKinds = sourceKinds
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    } else {
      // `thread/list` omits app-server sessions by default, but the research
      // page needs to see the threads it just created through this bridge.
      params.sourceKinds = DEFAULT_THREAD_SOURCE_KINDS;
    }

    const result = await this.sendRequestNoEnsure({
      method: "thread/list",
      params,
    });
    const record = asRecord(result);
    let threads = Array.isArray(record?.data)
      ? alignFallbackThreadProjects(
          await Promise.all(
            record.data
              .map((thread) => normalizeThread(thread))
              .filter(
                (thread): thread is CodexAppServerThread => thread !== null,
              )
              .map(async (thread) => ({
                thread,
                projectInfo: await readThreadProjectInfo(thread.cwd),
              })),
          ),
        )
      : [];

    const missingPinnedThreadIds = pinnedThreadIds.filter(
      (threadId) => !threads.some((thread) => thread.id === threadId),
    );
    if (missingPinnedThreadIds.length > 0 && archived !== "true") {
      const missingPinnedThreads = (
        await Promise.all(
          missingPinnedThreadIds.map((threadId) =>
            this.readThreadSummary(threadId),
          ),
        )
      ).filter((thread): thread is CodexAppServerThread => thread !== null);

      threads = [...threads, ...missingPinnedThreads].sort(
        (left, right) => right.updatedAt - left.updatedAt,
      );
    }

    return {
      threads,
      pinnedThreadIds,
      nextCursor: readString(record?.nextCursor) ?? null,
      runtime: this.getSnapshot(),
    };
  }

  async readThread(
    threadId: string,
  ): Promise<CodexAppServerThreadDetailResponse> {
    const result = await this.sendRequestNoEnsure({
      method: "thread/read",
      params: {
        threadId,
        includeTurns: true,
      },
    });
    const normalizedThread = normalizeThread(asRecord(result)?.thread);
    const thread =
      normalizedThread === null
        ? null
        : await enrichThreadProjectInfo(normalizedThread);
    if (!thread) {
      throw new Error("thread/read returned an invalid thread payload");
    }

    return {
      thread,
      runtime: this.getSnapshot(),
    };
  }

  /**
   * Surface the provider's in-memory thread inventory separately from the
   * persisted thread list so Noter can distinguish "currently loaded in the
   * runtime" from "known on disk".
   */
  async listLoadedThreads(
    searchParams: URLSearchParams,
  ): Promise<CodexAppServerLoadedThreadsResponse> {
    const params: Record<string, unknown> = {};

    const cursor = searchParams.get("cursor");
    if (cursor) {
      params.cursor = cursor;
    }

    const limitValue = Number.parseInt(searchParams.get("limit") ?? "", 10);
    if (Number.isFinite(limitValue) && limitValue > 0) {
      params.limit = limitValue;
    }

    const result = await this.sendRequestNoEnsure({
      method: "thread/loaded/list",
      params,
    });
    const record = asRecord(result);

    return {
      threadIds: readStringArray(record?.data),
      nextCursor: readString(record?.nextCursor) ?? null,
      runtime: this.getSnapshot(),
    };
  }

  async respondApproval(body: unknown) {
    const record = asRecord(body);
    const requestId = record?.requestId;
    const decision = readString(record?.decision);
    if (
      (typeof requestId !== "string" && typeof requestId !== "number") ||
      !decision
    ) {
      throw new Error("requestId and decision are required");
    }

    const pendingRequest = this.approvalRequests.get(requestId);
    if (!pendingRequest) {
      throw new Error("Approval request not found");
    }

    await this.ensureRuntime(false);
    const result: Record<string, unknown> = { decision };
    if (decision === "accept" && record?.acceptSettings !== undefined) {
      result.acceptSettings = record.acceptSettings;
    }

    this.writeMessage({
      id: requestId,
      result,
    });
    this.approvalRequests.delete(requestId);

    return {
      success: true,
      requestId,
      decision,
      requests: await this.listRequests(),
    };
  }

  async threadStart(body: unknown) {
    const record = asRecord(body) ?? {};
    const params: Record<string, unknown> = {};
    if (typeof record.model === "string") {
      params.model = record.model;
    }
    if (typeof record.cwd === "string") {
      params.cwd = record.cwd;
    }
    if (record.approvalPolicy !== undefined) {
      params.approvalPolicy = record.approvalPolicy;
    }
    applyThreadSandbox(params, record);
    if (typeof record.personality === "string") {
      params.personality = record.personality;
    }
    const persistExtendedHistory = readBoolean(record.persistExtendedHistory);
    if (persistExtendedHistory !== undefined) {
      params.persistExtendedHistory = persistExtendedHistory;
    }

    const result = await this.sendRequestNoEnsure({
      method: "thread/start",
      params,
    });
    const threadId = readString(asRecord(asRecord(result)?.thread)?.id);
    if (threadId) {
      this.currentThreadId = threadId;
    }
    return { result, runtime: this.getSnapshot() };
  }

  async threadResume(body: unknown) {
    const record = asRecord(body) ?? {};
    const threadId = readString(record.threadId);
    if (!threadId) {
      throw new Error("threadId is required");
    }

    const params: Record<string, unknown> = { threadId };
    applyCommonTurnOptions(params, record);
    delete params.sandboxPolicy;
    applyThreadSandbox(params, record);

    const result = await this.sendRequestNoEnsure({
      method: "thread/resume",
      params,
    });
    this.currentThreadId = threadId;
    return { result, runtime: this.getSnapshot() };
  }

  async threadArchive(body: unknown) {
    const record = asRecord(body) ?? {};
    const threadId = readString(record.threadId);
    if (!threadId) {
      throw new Error("threadId is required");
    }

    const result = await this.sendRequestNoEnsure({
      method: "thread/archive",
      params: { threadId },
    });

    return { result, runtime: this.getSnapshot() };
  }

  async threadUnarchive(body: unknown) {
    const record = asRecord(body) ?? {};
    const threadId = readString(record.threadId);
    if (!threadId) {
      throw new Error("threadId is required");
    }

    const result = await this.sendRequestNoEnsure({
      method: "thread/unarchive",
      params: { threadId },
    });

    return { result, runtime: this.getSnapshot() };
  }

  async turnStart(body: unknown) {
    const record = asRecord(body) ?? {};
    const threadId = readString(record.threadId) ?? this.currentThreadId;
    if (!threadId) {
      throw new Error("threadId is required");
    }

    const input = normalizeTurnInput(record);
    if (input === undefined) {
      throw new Error("input or text is required");
    }

    const params: Record<string, unknown> = {
      threadId,
      input,
    };
    applyCommonTurnOptions(params, record);
    if (record.outputSchema !== undefined) {
      params.outputSchema = record.outputSchema;
    }
    if (record.effort !== undefined) {
      params.effort = record.effort;
    }
    if (record.summary !== undefined) {
      params.summary = record.summary;
    }
    applySettingsOverrides(params, record.settings);

    const timeoutValue = record.timeoutMs;
    const timeoutMs =
      typeof timeoutValue === "number" && Number.isFinite(timeoutValue)
        ? timeoutValue
        : CODEX_RPC_TIMEOUT_MS;

    const result = await this.sendRequestNoEnsure({
      method: "turn/start",
      params,
      timeoutMs,
    });
    return { result, runtime: this.getSnapshot() };
  }

  async turnInterrupt(body: unknown) {
    const record = asRecord(body) ?? {};
    const threadId = readString(record.threadId) ?? this.currentThreadId;
    const turnId = readString(record.turnId);
    if (!threadId) {
      throw new Error("threadId is required");
    }
    if (!turnId) {
      throw new Error("turnId is required");
    }

    const result = await this.sendRequestNoEnsure({
      method: "turn/interrupt",
      params: { threadId, turnId },
    });
    return { result, runtime: this.getSnapshot() };
  }

  async generateProtocol(args: {
    mode: "json-schema" | "ts";
    experimental: boolean;
  }): Promise<CodexAppServerProtocolResponse> {
    const tempDir = await mkdtemp(
      path.join(tmpdir(), `noter-codex-${args.mode}-`),
    );
    try {
      const commandArgs = [
        "app-server",
        args.mode === "json-schema" ? "generate-json-schema" : "generate-ts",
        "--out",
        tempDir,
      ];
      if (args.experimental) {
        commandArgs.push("--experimental");
      }

      await execFileAsync("codex", commandArgs, {
        cwd: this.workspaceRoot,
        timeout: 60_000,
      });

      const files = await readFilesRecursively({ rootDir: tempDir });
      return {
        generatedAt: Date.now(),
        experimental: args.experimental,
        files,
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

function buildRouter(args: { runtime: CodexAppServerResearchRuntime }) {
  return async function codexAppServerResearchRouter(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith(CODEX_APP_SERVER_RESEARCH_API_BASE)) {
      next();
      return;
    }

    const routePath =
      url.pathname.slice(CODEX_APP_SERVER_RESEARCH_API_BASE.length) || "/";

    try {
      if (req.method === "GET" && routePath === "/status") {
        sendJson(res, 200, await args.runtime.getStatus());
        return;
      }

      if (req.method === "POST" && routePath === "/runtime/ensure") {
        const body = asRecord(await readJsonBody(req)) ?? {};
        sendJson(
          res,
          200,
          await args.runtime.ensureRuntime(body.forceRestart === true),
        );
        return;
      }

      if (req.method === "POST" && routePath === "/runtime/stop") {
        sendJson(res, 200, await args.runtime.stopRuntime());
        return;
      }

      if (req.method === "GET" && routePath === "/events") {
        const sinceParam = Number.parseInt(
          url.searchParams.get("since") ?? "0",
          10,
        );
        const since = Number.isFinite(sinceParam) ? sinceParam : 0;
        sendJson(res, 200, await args.runtime.listEvents(since));
        return;
      }

      if (req.method === "GET" && routePath === "/requests") {
        sendJson(res, 200, await args.runtime.listRequests());
        return;
      }

      if (req.method === "GET" && routePath === "/threads") {
        await args.runtime.ensureRuntime(false);
        sendJson(res, 200, await args.runtime.listThreads(url.searchParams));
        return;
      }

      if (req.method === "GET" && routePath === "/threads/loaded") {
        await args.runtime.ensureRuntime(false);
        sendJson(
          res,
          200,
          await args.runtime.listLoadedThreads(url.searchParams),
        );
        return;
      }

      if (req.method === "GET" && routePath.startsWith("/threads/")) {
        const encodedThreadId = routePath.slice("/threads/".length);
        const threadId = decodeURIComponent(encodedThreadId);
        if (threadId.length === 0) {
          sendJson(res, 400, { error: "threadId is required" });
          return;
        }

        await args.runtime.ensureRuntime(false);
        sendJson(res, 200, await args.runtime.readThread(threadId));
        return;
      }

      if (req.method === "POST" && routePath === "/approval/respond") {
        sendJson(
          res,
          200,
          await args.runtime.respondApproval(await readJsonBody(req)),
        );
        return;
      }

      if (req.method === "POST" && routePath === "/thread/start") {
        await args.runtime.ensureRuntime(false);
        sendJson(
          res,
          200,
          await args.runtime.threadStart(await readJsonBody(req)),
        );
        return;
      }

      if (req.method === "POST" && routePath === "/thread/resume") {
        await args.runtime.ensureRuntime(false);
        sendJson(
          res,
          200,
          await args.runtime.threadResume(await readJsonBody(req)),
        );
        return;
      }

      if (req.method === "POST" && routePath === "/thread/archive") {
        await args.runtime.ensureRuntime(false);
        sendJson(
          res,
          200,
          await args.runtime.threadArchive(await readJsonBody(req)),
        );
        return;
      }

      if (req.method === "POST" && routePath === "/thread/unarchive") {
        await args.runtime.ensureRuntime(false);
        sendJson(
          res,
          200,
          await args.runtime.threadUnarchive(await readJsonBody(req)),
        );
        return;
      }

      if (req.method === "POST" && routePath === "/turn/start") {
        await args.runtime.ensureRuntime(false);
        sendJson(
          res,
          200,
          await args.runtime.turnStart(await readJsonBody(req)),
        );
        return;
      }

      if (req.method === "POST" && routePath === "/turn/interrupt") {
        await args.runtime.ensureRuntime(false);
        sendJson(
          res,
          200,
          await args.runtime.turnInterrupt(await readJsonBody(req)),
        );
        return;
      }

      if (req.method === "GET" && routePath === "/protocol/json-schema") {
        sendJson(
          res,
          200,
          await args.runtime.generateProtocol({
            mode: "json-schema",
            experimental: url.searchParams.get("experimental") === "1",
          }),
        );
        return;
      }

      if (req.method === "GET" && routePath === "/protocol/ts") {
        sendJson(
          res,
          200,
          await args.runtime.generateProtocol({
            mode: "ts",
            experimental: url.searchParams.get("experimental") === "1",
          }),
        );
        return;
      }

      sendJson(res, 404, {
        error: `Unknown Codex research route: ${routePath}`,
      });
    } catch (error) {
      sendJson(res, 500, { error: describeError(error) });
    }
  };
}

/**
 * Register a dev-only local bridge around `codex app-server` so the browser,
 * CLI, and Playwright can all exercise the same exploratory surface.
 */
export function codexAppServerResearchBridgePlugin(args: {
  workspaceRoot: string;
}): Plugin {
  return {
    name: "codex-app-server-research-bridge",
    configureServer(server: ViteDevServer) {
      const runtime = new CodexAppServerResearchRuntime(args.workspaceRoot);
      const router = buildRouter({ runtime });
      server.middlewares.use((req, res, next) => {
        void router(req, res, next);
      });
    },
  };
}
