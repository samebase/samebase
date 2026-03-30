#!/usr/bin/env node
// No dependencies by design: this file should stay easy to inspect, easy to
// reason about, and easy to mirror into hosted `/noter.js`.
//
// Audit guide:
// 1. Validate that this file was served from `/noter.js` on `https:` (or
//    explicit localhost `http:` during local testing).
// 2. Run `codex --version` to confirm Codex is installed.
// 3. Write one JSON config file under `~/.noter/config.json`.
// 4. Open Noter's `/machines/connect` page in the default browser.
// 5. Reuse the stored machine credential for later heartbeat publishing.
//
// It does not install background services, modify project files, or download
// and execute any other code after this file starts running.
// The file you run is the installer source. Preview or local deploys can ship
// their own hosted copy without teaching users a separate targeting flag.
// If we add a visible installer version comment later, it should be updated
// manually only when this installer file changes, and the hosted copy should
// mirror it exactly instead of stamping deploy-specific metadata.

import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { homedir, hostname, platform } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const NOTER_SYNC_SCRIPT_PATHNAME = '/noter.js'
export const NOTER_CONNECT_CONFIG_PATHNAME = '/noter-connect.json'
export const MACHINE_CONNECT_ROUTE = '/machines/connect'
export const NOTER_CONFIG_PATHNAME = '.noter/config.json'
export const CONNECTED_MACHINE_BOOTSTRAP_PATHNAME =
  '/connected-machines/bootstrap'
export const CONNECTED_MACHINE_HEARTBEAT_PATHNAME =
  '/connected-machines/heartbeat'
export const CONNECTED_MACHINE_HEARTBEAT_INTERVAL_MS = 15_000
export const CONNECTED_MACHINE_CAPABILITIES = ['presence']
// When the command does not pass an explicit source URL, default to production.
export const NOTER_SYNC_SOURCE_URL = 'https://noter.md/noter.js'

function base64UrlEncode(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), value =>
    value.toString(16).padStart(2, '0'),
  ).join('')
}

function buildConnectorVersion(codexVersion) {
  return `noter-sync (${codexVersion})`
}

function buildMachineId() {
  return `machine_${randomToken(12)}`
}

function normalizeMachineOs(platformName) {
  if (platformName === 'darwin') {
    return 'macos'
  }
  if (platformName === 'win32') {
    return 'windows'
  }
  return 'linux'
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseJsonOrNull(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/**
 * Parse the tiny public CLI surface without pulling in a dependency. The first
 * shipped commands intentionally stay narrow so the install surface remains
 * easy to audit and mirrors the single commands shown by the web app.
 */
export function parseCliArgs(argv) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    return { command: 'help' }
  }

  if (argv[0] === 'connect') {
    if (argv.length > 2) {
      throw new Error(`Unknown option: ${argv[2]}`)
    }

    return {
      command: 'connect',
      sourceUrl: argv[1] ?? null,
    }
  }

  if (argv[0] === 'run') {
    if (argv.length > 1) {
      throw new Error(`Unknown option: ${argv[1]}`)
    }

    return {
      command: 'run',
    }
  }

  throw new Error(`Unknown command: ${argv[0]}`)
}

/**
 * The installer only trusts the exact hosted file shape we expect. Keeping the
 * source URL narrow makes the browser handoff and the stored config easier to
 * reason about.
 */
export function validateSourceUrl(value) {
  const sourceUrl = new URL(value)
  const isLoopbackHttp =
    sourceUrl.protocol === 'http:' &&
    (sourceUrl.hostname === 'localhost' ||
      sourceUrl.hostname === '127.0.0.1' ||
      sourceUrl.hostname === '::1' ||
      sourceUrl.hostname === '[::1]')
  if (sourceUrl.protocol !== 'https:' && !isLoopbackHttp) {
    throw new Error(
      'The installer source URL must use https, except for explicit localhost testing.',
    )
  }
  if (sourceUrl.pathname !== NOTER_SYNC_SCRIPT_PATHNAME) {
    throw new Error(
      `The installer source URL must point to ${NOTER_SYNC_SCRIPT_PATHNAME}.`,
    )
  }
  if (
    sourceUrl.username.length > 0 ||
    sourceUrl.password.length > 0 ||
    sourceUrl.search.length > 0 ||
    sourceUrl.hash.length > 0
  ) {
    throw new Error(
      'The installer source URL must not include credentials, query params, or hashes.',
    )
  }
  return sourceUrl
}

