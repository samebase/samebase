const express = require('express');
const { exec, spawn } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

const AGENT_TOKEN_FILE = path.join(__dirname, '.agent-token');
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspaces';
const CODEX_RPC_TIMEOUT_MS = 120000;
const CODEX_INIT_TIMEOUT_MS = 30000;
const CODEX_EVENT_BUFFER_SIZE = 500;
const CODEX_REQUEST_BUFFER_SIZE = 100;

function normalizeToken(value) {
  if (typeof value !== 'string') {
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
    const persisted = fsSync.readFileSync(AGENT_TOKEN_FILE, 'utf8');
    return normalizeToken(persisted);
  } catch (error) {
    console.warn(
      `[AGENT] Failed to read persisted token from ${AGENT_TOKEN_FILE}: ${String(error)}`
    );
    return null;
  }
}

function loadInitialTokenState() {
  const fromEnv = normalizeToken(process.env.CODESPACE_AGENT_TOKEN);
  if (fromEnv) {
    return { token: fromEnv, source: 'env' };
  }

  const fromFile = readPersistedAgentToken();
  if (fromFile) {
    return { token: fromFile, source: 'persisted' };
  }

  return { token: null, source: 'runtime' };
}

async function persistAgentToken(token) {
  try {
    await fs.writeFile(AGENT_TOKEN_FILE, `${token}\n`, 'utf8');
  } catch (error) {
    console.warn(
      `[AGENT] Failed to persist token to ${AGENT_TOKEN_FILE}: ${String(error)}`
    );
  }
}

const initialTokenState = loadInitialTokenState();
let AGENT_TOKEN = initialTokenState.token;
let AGENT_TOKEN_SOURCE = initialTokenState.source;

const codexRuntime = {
  process: null,
  startPromise: null,
  initialized: false,
  nextRpcId: 1,
  pendingRpc: new Map(),
  pendingApprovals: new Map(),
  notifications: [],
  nextEventCursor: 1,
  stdoutBuffer: '',
  startedAt: null,
  lastError: null,
  lastExitCode: null,
  lastExitSignal: null,
  currentThreadId: null,
};

console.log('='.repeat(60));
console.log('Codespace Agent Starting');
console.log('='.repeat(60));
if (AGENT_TOKEN) {
  console.log(`Agent Token: ${AGENT_TOKEN.substring(0, 8)}... (${AGENT_TOKEN_SOURCE})`);
} else {
  console.log(
    'Agent Token: <unset> (will initialize from first authenticated request)',
  );
}
console.log(`Workspace Dir: ${WORKSPACE_DIR}`);
console.log('='.repeat(60));

/**
 * Middleware: Authenticate all requests except health check
 */
