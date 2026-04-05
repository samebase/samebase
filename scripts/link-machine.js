#!/usr/bin/env node
// @ts-check

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HELP_TEXT = `Usage: scripts/link-machine.js [options]

Connect the current checkout to Noter with an isolated machine state dir.

Options:
  --source-url <url>     Use an explicit /noter.js URL instead of auto-detecting localhost.
  --state-dir <path>     Override the isolated state dir.
  --no-open              Do not open the approval URL in the default browser.
  --no-auto-approve      Keep the browser approval step manual.
  --no-run               Stop after connect/approval instead of starting noter-sync run.
  -h, --help             Show this help message.
`

const DEFAULT_SOURCE_PORTS = [
  5174, 5173, 5175, 5176, 5177, 5178, 5179, 5180, 5181, 5182, 5183, 5184, 5185,
  5186, 5187, 5188, 5189, 5190,
]
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
const POSIX_SHELL_MARKERS = ['bash', 'zsh', 'sh', 'dash', 'fish', 'ksh']
const POWERSHELL_MARKERS = ['pwsh', 'powershell']
const DEV_PASSWORD_EMAIL = 'nicu@noter.md'
const DEV_PASSWORD_VALUE = 'pass1234'
const NOTER_SYNC_ARGS_PREFIX = ['packages/sync/noter.js']
const NOTER_SYNC_CONFIG_PATHNAME = '/noter-connect.json'

class LinkMachineError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message)
    this.name = 'LinkMachineError'
  }
}

if (isMainModule()) {
  void main(process.argv.slice(2)).catch(handleMainError)
}

/**
 * @typedef {{
 *   action: (fn: unknown, args?: Record<string, unknown>) => Promise<unknown>
 *   mutation: (fn: unknown, args?: Record<string, unknown>) => Promise<unknown>
 *   query: (fn: unknown, args?: Record<string, unknown>) => Promise<unknown>
 *   setAuth: (value: string) => void
 * }} ConvexClientLike
 */

/**
 * @typedef {new (
 *   address: string,
 *   options?: { logger?: boolean }
 * ) => ConvexClientLike} ConvexHttpClientConstructor
 */

/**
 * @typedef {{
 *   ConvexHttpClient?: ConvexHttpClientConstructor
 * }} ConvexBrowserModule
 */

/**
 * @typedef {{
 *   makeFunctionReference?: (name: string) => unknown
 * }} ConvexServerModule
 */

/**
 * @typedef {{
 *   autoApprove: boolean
 *   openBrowser: boolean
 *   runConnector: boolean
 *   showHelp: boolean
 *   sourceUrl: string | null
 *   stateDirectory: string | null
 * }} LinkMachineOptions
 */

/**
 * @param {string[]} args
 * @returns {LinkMachineOptions}
 */
export function parseArgs(args) {
  /** @type {LinkMachineOptions} */
  const result = {
    autoApprove: true,
    openBrowser: true,
    runConnector: true,
    showHelp: false,
    sourceUrl: null,
    stateDirectory: null,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--help' || arg === '-h') {
      result.showHelp = true
      continue
    }

    if (arg === '--no-open') {
      result.openBrowser = false
      continue
    }

    if (arg === '--no-auto-approve') {
      result.autoApprove = false
      continue
    }

    if (arg === '--no-run') {
      result.runConnector = false
      continue
    }

    if (arg === '--source-url') {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        throw new LinkMachineError(`Missing value for ${arg}`)
      }
      result.sourceUrl = value
      index += 1
      continue
    }

    if (arg === '--state-dir') {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        throw new LinkMachineError(`Missing value for ${arg}`)
      }
      result.stateDirectory = value
      index += 1
      continue
    }

    throw new LinkMachineError(`Unknown argument: ${arg}`)
  }

  return result
}

/**
 * @param {string} checkoutRoot
 * @returns {string}
 */
export function deriveCheckoutId(checkoutRoot) {
  const normalizedRoot = path.resolve(checkoutRoot)
  const worktreeMarker = `${path.sep}.codex${path.sep}worktrees${path.sep}`
  const worktreeMarkerIndex = normalizedRoot.indexOf(worktreeMarker)

  if (worktreeMarkerIndex !== -1) {
    const worktreeSuffix = normalizedRoot.slice(
      worktreeMarkerIndex + worktreeMarker.length,
    )
    const checkoutId = worktreeSuffix.split(path.sep).find(Boolean)
    if (checkoutId) {
      return checkoutId
    }
  }

  return path.basename(normalizedRoot)
}

