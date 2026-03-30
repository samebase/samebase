#!/usr/bin/env node
// No dependencies by design: this file should stay easy to inspect, easy to
// reason about, and easy to mirror into hosted `/noter.js`.
//
// Audit guide:
// 1. Validate that this file was served from `/noter.js` on `https:` (or
//    explicit localhost `http:` during local testing).
// 2. Run `codex --version` to confirm Codex is installed.
// 3. Write one JSON installation record under `~/.noter/sync/installations/`.
// 4. Open Noter's `/machines/connect` page in the default browser.
//
// It does not install background services, modify project files, or download
// and execute any other code after this file starts running.
// The file you run is the installer source. Preview or local deploys can ship
// their own hosted copy without teaching users a separate targeting flag.

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const NOTER_SYNC_SCRIPT_PATHNAME = '/noter.js'
export const MACHINE_CONNECT_ROUTE = '/machines/connect'
export const NOTER_SYNC_STATE_DIRECTORY_NAME = '.noter/sync/installations'
// The public build stamps this constant per deploy so the file always knows
// which hosted origin it came from.
export const NOTER_SYNC_SOURCE_URL = 'https://noter.md/noter.js'

/**
 * Parse the tiny public CLI surface without pulling in a dependency. The first
 * shipped command intentionally stays narrow so the install surface remains easy
 * to audit and mirrors the single command shown by the web app.
 */
export function parseCliArgs(argv) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    return { command: 'help' }
  }

  if (argv[0] !== 'connect') {
    throw new Error(`Unknown command: ${argv[0]}`)
  }

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]
    throw new Error(`Unknown option: ${arg}`)
  }

  return { command: 'connect' }
}

/**
 * The installer only trusts the exact hosted file shape we expect. Keeping the
 * source URL narrow makes the browser handoff and the stored installation
 * record easier to reason about.
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
 * The install id is derived from the exact source URL so one laptop can keep
 * separate state for production, previews, and local worktrees.
 */
export function buildInstallationId(sourceUrl) {
  const source = new URL(sourceUrl)
  const hostFragment = source.host.replace(/[^a-z0-9.-]+/gi, '-')
  const sourceDigest = createHash('sha256')
    .update(source.toString())
    .digest('hex')
    .slice(0, 12)
  return `${hostFragment}-${sourceDigest}`
}

/**
 * All installer state lives under the user's home directory, never inside a
 * project checkout.
 */
export function getInstallationStatePath(args = {}) {
  const homeDirectory = args.homeDirectory ?? homedir()
  const installationId =
    args.installationId ?? buildInstallationId(args.sourceUrl)
  return path.join(
    homeDirectory,
    NOTER_SYNC_STATE_DIRECTORY_NAME,
    `${installationId}.json`,
  )
}

/**
 * The browser handoff needs just enough information to continue the flow:
 * which hosted file launched it, which local installation record it maps to,
 * and whether the page was opened by the CLI.
 */
export function buildMachineConnectUrl(args) {
  const machineConnectUrl = new URL(MACHINE_CONNECT_ROUTE, args.sourceUrl)
  const query = new URLSearchParams({
    source: args.sourceUrl,
    installation: args.installationId,
  }).toString()
  machineConnectUrl.search = `${query}&openedByCli`
  return machineConnectUrl.toString()
}

/**
 * Keep one small JSON record so the installer can be rerun safely without
 * losing the original install timestamp.
 */
export function writeInstallationState(args) {
  const installationPath = getInstallationStatePath({
    homeDirectory: args.homeDirectory,
    installationId: args.installationId,
    sourceUrl: args.sourceUrl,
  })
  const existingRecord = (() => {
    try {
      return JSON.parse(readFileSync(installationPath, 'utf8'))
    } catch {
      return null
    }
  })()
  const nowIso = new Date().toISOString()
  const nextRecord = {
    codexVersion: args.codexVersion,
    installedAt:
      typeof existingRecord?.installedAt === 'string'
        ? existingRecord.installedAt
        : nowIso,
    installationId: args.installationId,
    machineConnectUrl: args.machineConnectUrl,
    sourceOrigin: new URL(args.sourceUrl).origin,
    sourceUrl: args.sourceUrl,
    updatedAt: nowIso,
  }

  mkdirSync(path.dirname(installationPath), { recursive: true })
  writeFileSync(
    installationPath,
    `${JSON.stringify(nextRecord, null, 2)}\n`,
    'utf8',
  )

  return installationPath
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
        ? { command: 'cmd', args: ['/c', 'start', '', url] }
        : { command: 'xdg-open', args: [url] }

  return new Promise((resolve, reject) => {
    const child = spawn(openerCommand.command, openerCommand.args, {
      detached: true,
      stdio: 'ignore',
    })
    const handleError = error => {
      reject(
        new Error(
          `Could not open a browser automatically with ${openerCommand.command}: ${error.message}`,
        ),
      )
    }
    child.once('error', handleError)
    child.once('spawn', () => {
      child.off('error', handleError)
      child.unref()
      resolve()
    })
  })
}

export function formatHelpText() {
  return `Usage:
  noter-sync connect

Examples:
  # published package path (after publish)
  npx @noter-md/sync connect
  # local file
  node ./noter.js connect
  # direct hosted file today
  curl -fsSL https://noter.md/noter.js | node --input-type=module - connect`
}

/**
 * Emit machine-readable markdown so a person can read the output directly and
 * an LLM can explain what happened from a terminal transcript.
 */
export function formatBootstrapReadyMarkdown(args) {
  return `# noter sync bootstrap ready

- source: ${args.sourceUrl}
- codex: ${args.codexVersion}
- state: ${args.installationPath}
- next: ${args.machineConnectUrl}`
}

/**
 * Happy path:
 * 1. Validate the hosted source URL.
 * 2. Confirm Codex exists locally.
 * 3. Persist one local installation record.
 * 4. Print a markdown summary.
 * 5. Hand off to the browser for approval.
 */
export async function main(argv) {
  const parsedArgs = parseCliArgs(argv)
  if (parsedArgs.command === 'help') {
    console.log(formatHelpText())
    return
  }

  const sourceUrl = validateSourceUrl(NOTER_SYNC_SOURCE_URL).toString()
  const codexVersion = detectCodexVersion()
  const installationId = buildInstallationId(sourceUrl)
  const machineConnectUrl = buildMachineConnectUrl({
    installationId,
    sourceUrl,
  })
  const installationPath = writeInstallationState({
    codexVersion,
    installationId,
    machineConnectUrl,
    sourceUrl,
  })

  console.log(
    formatBootstrapReadyMarkdown({
      codexVersion,
      installationPath,
      machineConnectUrl,
      sourceUrl,
    }),
  )

  try {
    await openBrowser(machineConnectUrl)
    console.log('opened machine connect page in your browser')
  } catch (error) {
    console.warn(
      error instanceof Error
        ? error.message
        : 'Could not open a browser automatically.',
    )
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

  return import.meta.url === pathToFileURL(entrypoint).href
}

if (isDirectExecution()) {
  try {
    await main(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