function authenticateToken(req, res, next) {
  // Allow health checks without auth
  if (req.path === '/health') {
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = normalizeToken(authHeader?.replace('Bearer ', ''));

  if (!AGENT_TOKEN) {
    if (!token) {
      console.warn(`Unauthorized request from ${req.ip} to ${req.path} (missing token)`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    AGENT_TOKEN = token;
    AGENT_TOKEN_SOURCE = 'request';
    void persistAgentToken(token);
    console.log('Agent token initialized from first authenticated request');
    return next();
  }

  if (token !== AGENT_TOKEN) {
    console.warn(`Unauthorized request from ${req.ip} to ${req.path}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

app.use(authenticateToken);

function parseErrorMessage(error) {
  if (!error) {
    return 'Unknown error';
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
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
      codexRuntime.process.exitCode === null
  );
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
  codexRuntime.stdoutBuffer = '';
  codexRuntime.currentThreadId = null;
  codexRuntime.pendingApprovals.clear();
  codexRuntime.process = null;
  codexRuntime.lastExitCode = exitCode;
  codexRuntime.lastExitSignal = exitSignal;
  rejectPendingRpcRequests('Codex app-server process ended');
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

  const hasId = Object.prototype.hasOwnProperty.call(message, 'id');
  const hasMethod = typeof message.method === 'string';
  const hasResult = Object.prototype.hasOwnProperty.call(message, 'result');
  const hasError = Object.prototype.hasOwnProperty.call(message, 'error');

  if (hasId && (hasResult || hasError)) {
    const pending = codexRuntime.pendingRpc.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeoutId);
    codexRuntime.pendingRpc.delete(message.id);

    if (hasError) {
      const errorMessage =
        typeof message.error?.message === 'string'
          ? message.error.message
          : `Codex RPC ${pending.method} failed`;
      pending.reject(new Error(errorMessage));
      return;
    }

    pending.resolve(message.result);
    return;
  }

  if (hasId && hasMethod) {
    codexRuntime.pendingApprovals.set(message.id, {
      id: message.id,
      method: message.method,
      params: message.params,
      createdAt: Date.now(),
    });

    if (codexRuntime.pendingApprovals.size > CODEX_REQUEST_BUFFER_SIZE) {
      const oldestRequestId = codexRuntime.pendingApprovals.keys().next().value;
      codexRuntime.pendingApprovals.delete(oldestRequestId);
    }

    pushCodexEvent(message.method, message.params);
    return;
  }

  if (hasMethod) {
    pushCodexEvent(message.method, message.params);
  }
}

function writeCodexMessage(message) {
  if (!isCodexRuntimeRunning()) {
    throw new Error('Codex app-server is not running');
  }
  codexRuntime.process.stdin.write(`${JSON.stringify(message)}\n`);
}

function sendCodexRequestNoEnsure(method, params = {}, timeoutMs = CODEX_RPC_TIMEOUT_MS) {
  if (!isCodexRuntimeRunning()) {
    return Promise.reject(new Error('Codex app-server is not running'));
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
    exec('codex --version', { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        const details = stderr?.trim() || error.message;
        reject(new Error(details));
        return;
      }

      resolve((stdout || '').trim());
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
        proc.kill('SIGKILL');
      }
      finish();
    }, 5000);

    proc.once('exit', () => {
      clearTimeout(timeoutId);
      finish();
    });

    proc.kill('SIGTERM');
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

    const proc = spawn('codex', ['app-server', '--listen', 'stdio://'], {
      cwd: WORKSPACE_DIR,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    codexRuntime.process = proc;
    codexRuntime.initialized = false;
    codexRuntime.startedAt = Date.now();
    codexRuntime.lastError = null;

    proc.stdout.on('data', (chunk) => {
      codexRuntime.stdoutBuffer += chunk.toString();
      while (true) {
        const newlineIndex = codexRuntime.stdoutBuffer.indexOf('\n');
        if (newlineIndex === -1) {
          break;
        }
        const line = codexRuntime.stdoutBuffer.slice(0, newlineIndex);
        codexRuntime.stdoutBuffer = codexRuntime.stdoutBuffer.slice(newlineIndex + 1);
        parseCodexMessageLine(line);
      }
    });

    proc.stderr.on('data', (chunk) => {
      const stderrText = chunk.toString().trim();
      if (!stderrText) {
        return;
      }
      for (const line of stderrText.split('\n')) {
        console.warn(`[CODEX stderr] ${line}`);
      }
    });

    proc.on('error', (error) => {
      codexRuntime.lastError = parseErrorMessage(error);
      console.error(`[CODEX] Process error: ${codexRuntime.lastError}`);
    });

    proc.on('exit', (code, signal) => {
      console.warn(`[CODEX] app-server exited with code=${code} signal=${signal}`);
      codexRuntime.lastError = `Codex app-server exited (code=${code}, signal=${signal})`;
      resetCodexRuntimeState(code, signal);
      pushCodexEvent('codex/runtime_exit', {
        code,
        signal,
      });
    });

    try {
      await sendCodexRequestNoEnsure(
        'initialize',
        {
          clientInfo: {
            name: 'noter_codespace_agent',
            title: 'Noter Codespace Agent',
            version: '0.1.0',
          },
        },
        CODEX_INIT_TIMEOUT_MS
      );
      sendCodexNotificationNoEnsure('initialized', {});
      codexRuntime.initialized = true;
      pushCodexEvent('codex/runtime_ready', {
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

async function sendCodexRequest(method, params = {}, timeoutMs = CODEX_RPC_TIMEOUT_MS) {
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
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    authConfigured: Boolean(AGENT_TOKEN),
    tokenSource: AGENT_TOKEN_SOURCE,
    token: AGENT_TOKEN ? AGENT_TOKEN.substring(0, 8) + '...' : null,
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

app.get('/codex/status', async (_req, res) => {
  const binaryStatus = await getCodexBinaryStatus();

  res.json({
    codexInstalled: binaryStatus.installed,
    codexVersion: binaryStatus.version,
    codexInstallError: binaryStatus.error,
    runtime: getCodexRuntimeSnapshot(),
  });
});

app.post('/codex/runtime/ensure', async (req, res) => {
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

app.get('/codex/events', (req, res) => {
  const since = Number.parseInt(`${req.query.since ?? 0}`, 10);
  const safeSince = Number.isFinite(since) ? since : 0;
  const events = codexRuntime.notifications.filter((event) => event.cursor > safeSince);
  res.json({
    events,
    nextCursor: codexRuntime.nextEventCursor - 1,
  });
});

app.get('/codex/requests', (_req, res) => {
  const requests = Array.from(codexRuntime.pendingApprovals.values()).sort(
    (left, right) => left.createdAt - right.createdAt
  );
  res.json({ requests });
});

app.post('/codex/approval/respond', async (req, res) => {
  const requestId = req.body?.requestId;
  const decision = req.body?.decision;
  const acceptSettings = req.body?.acceptSettings;

  if (typeof requestId !== 'number') {
    return res.status(400).json({ error: 'requestId (number) is required' });
  }
  if (decision !== 'accept' && decision !== 'decline') {
    return res.status(400).json({ error: 'decision must be accept or decline' });
  }

  const pendingRequest = codexRuntime.pendingApprovals.get(requestId);
  if (!pendingRequest) {
    return res.status(404).json({ error: 'Approval request not found' });
  }

  try {
    await startCodexRuntime(false);
    const result = { decision };
    if (decision === 'accept' && acceptSettings !== undefined) {
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

app.post('/codex/thread/start', async (req, res) => {
  try {
    const params = {};
    if (typeof req.body?.model === 'string') params.model = req.body.model;
    if (typeof req.body?.cwd === 'string') params.cwd = req.body.cwd;
    if (typeof req.body?.approvalPolicy === 'string') {
      params.approvalPolicy = req.body.approvalPolicy;
    }
    if (req.body?.sandbox !== undefined) params.sandbox = req.body.sandbox;
    if (typeof req.body?.personality === 'string') {
      params.personality = req.body.personality;
    }
    if (typeof req.body?.persistExtendedHistory === 'boolean') {
      params.persistExtendedHistory = req.body.persistExtendedHistory;
    }

    const result = await sendCodexRequest('thread/start', params);
    const threadId = result?.thread?.id;
    if (typeof threadId === 'string') {
      codexRuntime.currentThreadId = threadId;
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: parseErrorMessage(error) });
  }
});

app.post('/codex/thread/resume', async (req, res) => {
  const threadId = req.body?.threadId;
  if (typeof threadId !== 'string' || threadId.length === 0) {
    return res.status(400).json({ error: 'threadId is required' });
  }

  try {
    const params = { threadId };
    if (typeof req.body?.cwd === 'string') params.cwd = req.body.cwd;
    if (typeof req.body?.approvalPolicy === 'string') {
      params.approvalPolicy = req.body.approvalPolicy;
    }
    if (req.body?.sandbox !== undefined) params.sandbox = req.body.sandbox;
    if (typeof req.body?.model === 'string') params.model = req.body.model;
    if (typeof req.body?.personality === 'string') {
      params.personality = req.body.personality;
    }

    const result = await sendCodexRequest('thread/resume', params);
    codexRuntime.currentThreadId = threadId;
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: parseErrorMessage(error) });
  }
});

app.post('/codex/turn/start', async (req, res) => {
  const threadId =
    typeof req.body?.threadId === 'string'
      ? req.body.threadId
      : codexRuntime.currentThreadId;
  if (!threadId) {
    return res.status(400).json({ error: 'threadId is required' });
  }

  const input =
    req.body?.input !== undefined
      ? req.body.input
      : typeof req.body?.text === 'string'
        ? req.body.text
        : undefined;
  if (input === undefined) {
    return res.status(400).json({ error: 'input (or text) is required' });
  }

  try {
    const params = {
      threadId,
      input,
    };
    if (typeof req.body?.cwd === 'string') params.cwd = req.body.cwd;
    if (typeof req.body?.approvalPolicy === 'string') {
      params.approvalPolicy = req.body.approvalPolicy;
    }
    if (req.body?.sandbox !== undefined) params.sandbox = req.body.sandbox;
    if (typeof req.body?.model === 'string') params.model = req.body.model;
    if (req.body?.settings !== undefined) params.settings = req.body.settings;

    const timeoutMs =
      typeof req.body?.timeoutMs === 'number' && Number.isFinite(req.body.timeoutMs)
        ? req.body.timeoutMs
        : CODEX_RPC_TIMEOUT_MS;

    const result = await sendCodexRequest('turn/start', params, timeoutMs);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: parseErrorMessage(error) });
  }
});

app.post('/codex/turn/interrupt', async (req, res) => {
  const threadId =
    typeof req.body?.threadId === 'string'
      ? req.body.threadId
      : codexRuntime.currentThreadId;
  const turnId = req.body?.turnId;

  if (!threadId || typeof threadId !== 'string') {
    return res.status(400).json({ error: 'threadId is required' });
  }
  if (typeof turnId !== 'string' || turnId.length === 0) {
    return res.status(400).json({ error: 'turnId is required' });
  }

  try {
    const result = await sendCodexRequest('turn/interrupt', {
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
app.post('/exec', (req, res) => {
  const { command, workingDir, timeoutMs } = req.body;

  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
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
      const exitCode = error?.code || 0;

      console.log(`[EXEC] Command completed with exit code: ${exitCode}`);
      if (stdout) console.log(`[EXEC] stdout: ${stdout.substring(0, 200)}...`);
      if (stderr) console.warn(`[EXEC] stderr: ${stderr.substring(0, 200)}...`);

      res.json({
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode,
        success: exitCode === 0,
      });
    }
  );
});

/**
 * Write file
 * POST /files/write
 * Body: { filePath: string, content: string }
 */
app.post('/files/write', async (req, res) => {
  const { filePath, content } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: 'filePath is required' });
  }

  if (content === undefined) {
    return res.status(400).json({ error: 'content is required' });
  }

  // Prevent directory traversal attacks
  const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(WORKSPACE_DIR, safePath);

  // Ensure path is within workspace
  if (!fullPath.startsWith(WORKSPACE_DIR)) {
    return res.status(403).json({ error: 'Path outside workspace not allowed' });
  }

  try {
    console.log(`[WRITE] Writing file: ${safePath}`);

    // Create directory if it doesn't exist
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // Write file
    await fs.writeFile(fullPath, content, 'utf8');

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
app.get('/files/read', async (req, res) => {
  const { filePath } = req.query;

  if (!filePath) {
    return res.status(400).json({ error: 'filePath is required' });
  }

  // Prevent directory traversal attacks
  const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(WORKSPACE_DIR, safePath);

  // Ensure path is within workspace
  if (!fullPath.startsWith(WORKSPACE_DIR)) {
    return res.status(403).json({ error: 'Path outside workspace not allowed' });
  }

  try {
    console.log(`[READ] Reading file: ${safePath}`);

    const content = await fs.readFile(fullPath, 'utf8');

    console.log(`[READ] File read successfully: ${safePath} (${content.length} bytes)`);

    res.json({ content, filePath: safePath });
  } catch (error) {
    console.error(`[READ] Error reading file ${safePath}:`, error);

    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * List files in directory
 * GET /files/list?dirPath=<path>&recursive=<true|false>
 */
app.get('/files/list', async (req, res) => {
  const { dirPath, recursive } = req.query;

  const safePath = dirPath
    ? path.normalize(dirPath).replace(/^(\.\.(\/|\\|$))+/, '')
    : '';
  const fullPath = path.join(WORKSPACE_DIR, safePath);

  // Ensure path is within workspace
  if (!fullPath.startsWith(WORKSPACE_DIR)) {
    return res.status(403).json({ error: 'Path outside workspace not allowed' });
  }

  try {
    console.log(`[LIST] Listing directory: ${safePath || '/'}`);

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

    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Directory not found' });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete file or directory
 * DELETE /files/delete
 * Body: { filePath: string, recursive?: boolean }
 */
app.delete('/files/delete', async (req, res) => {
  const { filePath, recursive } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: 'filePath is required' });
  }

  const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(WORKSPACE_DIR, safePath);

  // Ensure path is within workspace
  if (!fullPath.startsWith(WORKSPACE_DIR)) {
    return res.status(403).json({ error: 'Path outside workspace not allowed' });
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

    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'File or directory not found' });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * Get file metadata
 * GET /files/stat?filePath=<path>
 */
app.get('/files/stat', async (req, res) => {
  const { filePath } = req.query;

  if (!filePath) {
    return res.status(400).json({ error: 'filePath is required' });
  }

  const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(WORKSPACE_DIR, safePath);

  // Ensure path is within workspace
  if (!fullPath.startsWith(WORKSPACE_DIR)) {
    return res.status(403).json({ error: 'Path outside workspace not allowed' });
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
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'File or directory not found' });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * Error handler
 */
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

/**
 * Start server
 */
const PORT = process.env.AGENT_PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log(`✓ Codespace Agent running on port ${PORT}`);
  console.log(
    `✓ Token: ${AGENT_TOKEN ? `${AGENT_TOKEN.substring(0, 8)}... (${AGENT_TOKEN_SOURCE})` : '<unset>'}`,
  );
  console.log(`✓ Workspace: ${WORKSPACE_DIR}`);
  console.log('='.repeat(60));
  console.log('Ready to accept requests');
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
    console.error('[AGENT] Failed to stop codex runtime cleanly:', error);
  }

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 3000).unref();
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
