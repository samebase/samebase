const express = require('express');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Security: validate token from environment
const AGENT_TOKEN = process.env.CODESPACE_AGENT_TOKEN || crypto.randomUUID();
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspaces';

console.log('='.repeat(60));
console.log('Codespace Agent Starting');
console.log('='.repeat(60));
console.log(`Agent Token: ${AGENT_TOKEN.substring(0, 8)}...`);
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
  const token = authHeader?.replace('Bearer ', '');

  if (token !== AGENT_TOKEN) {
    console.warn(`Unauthorized request from ${req.ip} to ${req.path}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

app.use(authenticateToken);

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    token: AGENT_TOKEN.substring(0, 8) + '...',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
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
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log(`✓ Codespace Agent running on port ${PORT}`);
  console.log(`✓ Token: ${AGENT_TOKEN.substring(0, 8)}...`);
  console.log(`✓ Workspace: ${WORKSPACE_DIR}`);
  console.log('='.repeat(60));
  console.log('Ready to accept requests');
});