/**
 * @param {string} checkoutRoot
 * @param {string | null} explicitStateDirectory
 * @returns {string}
 */
export function resolveStateDirectory(checkoutRoot, explicitStateDirectory) {
  if (explicitStateDirectory) {
    return path.resolve(explicitStateDirectory)
  }

  return path.join(
    os.homedir(),
    '.noter',
    'checkouts',
    deriveCheckoutId(checkoutRoot),
  )
}

/**
 * @param {string | null} explicitSourceUrl
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function buildLocalSourceUrlCandidates(
  explicitSourceUrl,
  env = process.env,
) {
  if (explicitSourceUrl) {
    return [explicitSourceUrl]
  }

  /** @type {number[]} */
  const ports = []

  /**
   * @param {number | string | undefined | null} value
   * @returns {void}
   */
  const addPort = value => {
    const parsed = Number.parseInt(`${value ?? ''}`, 10)
    if (!Number.isInteger(parsed) || parsed <= 0 || ports.includes(parsed)) {
      return
    }
    ports.push(parsed)
  }

  addPort(env.ANON_VITE_PORT)
  addPort(env.VITE_PORT)

  for (const defaultPort of DEFAULT_SOURCE_PORTS) {
    addPort(defaultPort)
  }

  return ports.map(port => `http://127.0.0.1:${port}/noter.js`)
}

/**
 * @param {string} markdown
 * @param {string} label
 * @returns {string | null}
 */
export function readBootstrapMarkdownValue(markdown, label) {
  const escapedLabel = escapeRegExp(label)
  const match = markdown.match(new RegExp(`^- ${escapedLabel}: (.+)$`, 'm'))
  return match ? match[1].trim() : null
}

/**
 * @param {string} machineConnectUrl
 * @returns {string | null}
 */
