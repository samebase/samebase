#!/usr/bin/env node
// @ts-check
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { readLocalDevOriginState } from '../apps/noter/convex-local-utils.js'

/**
 * @typedef {import('node:child_process').ChildProcess} ChildProcess
 * @typedef {import('node:child_process').StdioOptions} StdioOptions
 * @typedef {'anonymous' | 'local'} ShareMode
 *
 * @typedef {{
 *   mode: ShareMode
 *   preferredPort: number
 *   showHelp: boolean
 * }} ParsedArgs
 *
 * @typedef {{
 *   exited: boolean
 *   code: number | null
 *   signal: NodeJS.Signals | null
 * }} ExitState
 *
 * @typedef {{
 *   code: number | null
 *   signal: NodeJS.Signals | null
 * }} ChildExit
 *
 * @typedef {{
 *   command: string
 *   args: string[]
 *   cwd: string
 *   env: NodeJS.ProcessEnv
 *   stdio?: StdioOptions
 * }} RunCommandArgs
 *
 * @typedef {{
 *   url: string
 *   label: string
 *   timeoutMs: number
 *   exitState: ExitState
 * }} WaitForUrlReadyArgs
 *
 * @typedef {{
 *   repoRoot: string
 *   minimumWrittenAt: number
 *   timeoutMs: number
 *   exitState: ExitState
 *   devLabel: string
 * }} WaitForFrontendOriginArgs
 *
 * @typedef {{
 *   repoRoot: string
 *   frontendPort: number
 *   frontendOrigin: string
 *   modeConfig: ShareModeConfig
 * }} DevLaunchArgs
 *
 * @typedef {{
 *   repoRoot: string
 *   frontendOrigin: string
 * }} CloudflaredQuickTunnelArgs
 *
 * @typedef {{
 *   childProcess: ChildProcess
 *   exitState: ExitState
 *   exitPromise: Promise<ChildExit>
 *   readyPromise: Promise<string>
 *   close: () => Promise<void>
 * }} CloudflaredQuickTunnelProcess
 *
 * @typedef {{
 *   bootstrapTarget: string
 *   devTarget: string
 *   devTargetPortVar: string
 *   defaultStartPort: number
 *   shareLabel: string
 *   devLabel: string
 *   readyLabel: string
 *   bootstrapMessage: string
 *   startMessage: (origin: string) => string
 * }} ShareModeConfig
 */

const FRONTEND_READY_TIMEOUT_MS = 120_000
const CLOUDFLARED_READY_TIMEOUT_MS = 60_000
const PROCESS_SHUTDOWN_TIMEOUT_MS = 10_000
const APPS_NOTER_DIRNAME = 'apps/noter'
const QUICK_TUNNEL_URL_PATTERN = /https:\/\/[a-z0-9.-]+\.trycloudflare\.com\b/i

/** @type {readonly string[]} */
const CONFIGURED_CONVEX_ENV_KEYS = ['VITE_CONVEX_URL', 'CONVEX_URL']

/** @type {Record<ShareMode, ShareModeConfig>} */
const SHARE_MODE_CONFIG = {
  anonymous: {
    bootstrapTarget: 'anon-once',
    devTarget: 'anon-dev',
    devTargetPortVar: 'ANON_VITE_PORT',
    defaultStartPort: 5174,
    shareLabel: 'Anonymous local share',
    devLabel: 'anonymous local dev',
    readyLabel: 'anonymous local frontend',
    bootstrapMessage:
      'Bootstrapping anonymous local environment with `make anon-once`.',
    startMessage: origin =>
      `Starting anonymous local dev on ${origin} with a private Convex proxy.`,
  },
  local: {
    bootstrapTarget: 'bootstrap',
    devTarget: 'run-dev',
    devTargetPortVar: 'RUN_VITE_PORT',
    defaultStartPort: 5173,
    shareLabel: 'Local share',
    devLabel: 'local dev',
    readyLabel: 'local frontend',
    bootstrapMessage: 'Bootstrapping local environment with `make bootstrap`.',
    startMessage: origin =>
      `Starting local dev on ${origin} with a private Convex proxy.`,
  },
}

/**
 * `make anon-share` and `make run-share` both expose one public frontend URL
 * while keeping the configured Convex backend behind Vite's same-origin proxy.
 *
 * @returns {string}
 */
