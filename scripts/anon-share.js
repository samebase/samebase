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
 *
 * @typedef {{
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
 * }} WaitForFrontendOriginArgs
 *
 * @typedef {{
 *   repoRoot: string
 *   frontendPort: number
 *   frontendOrigin: string
 * }} AnonDevLaunchArgs
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
 */

const DEFAULT_START_PORT = 5174
const FRONTEND_READY_TIMEOUT_MS = 120_000
const CLOUDFLARED_READY_TIMEOUT_MS = 60_000
const PROCESS_SHUTDOWN_TIMEOUT_MS = 10_000
const APPS_NOTER_DIRNAME = 'apps/noter'
const QUICK_TUNNEL_URL_PATTERN = /https:\/\/[a-z0-9.-]+\.trycloudflare\.com\b/i

/**
 * `make anon-share` bootstraps the local anonymous stack first so the Vite
 * dev server can start with the loopback Convex backend already known.
 */
const HELP_TEXT = `Usage: node scripts/anon-share.js [options]

Start the local anonymous Noter stack and publish the frontend over a
Cloudflare quick tunnel while keeping the Convex backend behind Vite's
same-origin proxy path.

Options:
  --port <port>  Preferred frontend port. Default: ${DEFAULT_START_PORT}
  -h, --help     Show this help message.
`

/** @type {readonly string[]} */
const LOCAL_CONVEX_ENV_KEYS = ['VITE_CONVEX_URL', 'CONVEX_URL']

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

  for (const key of LOCAL_CONVEX_ENV_KEYS) {
    const value = readEnvAssignmentValue(contents, key)
    if (value) {
      return value
    }
  }

  return null
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
  /** @type {ParsedArgs} */
  const parsed = {
    preferredPort: DEFAULT_START_PORT,
    showHelp: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      parsed.showHelp = true
      continue
    }
    if (arg === '--port') {
      const value = argv[index + 1]
      if (!value || value.startsWith('-')) {
        throw new Error(`Missing value for ${arg}.\n\n${HELP_TEXT}`)
      }
      parsed.preferredPort = parsePort(value)
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}\n\n${HELP_TEXT}`)
  }

  return parsed
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
function readLocalConvexUrl(repoRoot) {
  const envPath = path.join(resolveAppsNoterDir(repoRoot), '.env.local')
  if (!fs.existsSync(envPath)) {
    throw new Error(
      `Missing ${APPS_NOTER_DIRNAME}/.env.local after bootstrap. Run \`make anon-once\` and retry.`,
    )
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
 * Pick the first available frontend port up front so the tunnel launcher can
 * give Vite one fixed port and then trust strictPort to keep that binding.
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
        `anonymous local dev exited before publishing a frontend origin (${describeProcessExit(
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
        ? 'The `cloudflared` command was not found. Install cloudflared before using `make anon-share`.'
        : describeError(error),
    )
  }
}

/**
 * @param {AnonDevLaunchArgs} args
 * @returns {ChildProcess}
 */
function startAnonDev(args) {
  /** @type {ChildProcess} */
  const childProcess = spawn(
    'make',
    ['anon-dev', `ANON_VITE_PORT=${args.frontendPort}`],
    {
      cwd: args.repoRoot,
      env: {
        ...process.env,
        ANON_VITE_PORT: String(args.frontendPort),
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
      buffer += String(chunk)
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line.length > 0) {
          handleLine(line)
        }
        newlineIndex = buffer.indexOf('\n')
      }
    })
  }

  childProcess.once('error', error => {
    clearTimeout(readyTimeoutId)
    rejectReady(
      new Error(`cloudflared failed to start: ${describeError(error)}`),
    )
  })

  void exitPromise.then(() => {
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
    console.log(HELP_TEXT)
    return
  }

  const repoRoot = resolveRepoRoot()
  const frontendPort = await findAvailablePort(parsedArgs.preferredPort)
  if (frontendPort !== parsedArgs.preferredPort) {
    console.log(
      `Port ${parsedArgs.preferredPort} is busy; using ${frontendPort} for anon share instead.`,
    )
  }

  await ensureCloudflaredBinary(repoRoot)

  console.log(
    'Bootstrapping anonymous local environment with `make anon-once`.',
  )
  await runCommand({
    command: 'make',
    args: ['anon-once'],
    cwd: repoRoot,
    env: process.env,
  })

  readLocalConvexUrl(repoRoot)
  const requestedFrontendOrigin = `http://127.0.0.1:${frontendPort}`
  console.log(
    `Starting anonymous local dev on ${requestedFrontendOrigin} with a private Convex proxy.`,
  )

  const frontendLaunchStartedAt = Date.now()
  const anonDevChild = startAnonDev({
    repoRoot,
    frontendPort,
    frontendOrigin: requestedFrontendOrigin,
  })
  const anonDevExitState = createExitState()
  const anonDevExitPromise = waitForChildExit(anonDevChild, anonDevExitState)

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
    await stopProcessGroup(anonDevChild)
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
      exitState: anonDevExitState,
    })
    if (frontendOrigin !== requestedFrontendOrigin) {
      console.log(
        `Requested ${requestedFrontendOrigin}, but the frontend started on ${frontendOrigin}.`,
      )
    }

    await waitForUrlReady({
      url: frontendOrigin,
      label: 'anonymous local frontend',
      timeoutMs: FRONTEND_READY_TIMEOUT_MS,
      exitState: anonDevExitState,
    })

    const activeTunnelProcess = startCloudflaredQuickTunnel({
      repoRoot,
      frontendOrigin,
    })
    tunnelProcess = activeTunnelProcess

    const quickTunnelUrl = await activeTunnelProcess.readyPromise
    await setLocalSiteUrl(repoRoot, quickTunnelUrl)

    console.log('')
    console.log('Anonymous local share ready.')
    console.log(`- Local:  ${frontendOrigin}`)
    console.log(`- Public: ${quickTunnelUrl}`)
    console.log('Press Ctrl-C to stop the local dev server and quick tunnel.')

    const exitingChild = await Promise.race([
      anonDevExitPromise.then(() => 'anon'),
      activeTunnelProcess.exitPromise.then(() => 'cloudflared'),
    ])

    if (hasStartedShutdown()) {
      return
    }

    if (exitingChild === 'anon') {
      throw new Error(
        `Anonymous local dev exited unexpectedly (${describeProcessExit(
          anonDevExitState.code,
          anonDevExitState.signal,
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