export function readMachineConnectRequestId(machineConnectUrl) {
  try {
    return new URL(machineConnectUrl).searchParams.get('requestId')
  } catch {
    return null
  }
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isLoopbackUrl(value) {
  try {
    const url = new URL(value)
    return LOOPBACK_HOSTNAMES.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

/**
 * Printed fallback commands should match the operator's current shell instead
 * of assuming one quoting style per platform.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {NodeJS.Platform} [currentPlatform]
 * @returns {'cmd' | 'posix' | 'powershell' | 'unknown'}
 */
export function detectShellStyle(
  env = process.env,
  currentPlatform = process.platform,
) {
  const shell = `${env.SHELL ?? ''}`.toLowerCase()
  const comSpec = `${env.ComSpec ?? env.COMSPEC ?? ''}`.toLowerCase()
  const term = `${env.TERM ?? ''}`.toLowerCase()
  const termProgram = `${env.TERM_PROGRAM ?? ''}`.toLowerCase()
  const shlvl = `${env.SHLVL ?? ''}`.toLowerCase()
  const psModulePath = `${env.PSModulePath ?? ''}`.toLowerCase()

  if (POWERSHELL_MARKERS.some(marker => shell.includes(marker))) {
    return 'powershell'
  }
  if (POSIX_SHELL_MARKERS.some(marker => shell.includes(marker))) {
    return 'posix'
  }
  if (
    psModulePath.length > 0 ||
    POWERSHELL_MARKERS.some(
      marker => term.includes(marker) || termProgram.includes(marker),
    )
  ) {
    return 'powershell'
  }
  if (POSIX_SHELL_MARKERS.some(marker => term.includes(marker))) {
    return 'posix'
  }
  if (shlvl.length > 0) {
    return 'posix'
  }
  if (
    comSpec.includes('cmd.exe') ||
    comSpec.endsWith('\\cmd') ||
    comSpec.endsWith('/cmd')
  ) {
    return 'cmd'
  }

  return currentPlatform === 'win32' ? 'unknown' : 'posix'
}

/**
 * @param {string} value
 * @param {NodeJS.Platform} [currentPlatform]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function shellSingleQuote(
  value,
  currentPlatform = process.platform,
  env = process.env,
) {
  const shellStyle = detectShellStyle(env, currentPlatform)

  if (shellStyle === 'posix') {
    return `'${value.replaceAll("'", "'\"'\"'")}'`
  }
  if (shellStyle === 'powershell') {
    return `'${value.replaceAll("'", "''")}'`
  }
  if (shellStyle === 'cmd') {
    return `"${value
      .replaceAll('^', '^^')
      .replaceAll('%', '%%')
      .replaceAll('!', '^^!')
      .replaceAll('"', '^"')}"`
  }

  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('$', '\\$')
    .replaceAll('`', '\\`')}"`
}

/**
 * @param {string} stateDirectory
 * @param {NodeJS.Platform} [currentPlatform]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function buildRunCommand(
  stateDirectory,
  currentPlatform = process.platform,
  env = process.env,
) {
  return `node packages/sync/noter.js run --state-dir ${shellSingleQuote(
    stateDirectory,
    currentPlatform,
    env,
  )}`
}

/**
 * @param {NodeJS.Signals | null} signal
 * @returns {number | null}
 */
export function deriveSignalExitCode(signal) {
  if (!signal) {
    return null
  }

  const signalNumber = os.constants.signals[signal]
  return typeof signalNumber === 'number' ? 128 + signalNumber : 1
}

/**
 * @param {string[]} argv
 * @returns {Promise<void>}
 */
async function main(argv) {
  const options = parseArgs(argv)
  if (options.showHelp) {
    console.log(HELP_TEXT)
    return
  }

  const repoRoot = resolveRepoRoot()
  const sourceUrl = await resolveSourceUrl(options.sourceUrl)
  const stateDirectory = resolveStateDirectory(repoRoot, options.stateDirectory)
  const connectResult = runConnectCommand({
    repoRoot,
    sourceUrl,
    stateDirectory,
  })
  const requestId = readMachineConnectRequestId(connectResult.machineConnectUrl)

  if (!requestId) {
    throw new LinkMachineError(
      'Machine connect output did not include a requestId in the approval URL.',
    )
  }

  if (options.openBrowser) {
    try {
      openUrl(connectResult.machineConnectUrl)
      console.log(`Opened ${connectResult.machineConnectUrl}`)
    } catch (error) {
      console.warn(
        `Could not open the approval URL automatically: ${describeError(error)}`,
      )
    }
  }

  let readyToRun = false
  if (options.autoApprove) {
    try {
      const convexSiteUrl = await fetchConvexSiteUrl(sourceUrl)

      // Keep preview and production ownership changes behind the explicit
      // browser approval page. Local/dev loopback deployments can safely use
      // the seeded password account to remove the Playwright dependency.
      if (isLoopbackUrl(convexSiteUrl)) {
        const approvalResult = await autoApproveLocalRequest({
          convexSiteUrl,
          repoRoot,
          requestId,
        })
        readyToRun = true
        console.log(
          approvalResult.alreadyApproved
            ? 'Machine request was already approved.'
            : 'Machine request approved automatically with local dev auth.',
        )
      } else {
        console.log(
          'Leaving machine approval manual because the deployment backend is not loopback.',
        )
      }
    } catch (error) {
      console.warn(
        `Could not auto-approve the machine request: ${describeError(error)}`,
      )
    }
  }

  if (!options.runConnector) {
    return
  }

  if (!readyToRun) {
    console.log(
      `After the browser approval completes, start the connector with:\n${buildRunCommand(stateDirectory)}`,
    )
    return
  }

  startRunCommand({
    repoRoot,
    stateDirectory,
  })
}

/**
 * @returns {string}
 */
function resolveRepoRoot() {
  const output = execGit(['rev-parse', '--show-toplevel'])
  if (!output) {
    throw new LinkMachineError(
      'Failed to resolve the current git checkout root.',
    )
  }
  return output
}

/**
 * @param {string[]} args
 * @returns {string}
 */
function execGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new LinkMachineError(result.stderr.trim() || result.stdout.trim())
  }

  return result.stdout.trim()
}

/**
 * @param {string | null} explicitSourceUrl
 * @returns {Promise<string>}
 */
async function resolveSourceUrl(explicitSourceUrl) {
  const candidates = buildLocalSourceUrlCandidates(explicitSourceUrl)

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        headers: {
          Accept: 'text/javascript,application/javascript,*/*',
        },
        signal: AbortSignal.timeout(1_500),
      })
      if (response.ok) {
        return candidate
      }
    } catch {
      continue
    }
  }

  if (explicitSourceUrl) {
    throw new LinkMachineError(`Could not reach ${explicitSourceUrl}.`)
  }

  throw new LinkMachineError(
    'Could not find a running local /noter.js. Start the app with `make anon` or pass `--source-url <url>`.',
  )
}