function getHelpText() {
  return `Usage: node scripts/anon-share.js [options]

Start the local Noter dev server and publish the frontend over a Cloudflare
quick tunnel while keeping the configured Convex backend behind Vite's
same-origin proxy path.

Options:
  --mode <anonymous|local>
      Share mode. Defaults to anonymous.
      anonymous default port: ${SHARE_MODE_CONFIG.anonymous.defaultStartPort}
      local default port:      ${SHARE_MODE_CONFIG.local.defaultStartPort}
  --port <port>
      Preferred frontend port for the selected mode.
  -h, --help
      Show this help message.
`
}

/**
 * @param {unknown} line
 * @returns {string | null}
 */
export function parseCloudflaredQuickTunnelUrl(line) {
  if (typeof line !== 'string') {
    return null
  }

  const match = line.match(QUICK_TUNNEL_URL_PATTERN)
  return match?.[0] ?? null
}

/**
 * @param {unknown} contents
 * @returns {string | null}
 */
export function readLocalConvexUrlFromEnvContents(contents) {
  if (typeof contents !== 'string' || contents.length === 0) {
    return null
  }

  for (const key of CONFIGURED_CONVEX_ENV_KEYS) {
    const value = readEnvAssignmentValue(contents, key)
    if (value) {
      return value
    }
  }

  return null
}

/**
 * Split incoming stream chunks into complete newline-delimited log lines while
 * preserving any final partial line for a later `end` flush.
 *
 * @param {string} buffer
 * @param {unknown} chunk
 * @returns {{ buffer: string; lines: string[] }}
 */
export function appendBufferedLines(buffer, chunk) {
  let nextBuffer = `${buffer}${String(chunk)}`
  /** @type {string[]} */
  const lines = []
  let newlineIndex = nextBuffer.indexOf('\n')
  while (newlineIndex !== -1) {
    const line = nextBuffer.slice(0, newlineIndex).trim()
    nextBuffer = nextBuffer.slice(newlineIndex + 1)
    if (line.length > 0) {
      lines.push(line)
    }
    newlineIndex = nextBuffer.indexOf('\n')
  }

  return {
    buffer: nextBuffer,
    lines,
  }
}

/**
 * @param {string} buffer
 * @returns {string | null}
 */
export function flushBufferedLine(buffer) {
  const line = buffer.trim()
  return line.length > 0 ? line : null
}

/**
 * @param {string} contents
 * @param {string} key
 * @returns {string | null}
 */
function readEnvAssignmentValue(contents, key) {
  const prefix = `${key}=`
  for (const line of contents.split(/\r?\n/)) {
    if (!line.startsWith(prefix)) {
      continue
    }

    const rawValue = line.slice(prefix.length).trim()
    if (rawValue.length === 0) {
      return null
    }

    const quoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
    return quoted ? rawValue.slice(1, -1) : rawValue
  }

  return null
}

/**
 * @param {string[]} argv
 * @returns {ParsedArgs}
 */
function parseArgs(argv) {
  /** @type {ShareMode} */
  let mode = 'anonymous'
  /** @type {number | null} */
  let preferredPort = null
  let showHelp = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      showHelp = true
      continue
    }
    if (arg === '--mode') {
      const value = argv[index + 1]
      if (!value || value.startsWith('-')) {
        throw new Error(`Missing value for ${arg}.\n\n${getHelpText()}`)
      }
      mode = parseMode(value)
      index += 1
      continue
    }
    if (arg === '--port') {
      const value = argv[index + 1]
      if (!value || value.startsWith('-')) {
        throw new Error(`Missing value for ${arg}.\n\n${getHelpText()}`)
      }
      preferredPort = parsePort(value)
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}\n\n${getHelpText()}`)
  }

  return {
    mode,
    preferredPort: preferredPort ?? SHARE_MODE_CONFIG[mode].defaultStartPort,
    showHelp,
  }
}

/**
 * @param {string} value
 * @returns {ShareMode}
 */
function parseMode(value) {
  if (value === 'anonymous' || value === 'local') {
    return value
  }

  throw new Error(`Invalid mode "${value}". Expected "anonymous" or "local".`)
}

/**
 * @param {string} value
 * @returns {number}
 */
function parsePort(value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port "${value}".`)
  }
  return parsed
}

/**
 * @returns {string}
 */
