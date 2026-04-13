const express = require("express");
const { exec, spawn } = require("child_process");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

const app = express();
app.use(express.json({ limit: "50mb" }));

const AGENT_TOKEN_FILE = path.join(__dirname, ".agent-token");
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || "/workspaces";
const WORKSPACE_ROOT_PATH = path.resolve(WORKSPACE_DIR);
const WORKSPACE_ROOT_REAL_PATH = fsSync.realpathSync(WORKSPACE_ROOT_PATH);
const CODEX_RPC_TIMEOUT_MS = 120000;
const CODEX_INIT_TIMEOUT_MS = 30000;
const CODEX_EVENT_BUFFER_SIZE = 500;
const CODEX_REQUEST_BUFFER_SIZE = 100;
const CODEX_APPROVAL_CONTEXT_BUFFER_SIZE = 100;
const AGENT_TOKEN_BOOTSTRAP_WINDOW_MS = 10 * 60 * 1000;
const AGENT_TOKEN_BOOTSTRAP_MAX_ATTEMPTS = 5;
const AGENT_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeToken(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readPersistedAgentToken() {
  try {
    if (!fsSync.existsSync(AGENT_TOKEN_FILE)) {
      return null;
    }
    const persisted = fsSync.readFileSync(AGENT_TOKEN_FILE, "utf8");
    return normalizeToken(persisted);
  } catch (error) {
    console.warn(
      `[AGENT] Failed to read persisted token from ${AGENT_TOKEN_FILE}: ${String(error)}`,
    );
    return null;
  }
}

function loadInitialTokenState() {
  const fromEnv = normalizeToken(process.env.CODESPACE_AGENT_TOKEN);
  if (fromEnv) {
    return { token: fromEnv, source: "env" };
  }

  const fromFile = readPersistedAgentToken();
  if (fromFile) {
    return { token: fromFile, source: "persisted" };
  }

  return { token: null, source: "runtime" };
}

async function persistAgentToken(token) {
  try {
    await fs.writeFile(AGENT_TOKEN_FILE, `${token}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.chmod(AGENT_TOKEN_FILE, 0o600);
  } catch (error) {
    console.warn(
      `[AGENT] Failed to persist token to ${AGENT_TOKEN_FILE}: ${String(error)}`,
    );
  }
}

const initialTokenState = loadInitialTokenState();
let AGENT_TOKEN = initialTokenState.token;
let AGENT_TOKEN_SOURCE = initialTokenState.source;
const serverStartAt = Date.now();
const agentTokenBootstrapAttemptsByClient = new Map();

const codexRuntime = {
  process: null,
  startPromise: null,
  initialized: false,
  nextRpcId: 1,
  pendingRpc: new Map(),
  pendingApprovals: new Map(),
  notifications: [],
  nextEventCursor: 1,
  stdoutBuffer: "",
  startedAt: null,
  lastError: null,
  lastExitCode: null,
  lastExitSignal: null,
  currentThreadId: null,
  approvalContextByItemId: new Map(),
};

console.log("=".repeat(60));
console.log("Codespace Agent Starting");
console.log("=".repeat(60));
if (AGENT_TOKEN) {
  console.log(
    `Agent Token: ${AGENT_TOKEN.substring(0, 8)}... (${AGENT_TOKEN_SOURCE})`,
  );
} else {
  console.log(
    "Agent Token: <unset> (bootstrap allowed during initial startup window)",
  );
}
console.log(`Workspace Dir: ${WORKSPACE_DIR}`);
console.log("=".repeat(60));

/**
 * Middleware: Authenticate all requests except health check
 */
function authenticateToken(req, res, next) {
  // Allow health checks without auth
  if (req.path === "/health") {
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = normalizeToken(authHeader?.replace("Bearer ", ""));

  if (!AGENT_TOKEN) {
    if (!token) {
      console.warn(
        `Unauthorized request from ${req.ip} to ${req.path} (missing token)`,
      );
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (Date.now() - serverStartAt > AGENT_TOKEN_BOOTSTRAP_WINDOW_MS) {
      console.warn(
        `Rejected bootstrap request from ${req.ip} to ${req.path} after startup window expired`,
      );
      return res
        .status(503)
        .json({ error: "Agent token bootstrap window expired" });
    }

    const bootstrapClientKey = getBootstrapClientKey(req);
    const bootstrapAttempts = recordBootstrapAttempt(bootstrapClientKey);
    if (bootstrapAttempts > AGENT_TOKEN_BOOTSTRAP_MAX_ATTEMPTS) {
      console.warn(
        `Rejected bootstrap request from ${req.ip} to ${req.path} after too many attempts`,
      );
      return res.status(429).json({ error: "Too many bootstrap attempts" });
    }

    if (!AGENT_TOKEN_PATTERN.test(token)) {
      console.warn(
        `Rejected bootstrap request from ${req.ip} to ${req.path} (invalid token format)`,
      );
      return res.status(401).json({ error: "Unauthorized" });
    }

    AGENT_TOKEN = token;
    AGENT_TOKEN_SOURCE = "request";
    agentTokenBootstrapAttemptsByClient.delete(bootstrapClientKey);
    void persistAgentToken(token);
    console.log("Agent token initialized from bootstrap request");
    return next();
  }

  if (token !== AGENT_TOKEN) {
    console.warn(`Unauthorized request from ${req.ip} to ${req.path}`);
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

function getBootstrapClientKey(req) {
  if (typeof req.ip === "string" && req.ip.length > 0) {
    return req.ip;
  }
  return "unknown";
}

function recordBootstrapAttempt(clientKey) {
  const now = Date.now();
  const entry = agentTokenBootstrapAttemptsByClient.get(clientKey);
  if (!entry || entry.expiresAt <= now) {
    agentTokenBootstrapAttemptsByClient.set(clientKey, {
      attempts: 1,
      expiresAt: now + AGENT_TOKEN_BOOTSTRAP_WINDOW_MS,
    });
    return 1;
  }

  const attempts = entry.attempts + 1;
  agentTokenBootstrapAttemptsByClient.set(clientKey, {
    attempts,
    expiresAt: entry.expiresAt,
  });
  return attempts;
}

app.use(authenticateToken);

function parseErrorMessage(error) {
  if (!error) {
    return "Unknown error";
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isCodexRuntimeRunning() {
  return Boolean(
    codexRuntime.process &&
    !codexRuntime.process.killed &&
    codexRuntime.process.exitCode === null,
  );
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWithinWorkspacePath(candidatePath) {
  return (
    candidatePath === WORKSPACE_ROOT_REAL_PATH ||
    candidatePath.startsWith(`${WORKSPACE_ROOT_REAL_PATH}${path.sep}`)
  );
}

function resolveWorkspacePath(inputPath, allowWorkspaceRoot = false) {
  if (typeof inputPath !== "string") {
    throw new Error("Path is required");
  }

  const normalizedInput = inputPath.trim();
  if (!allowWorkspaceRoot && normalizedInput.length === 0) {
    throw new Error("Path is required");
  }

  const fullPath = path.resolve(WORKSPACE_ROOT_PATH, normalizedInput);
  const relativePath = path.relative(WORKSPACE_ROOT_PATH, fullPath);

  if (!allowWorkspaceRoot && relativePath.length === 0) {
    throw new Error("Path outside workspace not allowed");
  }

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Path outside workspace not allowed");
  }

  if (relativePath.length === 0) {
    return {
      safePath: relativePath,
      fullPath: WORKSPACE_ROOT_REAL_PATH,
    };
  }

  const pathSegments = relativePath.split(path.sep).filter(Boolean);
  let resolvedPrefix = WORKSPACE_ROOT_REAL_PATH;
  for (let index = 0; index < pathSegments.length; index += 1) {
    const segment = pathSegments[index];
    const candidatePath = path.join(resolvedPrefix, segment);
    if (!fsSync.existsSync(candidatePath)) {
      return {
        safePath: relativePath,
        fullPath: path.join(resolvedPrefix, ...pathSegments.slice(index)),
      };
    }

    const stats = fsSync.lstatSync(candidatePath);
    if (stats.isSymbolicLink()) {
      throw new Error("Path outside workspace not allowed");
    }

    const realPath = fsSync.realpathSync(candidatePath);
    if (!isWithinWorkspacePath(realPath)) {
      throw new Error("Path outside workspace not allowed");
    }
    resolvedPrefix = realPath;
  }

  return {
    safePath: relativePath,
    fullPath: resolvedPrefix,
  };
}

function cloneJsonValue(value) {
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function upsertApprovalContext(itemId, patch) {
  if (typeof itemId !== "string" || itemId.length === 0 || !isRecord(patch)) {
    return;
  }

  const previous = codexRuntime.approvalContextByItemId.get(itemId);
  codexRuntime.approvalContextByItemId.set(itemId, {
    ...(isRecord(previous) ? previous : {}),
    ...patch,
  });

  while (
    codexRuntime.approvalContextByItemId.size >
    CODEX_APPROVAL_CONTEXT_BUFFER_SIZE
  ) {
    const oldestKey = codexRuntime.approvalContextByItemId.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    codexRuntime.approvalContextByItemId.delete(oldestKey);
  }
}

function rememberApprovalContext(method, params) {
  if (!isRecord(params)) {
    return;
  }

  if (method === "item/started" || method === "item/completed") {
    const item = params.item;
    if (!isRecord(item) || typeof item.id !== "string") {
      return;
    }

    if (item.type === "fileChange") {
      upsertApprovalContext(item.id, {
        changeList: cloneJsonValue(item.changes),
      });
      return;
    }

    if (item.type === "commandExecution") {
      upsertApprovalContext(item.id, {
        commandText:
          typeof item.command === "string" ? item.command : undefined,
        cwd: typeof item.cwd === "string" ? item.cwd : undefined,
        commandActions: cloneJsonValue(item.commandActions),
      });
    }

    return;
  }

  if (!method.startsWith("codex/event/")) {
    return;
  }

  const msg = params.msg;
  if (!isRecord(msg) || typeof msg.call_id !== "string") {
    return;
  }

  if (
    method === "codex/event/apply_patch_approval_request" ||
    method === "codex/event/patch_apply_begin" ||
    method === "codex/event/patch_apply_end"
  ) {
    upsertApprovalContext(msg.call_id, {
      fileChanges: cloneJsonValue(msg.changes),
    });
    return;
  }

  if (
    method === "codex/event/exec_command_begin" ||
    method === "codex/event/exec_command_end"
  ) {
    upsertApprovalContext(msg.call_id, {
      command: cloneJsonValue(msg.command),
      cwd: typeof msg.cwd === "string" ? msg.cwd : undefined,
      parsedCommand: cloneJsonValue(msg.parsed_cmd),
    });
  }
}

function withApprovalContext(requestId, method, params) {
  const baseParams = isRecord(params) ? cloneJsonValue(params) : {};
  const enrichedParams = isRecord(baseParams) ? baseParams : {};

  enrichedParams.requestId = requestId;

  if (method === "item/fileChange/requestApproval") {
    const itemId = enrichedParams.itemId;
    const context =
      typeof itemId === "string"
        ? codexRuntime.approvalContextByItemId.get(itemId)
        : null;
    if (isRecord(context)) {
      if (context.fileChanges !== undefined) {
        enrichedParams.fileChanges = cloneJsonValue(context.fileChanges);
      }
      if (context.changeList !== undefined) {
        enrichedParams.changes = cloneJsonValue(context.changeList);
      }
    }
  }

  if (method === "item/commandExecution/requestApproval") {
    const itemId = enrichedParams.itemId;
    const context =
      typeof itemId === "string"
        ? codexRuntime.approvalContextByItemId.get(itemId)
        : null;
    if (isRecord(context)) {
      if (context.command !== undefined) {
        enrichedParams.command = cloneJsonValue(context.command);
      }
      if (typeof context.commandText === "string") {
        enrichedParams.commandText = context.commandText;
      }
      if (typeof context.cwd === "string") {
        enrichedParams.cwd = context.cwd;
      }
      if (context.commandActions !== undefined) {
        enrichedParams.commandActions = cloneJsonValue(context.commandActions);
      }
      if (context.parsedCommand !== undefined) {
        enrichedParams.parsedCommand = cloneJsonValue(context.parsedCommand);
      }
    }
  }

  return enrichedParams;
}

function normalizeTurnInput(body) {
  const rawInput =
    body?.input !== undefined
      ? body.input
      : typeof body?.text === "string"
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

  if (isRecord(rawInput)) {
    return [rawInput];
  }

  return undefined;
}

function normalizeSandboxMode(value) {
  if (
    value === "read-only" ||
    value === "workspace-write" ||
    value === "danger-full-access"
  ) {
    return value;
  }

  if (!isRecord(value) || typeof value.type !== "string") {
    return undefined;
  }

  if (value.type === "readOnly") {
    return "read-only";
  }

  if (value.type === "workspaceWrite") {
    return "workspace-write";
  }

  if (value.type === "dangerFullAccess") {
    return "danger-full-access";
  }

  return undefined;
}

function normalizeSandboxPolicy(value) {
  if (isRecord(value)) {
    return cloneJsonValue(value);
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

function applyThreadSandbox(params, body) {
  const sandbox =
    body?.sandbox !== undefined
      ? normalizeSandboxMode(body.sandbox)
      : normalizeSandboxMode(body?.sandboxPolicy);
  if (sandbox !== undefined) {
    params.sandbox = sandbox;
  }
}

function applyTurnSandboxPolicy(params, body) {
  const sandboxPolicy =
    body?.sandboxPolicy !== undefined
      ? normalizeSandboxPolicy(body.sandboxPolicy)
      : normalizeSandboxPolicy(body?.sandbox);
  if (sandboxPolicy !== undefined) {
    params.sandboxPolicy = sandboxPolicy;
  }
}

function applyCommonTurnOptions(params, body) {
  if (typeof body?.cwd === "string") params.cwd = body.cwd;
  if (body?.approvalPolicy !== undefined) {
    params.approvalPolicy = body.approvalPolicy;
  }
  applyTurnSandboxPolicy(params, body);
  if (typeof body?.model === "string") params.model = body.model;
  if (typeof body?.personality === "string") {
    params.personality = body.personality;
  }
}

function applySettingsOverrides(params, settings) {
  if (!isRecord(settings)) {
    return;
  }

  if (params.model === undefined && typeof settings.model === "string") {
    params.model = settings.model;
  }

  const effort =
    typeof settings.effort === "string"
      ? settings.effort
      : typeof settings.reasoningEffort === "string"
        ? settings.reasoningEffort
        : typeof settings.reasoning_effort === "string"
          ? settings.reasoning_effort
          : undefined;
  if (params.effort === undefined && effort !== undefined) {
    params.effort = effort;
  }

  const summary =
    typeof settings.summary === "string"
      ? settings.summary
      : typeof settings.reasoningSummary === "string"
        ? settings.reasoningSummary
        : typeof settings.reasoning_summary === "string"
          ? settings.reasoning_summary
          : undefined;
  if (params.summary === undefined && summary !== undefined) {
    params.summary = summary;
  }
}

function pushCodexEvent(method, params) {
  codexRuntime.notifications.push({
    cursor: codexRuntime.nextEventCursor++,
    at: Date.now(),
    method,
    params,
  });

  if (codexRuntime.notifications.length > CODEX_EVENT_BUFFER_SIZE) {
    codexRuntime.notifications.shift();
  }
}

function rejectPendingRpcRequests(message) {
  for (const [rpcId, pending] of codexRuntime.pendingRpc.entries()) {
    clearTimeout(pending.timeoutId);
    pending.reject(new Error(message));
    codexRuntime.pendingRpc.delete(rpcId);
  }
}

function resetCodexRuntimeState(exitCode = null, exitSignal = null) {
  codexRuntime.initialized = false;
  codexRuntime.stdoutBuffer = "";
  codexRuntime.currentThreadId = null;
  codexRuntime.pendingApprovals.clear();
  codexRuntime.approvalContextByItemId.clear();
  codexRuntime.process = null;
  codexRuntime.lastExitCode = exitCode;
  codexRuntime.lastExitSignal = exitSignal;
  rejectPendingRpcRequests("Codex app-server process ended");
}

function parseCodexMessageLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch (error) {
    console.warn(`[CODEX] Failed to parse JSON-RPC line: ${trimmed}`);
    console.warn(`[CODEX] Parse error: ${parseErrorMessage(error)}`);
    return;
  }

  if (!isRecord(message)) {
    console.warn(`[CODEX] Ignoring non-object JSON-RPC payload: ${trimmed}`);
    return;
  }

  const hasId = Object.prototype.hasOwnProperty.call(message, "id");
  const hasMethod = typeof message.method === "string";
  const hasResult = Object.prototype.hasOwnProperty.call(message, "result");
  const hasError = Object.prototype.hasOwnProperty.call(message, "error");

  if (hasMethod) {
    rememberApprovalContext(message.method, message.params);
  }

  if (hasId && (hasResult || hasError)) {
    const pending = codexRuntime.pendingRpc.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeoutId);
    codexRuntime.pendingRpc.delete(message.id);

    if (hasError) {
      const errorMessage =
        typeof message.error?.message === "string"
          ? message.error.message
          : `Codex RPC ${pending.method} failed`;
      pending.reject(new Error(errorMessage));
      return;
    }

    pending.resolve(message.result);
    return;
  }

  if (hasId && hasMethod) {
    const approvalParams = withApprovalContext(
      message.id,
      message.method,
      message.params,
    );
    codexRuntime.pendingApprovals.set(message.id, {
      id: message.id,
      method: message.method,
      params: approvalParams,
      createdAt: Date.now(),
    });

    if (codexRuntime.pendingApprovals.size > CODEX_REQUEST_BUFFER_SIZE) {
      const oldestRequestId = codexRuntime.pendingApprovals.keys().next().value;
      codexRuntime.pendingApprovals.delete(oldestRequestId);
    }

    pushCodexEvent(message.method, approvalParams);
    return;
  }

  if (hasMethod) {
    pushCodexEvent(message.method, message.params);
  }
}

function writeCodexMessage(message) {
  if (!isCodexRuntimeRunning()) {
    throw new Error("Codex app-server is not running");
  }
  codexRuntime.process.stdin.write(`${JSON.stringify(message)}\n`);
}

function sendCodexRequestNoEnsure(
  method,
  params = {},
  timeoutMs = CODEX_RPC_TIMEOUT_MS,
) {
  if (!isCodexRuntimeRunning()) {
    return Promise.reject(new Error("Codex app-server is not running"));
  }

  const rpcId = codexRuntime.nextRpcId++;
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      codexRuntime.pendingRpc.delete(rpcId);
      reject(new Error(`Codex RPC timeout for method: ${method}`));
    }, timeoutMs);

    codexRuntime.pendingRpc.set(rpcId, {
      method,
      resolve,
      reject,
      timeoutId,
    });

    try {
      writeCodexMessage({
        id: rpcId,
        method,
        params,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      codexRuntime.pendingRpc.delete(rpcId);
      reject(error);
    }
  });
}

function sendCodexNotificationNoEnsure(method, params = {}) {
  writeCodexMessage({
    method,
    params,
  });
}

async function ensureCodexBinary() {
  return await new Promise((resolve, reject) => {
    exec("codex --version", { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        const details = stderr?.trim() || error.message;
        reject(new Error(details));
        return;
      }

      resolve((stdout || "").trim());
    });
  });
}

async function getCodexBinaryStatus() {
  try {
    const version = await ensureCodexBinary();
    return {
      installed: true,
      version,
      error: null,
    };
  } catch (error) {
    return {
      installed: false,
      version: null,
      error: parseErrorMessage(error),
    };
  }
}

async function stopCodexRuntime() {
  if (!codexRuntime.process) {
    return;
  }

  const proc = codexRuntime.process;
  if (proc.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      resolve();
    };

    const timeoutId = setTimeout(() => {
      if (proc.exitCode === null) {
        proc.kill("SIGKILL");
      }
      finish();
    }, 5000);

    proc.once("exit", () => {
      clearTimeout(timeoutId);
      finish();
    });

    proc.kill("SIGTERM");
  });
}

async function startCodexRuntime(forceRestart = false) {
  if (forceRestart) {
    await stopCodexRuntime();
  }

  if (codexRuntime.initialized && isCodexRuntimeRunning()) {
    return;
  }

  if (codexRuntime.startPromise) {
    await codexRuntime.startPromise;
    return;
  }

  codexRuntime.startPromise = (async () => {
    const version = await ensureCodexBinary();
    console.log(`[CODEX] Found codex binary: ${version}`);

    const proc = spawn("codex", ["app-server", "--listen", "stdio://"], {
      cwd: WORKSPACE_DIR,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    codexRuntime.process = proc;
    codexRuntime.initialized = false;
    codexRuntime.startedAt = Date.now();
    codexRuntime.lastError = null;

    proc.stdout.on("data", (chunk) => {
      codexRuntime.stdoutBuffer += chunk.toString();
      while (true) {
        const newlineIndex = codexRuntime.stdoutBuffer.indexOf("\n");
        if (newlineIndex === -1) {
          break;
        }
        const line = codexRuntime.stdoutBuffer.slice(0, newlineIndex);
        codexRuntime.stdoutBuffer = codexRuntime.stdoutBuffer.slice(
          newlineIndex + 1,
        );
        parseCodexMessageLine(line);
      }
    });

    proc.stderr.on("data", (chunk) => {
      const stderrText = chunk.toString().trim();
      if (!stderrText) {
        return;
      }
      for (const line of stderrText.split("\n")) {
        console.warn(`[CODEX stderr] ${line}`);
      }
    });

    proc.on("error", (error) => {
      codexRuntime.lastError = parseErrorMessage(error);
      console.error(`[CODEX] Process error: ${codexRuntime.lastError}`);
    });

    proc.on("exit", (code, signal) => {
      console.warn(
        `[CODEX] app-server exited with code=${code} signal=${signal}`,
      );
      codexRuntime.lastError = `Codex app-server exited (code=${code}, signal=${signal})`;
      resetCodexRuntimeState(code, signal);
      pushCodexEvent("codex/runtime_exit", {
        code,
        signal,
      });
    });

    try {
      await sendCodexRequestNoEnsure(
        "initialize",
        {
          clientInfo: {
            name: "noter_codespace_agent",
            title: "Noter Codespace Agent",
            version: "0.1.0",
          },
        },
        CODEX_INIT_TIMEOUT_MS,
      );
      sendCodexNotificationNoEnsure("initialized", {});
      codexRuntime.initialized = true;
      pushCodexEvent("codex/runtime_ready", {
        startedAt: codexRuntime.startedAt,
      });
    } catch (error) {
      codexRuntime.lastError = parseErrorMessage(error);
      console.error(`[CODEX] Initialization failed: ${codexRuntime.lastError}`);
      await stopCodexRuntime();
      throw error;
    }
  })();

  try {
    await codexRuntime.startPromise;
  } finally {
    codexRuntime.startPromise = null;
  }
}

async function sendCodexRequest(
  method,
  params = {},
  timeoutMs = CODEX_RPC_TIMEOUT_MS,
) {
  await startCodexRuntime(false);
  return await sendCodexRequestNoEnsure(method, params, timeoutMs);
}

function getCodexRuntimeSnapshot() {
  return {
    running: isCodexRuntimeRunning(),
    initialized: codexRuntime.initialized,
    startedAt: codexRuntime.startedAt,
    currentThreadId: codexRuntime.currentThreadId,
    lastError: codexRuntime.lastError,
    lastExitCode: codexRuntime.lastExitCode,
    lastExitSignal: codexRuntime.lastExitSignal,
    pendingRequestCount: codexRuntime.pendingRpc.size,
    pendingApprovalCount: codexRuntime.pendingApprovals.size,
    eventCursor: codexRuntime.nextEventCursor - 1,
  };
}

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    authConfigured: Boolean(AGENT_TOKEN),
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

app.get("/codex/status", async (_req, res) => {
  const binaryStatus = await getCodexBinaryStatus();

  res.json({
    codexInstalled: binaryStatus.installed,
    codexVersion: binaryStatus.version,
    codexInstallError: binaryStatus.error,
    runtime: getCodexRuntimeSnapshot(),
  });
});

app.post("/codex/runtime/ensure", async (req, res) => {
  const forceRestart = req.body?.forceRestart === true;

  try {
    await startCodexRuntime(forceRestart);
    res.json({
      success: true,
      runtime: getCodexRuntimeSnapshot(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: parseErrorMessage(error),
      runtime: getCodexRuntimeSnapshot(),
    });
  }
});

app.get("/codex/events", (req, res) => {
  const since = Number.parseInt(`${req.query.since ?? 0}`, 10);
  const safeSince = Number.isFinite(since) ? since : 0;
  const events = codexRuntime.notifications.filter(
    (event) => event.cursor > safeSince,
  );
  res.json({
    events,
    nextCursor: codexRuntime.nextEventCursor - 1,
  });
});

app.get("/codex/requests", (_req, res) => {
  const requests = Array.from(codexRuntime.pendingApprovals.values()).sort(
    (left, right) => left.createdAt - right.createdAt,
  );
  res.json({ requests });
});

app.post("/codex/approval/respond", async (req, res) => {
  const requestId = req.body?.requestId;
  const decision = req.body?.decision;
  const acceptSettings = req.body?.acceptSettings;

  if (typeof requestId !== "number" && typeof requestId !== "string") {
    return res
      .status(400)
      .json({ error: "requestId (string or number) is required" });
  }
  if (
    decision !== "accept" &&
    decision !== "acceptForSession" &&
    decision !== "decline" &&
    decision !== "cancel"
  ) {
    return res.status(400).json({
      error: "decision must be accept, acceptForSession, decline, or cancel",
    });
  }

  const pendingRequest = codexRuntime.pendingApprovals.get(requestId);
  if (!pendingRequest) {
    return res.status(404).json({ error: "Approval request not found" });
  }

  try {
    await startCodexRuntime(false);
    const result = { decision };
    if (decision === "accept" && acceptSettings !== undefined) {
      result.acceptSettings = acceptSettings;
    }

    writeCodexMessage({
      id: requestId,
      result,
    });
    codexRuntime.pendingApprovals.delete(requestId);

    res.json({
      success: true,
      requestId,
      decision,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: parseErrorMessage(error),
    });
  }
});

app.post("/codex/thread/start", async (req, res) => {
  try {
    const params = {};
    if (typeof req.body?.model === "string") params.model = req.body.model;
    if (typeof req.body?.cwd === "string") params.cwd = req.body.cwd;
    if (req.body?.approvalPolicy !== undefined) {
      params.approvalPolicy = req.body.approvalPolicy;
    }
    applyThreadSandbox(params, req.body);
    if (typeof req.body?.personality === "string") {
      params.personality = req.body.personality;
    }
    if (typeof req.body?.persistExtendedHistory === "boolean") {
      params.persistExtendedHistory = req.body.persistExtendedHistory;
    }

    const result = await sendCodexRequest("thread/start", params);
    const threadId = result?.thread?.id;
    if (typeof threadId === "string") {
      codexRuntime.currentThreadId = threadId;
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: parseErrorMessage(error) });
  }
});

app.post("/codex/thread/resume", async (req, res) => {
  const threadId = req.body?.threadId;
  if (typeof threadId !== "string" || threadId.length === 0) {
    return res.status(400).json({ error: "threadId is required" });
  }

  try {
    const params = { threadId };
    applyCommonTurnOptions(params, req.body);
    delete params.sandboxPolicy;
    applyThreadSandbox(params, req.body);

    const result = await sendCodexRequest("thread/resume", params);
    codexRuntime.currentThreadId = threadId;
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: parseErrorMessage(error) });
  }
});

app.post("/codex/turn/start", async (req, res) => {
  const threadId =
    typeof req.body?.threadId === "string"
      ? req.body.threadId
      : codexRuntime.currentThreadId;
  if (!threadId) {
    return res.status(400).json({ error: "threadId is required" });
  }

  const input = normalizeTurnInput(req.body);
  if (input === undefined) {
    return res.status(400).json({ error: "input (or text) is required" });
  }

  try {
    const params = {
      threadId,
      input,
    };
    applyCommonTurnOptions(params, req.body);
    if (req.body?.outputSchema !== undefined) {
      params.outputSchema = req.body.outputSchema;
    }
    if (req.body?.effort !== undefined) {
      params.effort = req.body.effort;
    }
    if (req.body?.summary !== undefined) {
      params.summary = req.body.summary;
    }
    applySettingsOverrides(params, req.body?.settings);

    const timeoutMs =
      typeof req.body?.timeoutMs === "number" &&
      Number.isFinite(req.body.timeoutMs)
        ? req.body.timeoutMs
        : CODEX_RPC_TIMEOUT_MS;

    const result = await sendCodexRequest("turn/start", params, timeoutMs);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: parseErrorMessage(error) });
  }
});

app.post("/codex/turn/interrupt", async (req, res) => {
  const threadId =
    typeof req.body?.threadId === "string"
      ? req.body.threadId
      : codexRuntime.currentThreadId;
  const turnId = req.body?.turnId;

  if (!threadId || typeof threadId !== "string") {
    return res.status(400).json({ error: "threadId is required" });
  }
  if (typeof turnId !== "string" || turnId.length === 0) {
    return res.status(400).json({ error: "turnId is required" });
  }

  try {
    const result = await sendCodexRequest("turn/interrupt", {
      threadId,
      turnId,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: parseErrorMessage(error) });
  }
});

/**
 * Execute shell command
 * POST /exec
 * Body: { command: string, workingDir?: string, timeoutMs?: number }
 */
app.post("/exec", (req, res) => {
  const { command, workingDir, timeoutMs } = req.body;

  if (!command) {
    return res.status(400).json({ error: "Command is required" });
  }

  const cwd = workingDir || WORKSPACE_DIR;
  const timeout = timeoutMs || 60000;

  console.log(`[EXEC] Running command in ${cwd}:`);
  console.log(`       ${command}`);

  exec(
    command,
    {
      cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    },
    (error, stdout, stderr) => {
      const exitCode =
        typeof error?.code === "number" ? error.code : error ? 1 : 0;

      console.log(`[EXEC] Command completed with exit code: ${exitCode}`);
      if (stdout) console.log(`[EXEC] stdout: ${stdout.substring(0, 200)}...`);
      if (stderr) console.warn(`[EXEC] stderr: ${stderr.substring(0, 200)}...`);

      res.json({
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode,
        success: exitCode === 0,
      });
    },
  );
});

/**
 * Write file
 * POST /files/write
 * Body: { filePath: string, content: string }
 */
app.post("/files/write", async (req, res) => {
  const { filePath, content } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: "filePath is required" });
  }

  if (content === undefined) {
    return res.status(400).json({ error: "content is required" });
  }

  let safePath;
  let fullPath;
  try {
    ({ safePath, fullPath } = resolveWorkspacePath(filePath));
  } catch {
    return res
      .status(403)
      .json({ error: "Path outside workspace not allowed" });
  }

  try {
    console.log(`[WRITE] Writing file: ${safePath}`);

    // Create directory if it doesn't exist
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // Write file
    await fs.writeFile(fullPath, content, "utf8");

    console.log(`[WRITE] File written successfully: ${safePath}`);

    res.json({ success: true, filePath: safePath });
  } catch (error) {
    console.error(`[WRITE] Error writing file ${safePath}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Read file
 * GET /files/read?filePath=<path>
 */
app.get("/files/read", async (req, res) => {
  const { filePath } = req.query;

  if (!filePath) {
    return res.status(400).json({ error: "filePath is required" });
  }

  let safePath;
  let fullPath;
  try {
    ({ safePath, fullPath } = resolveWorkspacePath(filePath));
  } catch {
    return res
      .status(403)
      .json({ error: "Path outside workspace not allowed" });
  }

  try {
    console.log(`[READ] Reading file: ${safePath}`);

    const content = await fs.readFile(fullPath, "utf8");

    console.log(
      `[READ] File read successfully: ${safePath} (${content.length} bytes)`,
    );

    res.json({ content, filePath: safePath });
  } catch (error) {
    console.error(`[READ] Error reading file ${safePath}:`, error);

    if (error.code === "ENOENT") {
      return res.status(404).json({ error: "File not found" });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * List files in directory
 * GET /files/list?dirPath=<path>
 */
app.get("/files/list", async (req, res) => {
  const { dirPath } = req.query;

  let safePath;
  let fullPath;
  try {
    ({ safePath, fullPath } = resolveWorkspacePath(
      typeof dirPath === "string" ? dirPath : "",
      true,
    ));
  } catch {
    return res
      .status(403)
      .json({ error: "Path outside workspace not allowed" });
  }

  try {
    console.log(`[LIST] Listing directory: ${safePath || "/"}`);

    const files = await fs.readdir(fullPath, {
      withFileTypes: true,
    });

    const result = files.map((file) => ({
      name: file.name,
      isDirectory: file.isDirectory(),
      isFile: file.isFile(),
      path: path.join(safePath, file.name),
    }));

    console.log(`[LIST] Found ${result.length} items`);

    res.json({ files: result, dirPath: safePath });
  } catch (error) {
    console.error(`[LIST] Error listing directory ${safePath}:`, error);

    if (error.code === "ENOENT") {
      return res.status(404).json({ error: "Directory not found" });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete file or directory
 * DELETE /files/delete
 * Body: { filePath: string, recursive?: boolean }
 */
app.delete("/files/delete", async (req, res) => {
  const { filePath, recursive } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: "filePath is required" });
  }

  let safePath;
  let fullPath;
  try {
    ({ safePath, fullPath } = resolveWorkspacePath(filePath));
  } catch {
    return res
      .status(403)
      .json({ error: "Path outside workspace not allowed" });
  }

  try {
    console.log(`[DELETE] Deleting: ${safePath} (recursive: ${!!recursive})`);

    const stat = await fs.stat(fullPath);

    if (stat.isDirectory()) {
      await fs.rm(fullPath, { recursive: !!recursive, force: true });
    } else {
      await fs.unlink(fullPath);
    }

    console.log(`[DELETE] Deleted successfully: ${safePath}`);

    res.json({ success: true, filePath: safePath });
  } catch (error) {
    console.error(`[DELETE] Error deleting ${safePath}:`, error);

    if (error.code === "ENOENT") {
      return res.status(404).json({ error: "File or directory not found" });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * Get file metadata
 * GET /files/stat?filePath=<path>
 */
app.get("/files/stat", async (req, res) => {
  const { filePath } = req.query;

  if (!filePath) {
    return res.status(400).json({ error: "filePath is required" });
  }

  let safePath;
  let fullPath;
  try {
    ({ safePath, fullPath } = resolveWorkspacePath(filePath));
  } catch {
    return res
      .status(403)
      .json({ error: "Path outside workspace not allowed" });
  }

  try {
    const stat = await fs.stat(fullPath);

    res.json({
      filePath: safePath,
      size: stat.size,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      modifiedAt: stat.mtime.toISOString(),
      createdAt: stat.birthtime.toISOString(),
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.status(404).json({ error: "File or directory not found" });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * Error handler
 */
app.use((err, req, res, next) => {
  console.error("[ERROR]", err);
  res.status(500).json({ error: "Internal server error" });
});

/**
 * Start server
 */
const PORT = process.env.AGENT_PORT || 3000;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("=".repeat(60));
  console.log(`✓ Codespace Agent running on port ${PORT}`);
  console.log(
    `✓ Token: ${AGENT_TOKEN ? `${AGENT_TOKEN.substring(0, 8)}... (${AGENT_TOKEN_SOURCE})` : "<unset>"}`,
  );
  console.log(`✓ Workspace: ${WORKSPACE_DIR}`);
  console.log("=".repeat(60));
  console.log("Ready to accept requests");
});

let isShuttingDown = false;
async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`[AGENT] Received ${signal}, shutting down...`);

  try {
    await stopCodexRuntime();
  } catch (error) {
    console.error("[AGENT] Failed to stop codex runtime cleanly:", error);
  }

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 3000).unref();
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