/**
 * @param {{
 *   repoRoot: string
 *   sourceUrl: string
 *   stateDirectory: string
 * }} args
 * @returns {{ machineConnectUrl: string, runCommand: string | null }}
 */
function runConnectCommand(args) {
  const result = spawnSync(
    'node',
    [
      ...NOTER_SYNC_ARGS_PREFIX,
      'connect',
      '--state-dir',
      args.stateDirectory,
      args.sourceUrl,
    ],
    {
      cwd: args.repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  if (result.stdout) {
    process.stdout.write(result.stdout)
  }
  if (result.stderr) {
    process.stderr.write(result.stderr)
  }

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new LinkMachineError(
      `noter-sync connect failed with exit code ${result.status ?? 1}.`,
    )
  }

  const machineConnectUrl = readBootstrapMarkdownValue(result.stdout, 'next')
  if (!machineConnectUrl) {
    throw new LinkMachineError(
      'noter-sync connect did not print the machine approval URL.',
    )
  }

  return {
    machineConnectUrl,
    runCommand: readBootstrapMarkdownValue(result.stdout, 'run'),
  }
}

/**
 * @param {string} sourceUrl
 * @returns {Promise<string>}
 */
async function fetchConvexSiteUrl(sourceUrl) {
  const response = await fetch(
    new URL(NOTER_SYNC_CONFIG_PATHNAME, sourceUrl).toString(),
    {
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(2_000),
    },
  )

  if (!response.ok) {
    throw new LinkMachineError(
      `Could not download ${NOTER_SYNC_CONFIG_PATHNAME}: HTTP ${response.status}.`,
    )
  }

  /** @type {unknown} */
  const payload = await response.json()
  if (!isRecord(payload)) {
    throw new LinkMachineError(
      `${NOTER_SYNC_CONFIG_PATHNAME} did not return a JSON object.`,
    )
  }

  const convexSiteUrl = readOptionalStringField(payload, 'convexSiteUrl')
  if (typeof convexSiteUrl !== 'string' || convexSiteUrl.length === 0) {
    throw new LinkMachineError(
      `${NOTER_SYNC_CONFIG_PATHNAME} is missing a valid convexSiteUrl.`,
    )
  }

  return convexSiteUrl
}

/**
 * @param {{
 *   convexSiteUrl: string
 *   repoRoot: string
 *   requestId: string
 * }} args
 * @returns {Promise<{ alreadyApproved: boolean }>}
 */
async function autoApproveLocalRequest(args) {
  const { ConvexHttpClient, makeFunctionReference } = loadConvexHelpers(
    args.repoRoot,
  )
  const client = new ConvexHttpClient(args.convexSiteUrl, {
    logger: false,
  })
  const signInResponse = await client.action(
    makeFunctionReference('auth:signIn'),
    {
      calledBy: 'scripts/link-machine.js',
      params: {
        email: DEV_PASSWORD_EMAIL,
        flow: 'signIn',
        password: DEV_PASSWORD_VALUE,
      },
      provider: 'password',
    },
  )
  const signInResult = isRecord(signInResponse) ? signInResponse : {}
  const signInTokens = isRecord(signInResult.tokens)
    ? signInResult.tokens
    : null
  const token =
    signInTokens === null
      ? null
      : readOptionalStringField(signInTokens, 'token')

  if (typeof token !== 'string' || token.length === 0) {
    throw new LinkMachineError(
      'Local password auth did not return an access token.',
    )
  }

  client.setAuth(token)

  const requestQuery = makeFunctionReference(
    'connectedMachines:getMachineRegistrationRequestForBrowser',
  )
  const approveMutation = makeFunctionReference(
    'connectedMachines:approveMachineRegistrationRequest',
  )
  const requestStateResponse = await client.query(requestQuery, {
    requestId: args.requestId,
  })
  const requestState = isRecord(requestStateResponse)
    ? requestStateResponse
    : null

  if (readRequestStateLabel(requestState) === 'approved') {
    return { alreadyApproved: true }
  }

  if (readRequestStateLabel(requestState) !== 'pending') {
    throw new LinkMachineError(
      `Machine request is not approvable from local dev auth (state: ${readRequestStateLabel(
        requestState,
      )}).`,
    )
  }

  await client.mutation(approveMutation, {
    requestId: args.requestId,
  })

  const approvedStateResponse = await client.query(requestQuery, {
    requestId: args.requestId,
  })
  const approvedState = isRecord(approvedStateResponse)
    ? approvedStateResponse
    : null
  if (readRequestStateLabel(approvedState) !== 'approved') {
    throw new LinkMachineError(
      `Machine request did not transition to approved (state: ${readRequestStateLabel(
        approvedState,
      )}).`,
    )
  }

  return { alreadyApproved: false }
}

/**
 * @param {string} repoRoot
 * @returns {{
 *   ConvexHttpClient: ConvexHttpClientConstructor
 *   makeFunctionReference: (name: string) => unknown
 * }}
 */
function loadConvexHelpers(repoRoot) {
  const requireFromApp = createRequire(
    path.join(repoRoot, 'apps/noter/package.json'),
  )
  /** @type {unknown} */
  const convexBrowserModuleValue = requireFromApp('convex/browser')
  /** @type {unknown} */
  const convexServerModuleValue = requireFromApp('convex/server')
  /** @type {ConvexBrowserModule} */
  const convexBrowserModule = isRecord(convexBrowserModuleValue)
    ? convexBrowserModuleValue
    : {}
  /** @type {ConvexServerModule} */
  const convexServerModule = isRecord(convexServerModuleValue)
    ? convexServerModuleValue
    : {}
  const ConvexHttpClient = convexBrowserModule.ConvexHttpClient
  const makeFunctionReference = convexServerModule.makeFunctionReference

  if (typeof ConvexHttpClient !== 'function') {
    throw new LinkMachineError(
      'Failed to load ConvexHttpClient from apps/noter dependencies.',
    )
  }

  if (typeof makeFunctionReference !== 'function') {
    throw new LinkMachineError(
      'Failed to load makeFunctionReference from apps/noter dependencies.',
    )
  }

  return {
    ConvexHttpClient,
    makeFunctionReference,
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} requestState
 * @returns {string}
 */
function readRequestStateLabel(requestState) {
  return requestState === null || requestState === undefined
    ? 'unknown'
    : readOptionalStringField(requestState, 'kind') ?? 'unknown'
}

/**
 * @param {string} url
 * @param {NodeJS.Platform} [currentPlatform]
 * @returns {void}
 */
function openUrl(url, currentPlatform = process.platform) {
  const openCommand =
    currentPlatform === 'darwin'
      ? { args: [url], command: 'open' }
      : currentPlatform === 'win32'
        ? { args: ['/c', 'start', '', url], command: 'cmd' }
        : { args: [url], command: 'xdg-open' }

  const result = spawnSync(openCommand.command, openCommand.args, {
    stdio: 'ignore',
    windowsHide: true,
  })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new LinkMachineError(
      `${openCommand.command} exited with status ${result.status ?? 1}.`,
    )
  }
}

/**
 * @param {{
 *   repoRoot: string
 *   stateDirectory: string
 * }} args
 * @returns {void}
 */
function startRunCommand(args) {
  const result = spawnSync(
    'node',
    [...NOTER_SYNC_ARGS_PREFIX, 'run', '--state-dir', args.stateDirectory],
    {
      cwd: args.repoRoot,
      stdio: 'inherit',
    },
  )

  if (result.error) {
    throw result.error
  }

  if (result.signal) {
    process.exit(deriveSignalExitCode(result.signal) ?? 1)
  }

  process.exit(result.status ?? 0)
}

/**
 * @returns {boolean}
 */
function isMainModule() {
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')
}

/**
 * @param {unknown} error
 * @returns {void}
 */
function handleMainError(error) {
  const message =
    error instanceof Error && error.message.length > 0
      ? error.message
      : String(error)
  console.error(message)
  process.exit(1)
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function describeError(error) {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param {Record<string, unknown>} record
 * @param {string} key
 * @returns {string | null}
 */
function readOptionalStringField(record, key) {
  const value = record[key]
  return typeof value === 'string' ? value : null
}