function resolveRepoRoot() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(scriptDirectory, '..')
}

/**
 * @param {string} repoRoot
 * @returns {string}
 */
function resolveAppsNoterDir(repoRoot) {
  return path.join(repoRoot, APPS_NOTER_DIRNAME)
}

/**
 * @param {string} repoRoot
 * @returns {string}
 */
function readConfiguredConvexUrl(repoRoot) {
  const envPath = path.join(resolveAppsNoterDir(repoRoot), '.env.local')
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing ${APPS_NOTER_DIRNAME}/.env.local after bootstrap.`)
  }

  const value = readLocalConvexUrlFromEnvContents(
    fs.readFileSync(envPath, 'utf8'),
  )
  if (!value) {
    throw new Error(
      `Could not find VITE_CONVEX_URL or CONVEX_URL in ${APPS_NOTER_DIRNAME}/.env.local.`,
    )
  }
  return value
}

/**
 * @param {number} port
 * @returns {Promise<boolean>}
 */
async function isPortAvailable(port) {
  return new Promise(resolve => {
    const server = net.createServer()

    server.once('error', () => {
      resolve(false)
    })
    server.once('listening', () => {
      server.close(() => {
        resolve(true)
      })
    })

    server.listen(port, '127.0.0.1')
  })
}

/**
 * Probe a preferred frontend port range before launch so share mode can ask
 * Vite for one stable port. `apps/noter/scripts/run-vite-dev.js` still makes
 * the final bind decision, so this remains best-effort and
 * `NOTER_DEV_STRICT_PORT=1` intentionally fails fast if a late race loses.
 *
 * @param {number} startPort
 * @returns {Promise<number>}
 */
async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await isPortAvailable(port)) {
      return port
    }
  }

  throw new Error(
    `Could not find an available frontend port starting at ${startPort}.`,
  )
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function describeError(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * @param {number | null} code
 * @param {NodeJS.Signals | null} signal
 * @returns {string}
 */
function describeProcessExit(code, signal) {
  if (signal) {
    return `signal ${signal}`
  }
  return typeof code === 'number' ? `code ${code}` : 'unknown exit'
}

/**
 * @returns {ExitState}
 */
function createExitState() {
  return {
    exited: false,
    code: null,
    signal: null,
  }
}

/**
 * @param {ChildProcess} childProcess
 * @param {ExitState} exitState
 * @returns {Promise<ChildExit>}
 */
function waitForChildExit(childProcess, exitState) {
  return new Promise(resolve => {
    childProcess.once('exit', (code, signal) => {
      exitState.exited = true
      exitState.code = code
      exitState.signal = signal
      resolve({ code, signal })
    })
  })
}

/**
 * @param {RunCommandArgs} args
 * @returns {Promise<void>}
 */
function runCommand(args) {
  return new Promise((resolve, reject) => {
    /** @type {ChildProcess} */
    const childProcess = spawn(args.command, args.args, {
      cwd: args.cwd,
      env: args.env,
      stdio: args.stdio ?? 'inherit',
    })

    childProcess.once('error', reject)
    childProcess.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(
        new Error(
          `${args.command} ${args.args.join(' ')} exited with ${describeProcessExit(code, signal)}.`,
        ),
      )
    })
  })
}

/**
 * @param {WaitForUrlReadyArgs} args
 * @returns {Promise<void>}
 */
async function waitForUrlReady(args) {
  const deadline = Date.now() + args.timeoutMs

  while (Date.now() < deadline) {
    if (args.exitState.exited) {
      throw new Error(
        `${args.label} exited before readiness (${describeProcessExit(
          args.exitState.code,
          args.exitState.signal,
        )}).`,
      )
    }

    try {
      const response = await fetch(args.url, {
        signal: AbortSignal.timeout(1_000),
      })
      if (response.ok) {
        return
      }
    } catch {
      // Keep polling until the deadline so startup races stay quiet.
    }

    await sleep(250)
  }

  throw new Error(
    `Timed out waiting for ${args.label} readiness at ${args.url}.`,
  )
}

/**
 * @param {WaitForFrontendOriginArgs} args
 * @returns {Promise<string>}
 */
async function waitForFrontendOrigin(args) {
  const appsNoterDir = resolveAppsNoterDir(args.repoRoot)
  const deadline = Date.now() + args.timeoutMs

  while (Date.now() < deadline) {
    if (args.exitState.exited) {
      throw new Error(
        `${args.devLabel} exited before publishing a frontend origin (${describeProcessExit(
          args.exitState.code,
          args.exitState.signal,
        )}).`,
      )
    }

    const localDevOriginState = readLocalDevOriginState(appsNoterDir)
    if (
      localDevOriginState !== null &&
      localDevOriginState.writtenAt >= args.minimumWrittenAt
    ) {
      return localDevOriginState.origin
    }

    await sleep(250)
  }

  throw new Error('Timed out waiting for the local frontend origin state.')
}

/**
 * @param {string} repoRoot
 * @returns {Promise<void>}
 */
async function ensureCloudflaredBinary(repoRoot) {
  try {
    const output = execFileSync('cloudflared', ['--version'], {
      cwd: repoRoot,
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    if (typeof output !== 'string' || output.trim().length === 0) {
      throw new Error('cloudflared --version returned an empty response.')
    }
  } catch (error) {
    throw new Error(
      error instanceof Error &&
      error.message.includes('spawnSync cloudflared ENOENT')
        ? 'The `cloudflared` command was not found. Install cloudflared before using the share targets.'
        : describeError(error),
    )
  }
}

/**
 * @param {DevLaunchArgs} args
 * @returns {ChildProcess}
 */
function startDevServer(args) {
  /** @type {ChildProcess} */
  const childProcess = spawn(
    'make',
    [
      args.modeConfig.devTarget,
      `${args.modeConfig.devTargetPortVar}=${args.frontendPort}`,
    ],
    {
      cwd: args.repoRoot,
      env: {
        ...process.env,
        [args.modeConfig.devTargetPortVar]: String(args.frontendPort),
        DEV_ENV_ORIGIN: args.frontendOrigin,
        NOTER_DEV_ALLOWED_HOSTS: '.trycloudflare.com',
        NOTER_DEV_PORT: String(args.frontendPort),
        NOTER_DEV_STRICT_PORT: '1',
      },
      detached: true,
      stdio: 'inherit',
    },
  )

  return childProcess
}

/**
 * @param {CloudflaredQuickTunnelArgs} args
 * @returns {CloudflaredQuickTunnelProcess}
 */
function startCloudflaredQuickTunnel(args) {
  /** @type {ChildProcess} */
  const childProcess = spawn(
    'cloudflared',
    [
      'tunnel',
      '--no-autoupdate',
      '--url',
      args.frontendOrigin,
      '--metrics',
      'localhost:0',
      '--loglevel',
      'info',
    ],
    {
      cwd: args.repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  if (childProcess.stdout === null || childProcess.stderr === null) {
    throw new Error('cloudflared did not expose stdout/stderr pipes.')
  }

  /** @type {import('node:stream').Readable[]} */
  const outputStreams = [childProcess.stdout, childProcess.stderr]

  let isClosing = false
  let sawTunnelUrl = false
  /** @type {string | null} */
  let lastTunnelUrl = null
  /** @type {(url: string) => void} */
  let resolveReady = () => {}
  /** @type {(error: Error) => void} */
  let rejectReady = () => {}
  /** @type {Promise<string>} */
  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  const exitState = createExitState()
  const exitPromise = waitForChildExit(childProcess, exitState)

  const readyTimeoutId = setTimeout(() => {
    if (isClosing || sawTunnelUrl) {
      return
    }
    rejectReady(
      new Error('Timed out waiting for Cloudflare quick tunnel readiness.'),
    )
    void stopChildProcess(childProcess)
  }, CLOUDFLARED_READY_TIMEOUT_MS)
  readyTimeoutId.unref()

  /**
   * @param {string} line
   * @returns {void}
   */
  const handleLine = line => {
    const tunnelUrl = parseCloudflaredQuickTunnelUrl(line)
    if (!tunnelUrl || tunnelUrl === lastTunnelUrl) {
      return
    }

    sawTunnelUrl = true
    lastTunnelUrl = tunnelUrl
    clearTimeout(readyTimeoutId)
    resolveReady(tunnelUrl)
  }

  for (const stream of outputStreams) {
    let buffer = ''

    stream.on('data', chunk => {
      const nextChunkState = appendBufferedLines(buffer, chunk)
      buffer = nextChunkState.buffer
      for (const line of nextChunkState.lines) {
        handleLine(line)
      }
    })

    stream.on('end', () => {
      const remainingLine = flushBufferedLine(buffer)
      buffer = ''
      if (remainingLine !== null) {
        handleLine(remainingLine)
      }
    })
  }

  childProcess.once('error', error => {
    clearTimeout(readyTimeoutId)
    rejectReady(
      new Error(`cloudflared failed to start: ${describeError(error)}`),
    )
  })

  childProcess.once('close', () => {
    clearTimeout(readyTimeoutId)
    if (isClosing) {
      return
    }
    rejectReady(
      new Error(
        sawTunnelUrl
          ? `cloudflared exited unexpectedly (${describeProcessExit(
              exitState.code,
              exitState.signal,
            )}).`
          : `cloudflared exited before publishing a quick tunnel URL (${describeProcessExit(
              exitState.code,
              exitState.signal,
            )}).`,
      ),
    )
  })

  return {
    childProcess,
    exitState,
    exitPromise,
    readyPromise,
    async close() {
      isClosing = true
      clearTimeout(readyTimeoutId)
      await stopChildProcess(childProcess)
    },
  }
}

/**
 * @param {ChildProcess} childProcess
 * @param {NodeJS.Signals} [signal='SIGTERM']
 * @returns {Promise<void>}
 */
async function stopChildProcess(childProcess, signal = 'SIGTERM') {
  if (childProcess.exitCode !== null || childProcess.killed) {
    return
  }

  /** @type {Promise<void>} */
  const stopped = new Promise(resolve => {
    let finished = false
    const finish = () => {
      if (finished) {
        return
      }
      finished = true
      resolve()
    }

    const timeoutId = setTimeout(() => {
      if (childProcess.exitCode === null) {
        childProcess.kill('SIGKILL')
      }
      finish()
    }, PROCESS_SHUTDOWN_TIMEOUT_MS)
    timeoutId.unref()

    childProcess.once('exit', () => {
      clearTimeout(timeoutId)
      finish()
    })

    childProcess.kill(signal)
  })

  await stopped
}

/**
 * @param {ChildProcess} childProcess
 * @param {NodeJS.Signals} [signal='SIGTERM']
 * @returns {Promise<void>}
 */
async function stopProcessGroup(childProcess, signal = 'SIGTERM') {
  if (childProcess.exitCode !== null) {
    return
  }

  /** @type {Promise<void>} */
  const stopped = new Promise(resolve => {
    let finished = false
    const finish = () => {
      if (finished) {
        return
      }
      finished = true
      resolve()
    }

    const timeoutId = setTimeout(() => {
      try {
        if (typeof childProcess.pid === 'number') {
          process.kill(-childProcess.pid, 'SIGKILL')
        }
      } catch {
        childProcess.kill('SIGKILL')
      }
      finish()
    }, PROCESS_SHUTDOWN_TIMEOUT_MS)
    timeoutId.unref()

    childProcess.once('exit', () => {
      clearTimeout(timeoutId)
      finish()
    })

    try {
      if (typeof childProcess.pid === 'number') {
        process.kill(-childProcess.pid, signal)
      } else {
        childProcess.kill(signal)
      }
    } catch {
      childProcess.kill(signal)
    }
  })

  await stopped
}

/**
 * @param {string} repoRoot
 * @param {string} publicTunnelUrl
 * @returns {Promise<void>}
 */
async function setLocalSiteUrl(repoRoot, publicTunnelUrl) {
  const publicOrigin = new URL(publicTunnelUrl).origin
  await runCommand({
    command: 'npx',
    args: ['convex', 'env', 'set', 'SITE_URL', publicOrigin],
    cwd: resolveAppsNoterDir(repoRoot),
    env: process.env,
  })
}

/**
 * @param {number} milliseconds
 * @returns {Promise<void>}
 */
function sleep(milliseconds) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds)
  })
}

/**
 * @returns {Promise<void>}
 */
async function main() {
  const parsedArgs = parseArgs(process.argv.slice(2))
  if (parsedArgs.showHelp) {
    console.log(getHelpText())
    return
  }

  const modeConfig = SHARE_MODE_CONFIG[parsedArgs.mode]
  const repoRoot = resolveRepoRoot()
  const frontendPort = await findAvailablePort(parsedArgs.preferredPort)
  if (frontendPort !== parsedArgs.preferredPort) {
    console.log(
      `Port ${parsedArgs.preferredPort} is busy; using ${frontendPort} for ${modeConfig.shareLabel.toLowerCase()} instead.`,
    )
  }

  await ensureCloudflaredBinary(repoRoot)

  console.log(modeConfig.bootstrapMessage)
  await runCommand({
    command: 'make',
    args: [modeConfig.bootstrapTarget],
    cwd: repoRoot,
    env: process.env,
  })

  // Throws if .env.local is missing or lacks a Convex URL after bootstrap.
  void readConfiguredConvexUrl(repoRoot)
  const requestedFrontendOrigin = `http://127.0.0.1:${frontendPort}`
  console.log(modeConfig.startMessage(requestedFrontendOrigin))

  const frontendLaunchStartedAt = Date.now()
  const devChild = startDevServer({
    repoRoot,
    frontendPort,
    frontendOrigin: requestedFrontendOrigin,
    modeConfig,
  })
  const devExitState = createExitState()
  const devExitPromise = waitForChildExit(devChild, devExitState)

  /** @type {CloudflaredQuickTunnelProcess | null} */
  let tunnelProcess = null
  let shuttingDown = false

  /**
   * Signal handlers can trip shutdown concurrently with the foreground await
   * path, so read the flag through a function instead of trusting local flow.
   *
   * @returns {boolean}
   */
  const hasStartedShutdown = () => shuttingDown

  const shutdown = async () => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    if (tunnelProcess !== null) {
      await tunnelProcess.close()
    }
    await stopProcessGroup(devChild)
  }

  process.once('SIGINT', () => {
    void shutdown().finally(() => {
      process.exitCode = 130
    })
  })
  process.once('SIGTERM', () => {
    void shutdown().finally(() => {
      process.exitCode = 143
    })
  })

  try {
    const frontendOrigin = await waitForFrontendOrigin({
      repoRoot,
      minimumWrittenAt: frontendLaunchStartedAt,
      timeoutMs: FRONTEND_READY_TIMEOUT_MS,
      exitState: devExitState,
      devLabel: modeConfig.devLabel,
    })
    if (frontendOrigin !== requestedFrontendOrigin) {
      console.log(
        `Requested ${requestedFrontendOrigin}, but the frontend started on ${frontendOrigin}.`,
      )
    }

    await waitForUrlReady({
      url: frontendOrigin,
      label: modeConfig.readyLabel,
      timeoutMs: FRONTEND_READY_TIMEOUT_MS,
      exitState: devExitState,
    })

    const activeTunnelProcess = startCloudflaredQuickTunnel({
      repoRoot,
      frontendOrigin,
    })
    tunnelProcess = activeTunnelProcess

    const quickTunnelUrl = await activeTunnelProcess.readyPromise
    await setLocalSiteUrl(repoRoot, quickTunnelUrl)

    console.log('')
    console.log(`${modeConfig.shareLabel} ready.`)
    console.log(`- Local:  ${frontendOrigin}`)
    console.log(`- Public: ${quickTunnelUrl}`)
    console.log('Press Ctrl-C to stop the local dev server and quick tunnel.')

    const exitingChild = await Promise.race([
      devExitPromise.then(() => 'dev'),
      activeTunnelProcess.exitPromise.then(() => 'cloudflared'),
    ])

    if (hasStartedShutdown()) {
      return
    }

    if (exitingChild === 'dev') {
      throw new Error(
        `${modeConfig.devLabel} exited unexpectedly (${describeProcessExit(
          devExitState.code,
          devExitState.signal,
        )}).`,
      )
    }

    throw new Error(
      `Cloudflare quick tunnel exited unexpectedly (${describeProcessExit(
        activeTunnelProcess.exitState.code,
        activeTunnelProcess.exitState.signal,
      )}).`,
    )
  } finally {
    await shutdown()
  }
}

/**
 * @returns {boolean}
 */
function isMainModule() {
  const entryPoint = process.argv[1]
  if (typeof entryPoint !== 'string' || entryPoint.length === 0) {
    return false
  }

  return path.resolve(entryPoint) === fileURLToPath(import.meta.url)
}

if (isMainModule()) {
  void main().catch(error => {
    console.error(describeError(error))
    process.exitCode = 1
  })
}
