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
//
// It does not install background services, modify project files, or download
// and execute any other code after this file starts running.
// The file you run is the installer source. Preview or local deploys can ship
// their own hosted copy without teaching users a separate targeting flag.
// If we add a visible installer version comment later, it should be updated
// manually only when this installer file changes, and the hosted copy should
// mirror it exactly instead of stamping deploy-specific metadata.

import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const NOTER_SYNC_SCRIPT_PATHNAME = '/noter.js'
export const MACHINE_CONNECT_ROUTE = '/machines/connect'
export const NOTER_CONFIG_PATHNAME = '.noter/config.json'
// When the command does not pass an explicit source URL, default to production.
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

  if (argv.length > 2) {
    throw new Error(`Unknown option: ${argv[2]}`)
  }

  return {
    command: 'connect',
    sourceUrl: argv[1] ?? null,
  }
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

/**
 * The browser handoff only needs a stable destination and a key-only bootstrap
 * flag. The hosted page can derive its own script URL from the current origin.
 */
export function buildMachineConnectUrl(sourceUrl) {
  const machineConnectUrl = new URL(MACHINE_CONNECT_ROUTE, sourceUrl)
  machineConnectUrl.search = 'openedByCli'
  return machineConnectUrl.toString()
}

/**
 * Keep one small JSON config file per Codex instance. Re-running the bootstrap
 * updates the current source URL while preserving the original install time.
 */
export function writeLocalConfig(args) {
  const configPath = getNoterConfigPath({
    homeDirectory: args.homeDirectory,
  })
  const existingRecord = (() => {
    try {
      return JSON.parse(readFileSync(configPath, 'utf8'))
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
    sourceUrl: args.sourceUrl,
    updatedAt: nowIso,
  }

  mkdirSync(path.dirname(configPath), { recursive: true })
  writeFileSync(configPath, `${JSON.stringify(nextRecord, null, 2)}\n`, 'utf8')

  return configPath
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

export function formatHelpText() {
  return `Usage:
  noter-sync connect

Examples:
  # published package path (after publish)
  npx @noter-md/sync connect
  # local file
  node ./noter.js connect
  # direct hosted file in production
  curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect
  # preview or local explicit override
  SCRIPT_URL='https://preview.noter.md/noter.js'; curl -fsSL "$SCRIPT_URL" | node --input-type=module - connect "$SCRIPT_URL"`
}

/**
 * Emit machine-readable markdown so a person can read the output directly and
 * an LLM can explain what happened from a terminal transcript.
 */
export function formatBootstrapReadyMarkdown(args) {
  return `# noter sync bootstrap ready

- source: ${args.sourceUrl}
- codex: ${args.codexVersion}
- state: ${args.configPath}
- next: ${args.machineConnectUrl}`
}

/**
 * Happy path:
 * 1. Validate the hosted source URL.
 * 2. Confirm Codex exists locally.
 * 3. Persist one local config file.
 * 4. Print a markdown summary.
 * 5. Hand off to the browser for approval.
 */
export async function main(argv) {
  const parsedArgs = parseCliArgs(argv)
  if (parsedArgs.command === 'help') {
    console.log(formatHelpText())
    return
  }

  const sourceUrl = validateSourceUrl(
    parsedArgs.sourceUrl ?? NOTER_SYNC_SOURCE_URL,
  ).toString()
  const codexVersion = detectCodexVersion()
  const machineConnectUrl = buildMachineConnectUrl(sourceUrl)
  const configPath = writeLocalConfig({
    codexVersion,
    sourceUrl,
  })

  console.log(
    formatBootstrapReadyMarkdown({
      codexVersion,
      configPath,
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