/**
 * The runtime config file is deploy-scoped, so it is allowed to carry the
 * Convex HTTP base even though `/noter.js` itself stays byte-for-byte identical
 * across deploys.
 */
export function buildNoterConnectConfigUrl(sourceUrl) {
  return new URL(NOTER_CONNECT_CONFIG_PATHNAME, sourceUrl).toString()
}

export function buildMachineConnectUrl(sourceUrl, requestId) {
  const machineConnectUrl = new URL(MACHINE_CONNECT_ROUTE, sourceUrl)
  machineConnectUrl.search =
    typeof requestId === 'string' && requestId.length > 0
      ? `openedByCli&requestId=${encodeURIComponent(requestId)}`
      : 'openedByCli'
  return machineConnectUrl.toString()
}

export function buildBootstrapUrl(convexSiteUrl) {
  return new URL(CONNECTED_MACHINE_BOOTSTRAP_PATHNAME, convexSiteUrl).toString()
}

export function buildHeartbeatUrl(convexSiteUrl) {
  return new URL(CONNECTED_MACHINE_HEARTBEAT_PATHNAME, convexSiteUrl).toString()
}

/**
 * We only need proof that Codex exists locally. `codex --version` is the
 * smallest safe command that gives us that signal.
 */
export function detectCodexVersion() {
  const result = spawnSync('codex', ['--version'], {
    encoding: 'utf8',
  })

  if (result.error || result.status !== 0) {
    throw new Error(
      'The `codex` command was not found. Install Codex before running noter sync.',
    )
  }

  return (result.stdout || result.stderr).trim()
}

/**
 * All installer state lives under the user's home directory, never inside a
 * project checkout.
 */
export function getNoterConfigPath(args = {}) {
  const homeDirectory = args.homeDirectory ?? homedir()
  return path.join(homeDirectory, NOTER_CONFIG_PATHNAME)
}

export function readLocalConfig(args = {}) {
  const configPath = getNoterConfigPath({
    homeDirectory: args.homeDirectory,
  })
  try {
    return parseJsonOrNull(readFileSync(configPath, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Keep one small JSON config file per Codex instance. Re-running the bootstrap
 * updates the current source URL while preserving the original install time.
 */
export function writeLocalConfig(args) {
  const configPath = getNoterConfigPath({
    homeDirectory: args.homeDirectory,
  })
  const existingRecord = readLocalConfig({
    homeDirectory: args.homeDirectory,
  })
  const nowIso = new Date().toISOString()
  const nextRecord = {
    codexVersion: args.codexVersion,
    installedAt:
      typeof existingRecord?.installedAt === 'string'
        ? existingRecord.installedAt
        : nowIso,
    machineId: args.machineId,
    sourceUrl: args.sourceUrl,
    updatedAt: nowIso,
    ...(typeof args.machineCredential === 'string'
      ? { machineCredential: args.machineCredential }
      : typeof existingRecord?.machineCredential === 'string'
        ? { machineCredential: existingRecord.machineCredential }
        : {}),
  }

  mkdirSync(path.dirname(configPath), { recursive: true })
  writeFileSync(configPath, `${JSON.stringify(nextRecord, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  chmodSync(configPath, 0o600)

  return configPath
}

function readStoredMachineConfig(args = {}) {
  const storedConfig = readLocalConfig({
    homeDirectory: args.homeDirectory,
  })
  const sourceUrl = storedConfig?.sourceUrl
  const machineId = storedConfig?.machineId
  const machineCredential = storedConfig?.machineCredential

  if (typeof sourceUrl !== 'string' || sourceUrl.length === 0) {
    throw new Error(
      'Missing `sourceUrl` in ~/.noter/config.json. Run `noter-sync connect` first.',
    )
  }
  if (typeof machineId !== 'string' || machineId.length === 0) {
    throw new Error(
      'Missing `machineId` in ~/.noter/config.json. Run `noter-sync connect` first.',
    )
  }
  if (typeof machineCredential !== 'string' || machineCredential.length === 0) {
    throw new Error(
      'Missing `machineCredential` in ~/.noter/config.json. Finish `noter-sync connect` first.',
    )
  }

  return {
    machineCredential,
    machineId,
    sourceUrl: validateSourceUrl(sourceUrl).toString(),
  }
}

function validateConvexSiteUrl(value) {
  const convexSiteUrl = new URL(value)
  if (
    convexSiteUrl.protocol !== 'https:' &&
    convexSiteUrl.protocol !== 'http:'
  ) {
    throw new Error('The runtime Convex site URL must use http or https.')
  }
  if (convexSiteUrl.username || convexSiteUrl.password) {
    throw new Error('The runtime Convex site URL must not include credentials.')
  }
  convexSiteUrl.hash = ''
  return convexSiteUrl
}

async function readJsonResponse(response) {
  const text = await response.text()
  const parsed = parseJsonOrNull(text)
  return {
    parsed,
    text,
  }
}

async function fetchNoterConnectConfig(sourceUrl) {
  const configUrl = buildNoterConnectConfigUrl(sourceUrl)
  const response = await fetch(configUrl, {
    headers: {
      accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(
      `Could not download ${NOTER_CONNECT_CONFIG_PATHNAME}: HTTP ${response.status}.`,
    )
  }

  const { parsed, text } = await readJsonResponse(response)
  const convexSiteUrl = parsed?.convexSiteUrl
  if (typeof convexSiteUrl !== 'string' || convexSiteUrl.length === 0) {
    throw new Error(
      `${NOTER_CONNECT_CONFIG_PATHNAME} is missing a valid "convexSiteUrl" string.`,
    )
  }

  try {
    return validateConvexSiteUrl(convexSiteUrl).toString()
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : `Invalid ${NOTER_CONNECT_CONFIG_PATHNAME}: ${text}`,
    )
  }
}

async function postJson(args) {
  const response = await fetch(args.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(args.authorization
        ? { authorization: `Bearer ${args.authorization}` }
        : {}),
    },
    body: JSON.stringify(args.body),
  })

  const { parsed, text } = await readJsonResponse(response)
  if (!response.ok) {
    const message =
      typeof parsed?.error === 'string' && parsed.error.length > 0
        ? parsed.error
        : text || `HTTP ${response.status}`
    throw new Error(message)
  }

  return parsed
}

async function createMachineRegistration(args) {
  const convexSiteUrl = await fetchNoterConnectConfig(args.sourceUrl)
  const requestId = `mreq_${randomToken(16)}`
  const machineCredential = `mmc_${randomToken(24)}`
  const credentialHash = await sha256Hex(machineCredential)

  await postJson({
    url: buildBootstrapUrl(convexSiteUrl),
    body: {
      connectorVersion: args.connectorVersion,
      credentialHash,
      displayName: args.displayName,
      hostname: args.hostname,
      machineId: args.machineId,
      os: args.os,
      requestId,
    },
  })

  return {
    machineConnectUrl: buildMachineConnectUrl(args.sourceUrl, requestId),
    machineCredential,
  }
}

async function publishMachineHeartbeat(args) {
  const convexSiteUrl = await fetchNoterConnectConfig(args.sourceUrl)

  try {
    await postJson({
      url: buildHeartbeatUrl(convexSiteUrl),
      authorization: args.machineCredential,
      body: {
        allowedRoots: [],
        capabilities: CONNECTED_MACHINE_CAPABILITIES,
        connectorVersion: args.connectorVersion,
        displayName: args.displayName,
        hostname: args.hostname,
        machineId: args.machineId,
        os: args.os,
        status: args.status,
      },
    })
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'invalid machine credential'
    ) {
      throw new Error(
        'This machine is not approved yet. Finish approval in Noter and retry `noter-sync run`.',
      )
    }
    throw error
  }
}

/**
 * Automatic browser open is a convenience, not a hard dependency. Failures are
 * reported but do not invalidate the bootstrap record we already wrote.
 */
export function openBrowser(url) {
  const openerCommand =
    platform() === 'darwin'
      ? { command: 'open', args: [url] }
      : platform() === 'win32'
        ? {
            command: 'cmd',
            args: ['/d', '/s', '/c', `start "" "${url.replaceAll('"', '""')}"`],
          }
        : { command: 'xdg-open', args: [url] }

  return new Promise((resolve, reject) => {
    const child = spawn(openerCommand.command, openerCommand.args, {
      detached: true,
      stdio: 'ignore',
    })
    child.once('error', error => {
      reject(
        new Error(
          `Could not open a browser automatically with ${openerCommand.command}: ${error.message}`,
        ),
      )
    })
    child.once('exit', code => {
      if (code !== 0) {
        reject(
          new Error(
            `Could not open a browser automatically with ${openerCommand.command}: exited with code ${code}.`,
          ),
        )
        return
      }
      child.unref()
      resolve()
    })
  })
}

function buildDirectRunCommand(sourceUrl) {
  return `curl -fsSL '${sourceUrl}' | node --input-type=module - run`
}

export function formatHelpText() {
  return `Usage:
  noter-sync connect
  noter-sync run

Examples:
  # published package path (after publish)
  npx @noter-md/sync connect
  npx @noter-md/sync run
  # local file
  node ./noter.js connect
  node ./noter.js run
  # direct hosted file in production
  curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'
  curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - run
  # preview or local explicit override
  curl -fsSL 'https://preview.noter.md/noter.js' | node --input-type=module - connect 'https://preview.noter.md/noter.js'`
}

/**
 * Emit machine-readable markdown so a person can read the output directly and
 * an LLM can explain what happened from a terminal transcript.
 */
export function formatBootstrapReadyMarkdown(args) {
  return `# noter sync bootstrap ready

- source: ${args.sourceUrl}
- codex: ${args.codexVersion}
- machine: ${args.machineId}
- state: ${args.configPath}
- next: ${args.machineConnectUrl}
- run: ${args.runCommand}`
}

async function runConnectCommand(parsedArgs) {
  const sourceUrl = validateSourceUrl(
    parsedArgs.sourceUrl ?? NOTER_SYNC_SOURCE_URL,
  ).toString()
  const codexVersion = detectCodexVersion()
  const existingRecord = readLocalConfig()
  const machineId =
    typeof existingRecord?.machineId === 'string' &&
    existingRecord.machineId.length > 0
      ? existingRecord.machineId
      : buildMachineId()
  const displayName = hostname()
  const os = normalizeMachineOs(platform())
  const connectorVersion = buildConnectorVersion(codexVersion)
  const registration = await createMachineRegistration({
    connectorVersion,
    displayName,
    hostname: displayName,
    machineId,
    os,
    sourceUrl,
  })
  const configPath = writeLocalConfig({
    codexVersion,
    machineCredential: registration.machineCredential,
    machineId,
    sourceUrl,
  })

  console.log(
    formatBootstrapReadyMarkdown({
      codexVersion,
      configPath,
      machineConnectUrl: registration.machineConnectUrl,
      machineId,
      runCommand: buildDirectRunCommand(sourceUrl),
      sourceUrl,
    }),
  )

  try {
    await openBrowser(registration.machineConnectUrl)
    console.log('opened machine connect page in your browser')
  } catch (error) {
    console.warn(
      error instanceof Error
        ? error.message
        : 'Could not open a browser automatically.',
    )
  }
}

async function runHeartbeatLoop(args) {
  /** @type {() => void} */
  let requestStop = () => {}
  const stopPromise = new Promise(resolve => {
    requestStop = () => resolve('stop')
  })
  const handleStop = () => {
    requestStop()
  }

  process.once('SIGINT', handleStop)
  process.once('SIGTERM', handleStop)

  try {
    for (;;) {
      await publishMachineHeartbeat({
        connectorVersion: args.connectorVersion,
        displayName: args.displayName,
        hostname: args.hostname,
        machineCredential: args.machineCredential,
        machineId: args.machineId,
        os: args.os,
        sourceUrl: args.sourceUrl,
        status: 'online',
      })

      const wakeReason = await Promise.race([
        sleep(CONNECTED_MACHINE_HEARTBEAT_INTERVAL_MS).then(() => 'tick'),
        stopPromise,
      ])
      if (wakeReason === 'stop') {
        break
      }
    }
  } finally {
    process.removeListener('SIGINT', handleStop)
    process.removeListener('SIGTERM', handleStop)

    try {
      await publishMachineHeartbeat({
        connectorVersion: args.connectorVersion,
        displayName: args.displayName,
        hostname: args.hostname,
        machineCredential: args.machineCredential,
        machineId: args.machineId,
        os: args.os,
        sourceUrl: args.sourceUrl,
        status: 'offline',
      })
    } catch (error) {
      console.warn(
        error instanceof Error
          ? error.message
          : 'Could not publish the offline heartbeat.',
      )
    }
  }
}

async function runConnectorCommand() {
  const codexVersion = detectCodexVersion()
  const storedConfig = readStoredMachineConfig()
  const displayName = hostname()
  const os = normalizeMachineOs(platform())
  const connectorVersion = buildConnectorVersion(codexVersion)

  console.log(`# noter sync connector running

- source: ${storedConfig.sourceUrl}
- machine: ${storedConfig.machineId}
- status: publishing heartbeats until this process exits`)

  await runHeartbeatLoop({
    connectorVersion,
    displayName,
    hostname: displayName,
    machineCredential: storedConfig.machineCredential,
    machineId: storedConfig.machineId,
    os,
    sourceUrl: storedConfig.sourceUrl,
  })
}

/**
 * Happy path:
 * 1. Validate the hosted source URL.
 * 2. Confirm Codex exists locally.
 * 3. Persist one local config file.
 * 4. Print a markdown summary.
 * 5. Hand off to the browser for approval.
 * 6. Later, reuse the stored machine credential to publish heartbeats.
 */
export async function main(argv) {
  const parsedArgs = parseCliArgs(argv)
  if (parsedArgs.command === 'help') {
    console.log(formatHelpText())
    return
  }

  if (parsedArgs.command === 'connect') {
    await runConnectCommand(parsedArgs)
    return
  }

  await runConnectorCommand()
}

/**
 * Support both `node ./noter.js` and stdin execution from
 * `curl ... | node --input-type=module -`.
 */
export function resolveEntrypointUrl(entrypoint) {
  try {
    return pathToFileURL(realpathSync(entrypoint)).href
  } catch {
    return pathToFileURL(path.resolve(entrypoint)).href
  }
}

/**
 * Support both `node ./noter.js` and stdin execution from
 * `curl ... | node --input-type=module -`.
 */
function isDirectExecution() {
  const entrypoint = process.argv[1]
  if (!entrypoint) {
    return false
  }

  if (entrypoint === '-') {
    return true
  }

  return import.meta.url === resolveEntrypointUrl(entrypoint)
}

if (isDirectExecution()) {
  try {
    await main(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
