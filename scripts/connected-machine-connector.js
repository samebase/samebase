import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const CODEX_RPC_TIMEOUT_MS = 120_000
const CODEX_INIT_TIMEOUT_MS = 30_000
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000
const DEFAULT_SYNC_INTERVAL_MS = 60_000
const DEFAULT_THREAD_SOURCE_KINDS = ['cli', 'vscode', 'exec', 'appServer']
const CODEX_GLOBAL_STATE_FILENAME = '.codex-global-state.json'
const CONNECTOR_CAPABILITIES = ['catalog', 'threads']

/**
 * @typedef {{
 *   ConvexHttpClient: new (
 *     deploymentUrl: string,
 *     options?: { logger?: boolean }
 *   ) => {
 *     setAdminAuth(value: string): void
 *     mutation(functionReference: unknown, args: Record<string, unknown>): Promise<unknown>
 *   }
 * }} ConvexBrowserModule
 */

/**
 * @typedef {{
 *   makeFunctionReference(functionName: string): unknown
 * }} ConvexServerModule
 */

/**
 * @typedef {{
 *   appDir: string
 *   convexUrl: string
 *   deployKey: string
 *   userId: string
 *   machineId: string
 *   displayName: string
 *   hostname: string
 *   os: 'linux' | 'macos' | 'windows'
 *   connectorVersion: string
 *   workspaceRoot: string
 *   allowedRoots: string[]
 *   heartbeatIntervalMs: number
 *   syncIntervalMs: number
 *   once: boolean
 * }} ConnectorConfig
 */

/**
 * @typedef {{
 *   id: string
 *   name: string | null
 *   preview: string
 *   cwd: string
 *   project: {
 *     id: string
 *     label: string
 *     rootCwd: string
 *   }
 *   workspace: {
 *     label: string | null
 *     isProjectRoot: boolean
 *   }
 *   updatedAt: number
 *   gitInfo: {
 *     branch: string | null
 *     originUrl: string | null
 *     sha: string | null
 *   } | null
 *   path: string | null
 *   sourceKind: string
 * }} CodexThreadSummary
 */

/**
 * @typedef {{
 *   thread: CodexThreadSummary
 *   projectInfo: ThreadProjectInfo
 * }} ThreadProjectEntry
 */

/**
 * @typedef {{
 *   project: {
 *     id: string
 *     label: string
 *     rootCwd: string
 *   }
 *   workspace: {
 *     label: string | null
 *     isProjectRoot: boolean
 *   }
 *   resolvedFromGit: boolean
 * }} ThreadProjectInfo
 */

function printUsage() {
  console.log(`Usage: node scripts/connected-machine-connector.js [options]

Options:
  --once
  --user-id <convex-user-id>
  --machine-id <stable-machine-id>
  --display-name <label>
  --workspace-root <path>
  --allowed-root <path>      Repeat to expose more than one root
  --convex-url <url>
  --deploy-key <deploy-key>
  --heartbeat-interval-ms <ms>
  --sync-interval-ms <ms>
  --help`)
}

/**
 * @param {string} message
 * @returns {never}
 */
function exitWithError(message) {
  console.error(message)
  process.exit(1)
}

/**
 * @param {string[]} argv
 * @returns {{
 *   once: boolean
 *   userId: string | null
 *   machineId: string | null
 *   displayName: string | null
 *   workspaceRoot: string | null
 *   allowedRoots: string[]
 *   convexUrl: string | null
 *   deployKey: string | null
 *   heartbeatIntervalMs: number | null
 *   syncIntervalMs: number | null
 * }}
 */
function parseArgs(argv) {
  /** @type {{
   *   once: boolean
   *   userId: string | null
   *   machineId: string | null
   *   displayName: string | null
   *   workspaceRoot: string | null
   *   allowedRoots: string[]
   *   convexUrl: string | null
   *   deployKey: string | null
   *   heartbeatIntervalMs: number | null
   *   syncIntervalMs: number | null
   * }} */
  const args = {
    once: false,
    userId: null,
    machineId: null,
    displayName: null,
    workspaceRoot: null,
    allowedRoots: [],
    convexUrl: null,
    deployKey: null,
    heartbeatIntervalMs: null,
    syncIntervalMs: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--help') {
      printUsage()
      process.exit(0)
    }
    if (value === '--once') {
      args.once = true
      continue
    }
    if (!value.startsWith('--')) {
      exitWithError(`Unexpected argument: ${value}`)
    }

    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      exitWithError(`Missing value for ${value}`)
    }

    switch (value) {
      case '--user-id':
        args.userId = next
        break
      case '--machine-id':
        args.machineId = next
        break
      case '--display-name':
        args.displayName = next
        break
      case '--workspace-root':
        args.workspaceRoot = next
        break
      case '--allowed-root':
        args.allowedRoots.push(next)
        break
      case '--convex-url':
        args.convexUrl = next
        break
      case '--deploy-key':
        args.deployKey = next
        break
      case '--heartbeat-interval-ms':
        args.heartbeatIntervalMs = readPositiveInteger(next, value)
        break
      case '--sync-interval-ms':
        args.syncIntervalMs = readPositiveInteger(next, value)
        break
      default:
        exitWithError(`Unknown option: ${value}`)
    }

    index += 1
  }

  return args
}

/**
 * @param {string} value
 * @param {string} optionName
 * @returns {number}
 */
function readPositiveInteger(value, optionName) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    exitWithError(`${optionName} must be a positive integer`)
  }
  return parsed
}

/**
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  const contents = fs.readFileSync(filePath, 'utf8')
  /** @type {Record<string, string>} */
  const env = {}

  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const [key, ...rest] = trimmed.split('=')
    if (!key) {
      continue
    }

    env[key] = rest.join('=')
  }

  return env
}

/**
 * @param {string | null | undefined} value
 * @param {string} name
 * @returns {string}
 */
function readRequiredSetting(value, name) {
  const trimmed = value?.trim()
  if (!trimmed) {
    exitWithError(`Missing required setting: ${name}`)
  }
  return trimmed
}

/**
 * @param {NodeJS.Platform} platform
 * @returns {'linux' | 'macos' | 'windows'}
 */
function normalizeMachineOs(platform) {
  if (platform === 'darwin') {
    return 'macos'
  }
  if (platform === 'win32') {
    return 'windows'
  }
  return 'linux'
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizePathForDisplay(value) {
  return value.split('\\').join('/')
}

/**
 * @param {string} value
 * @returns {string}
 */
function slugify(value) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized.length > 0 ? normalized : 'machine'
}

/**
 * @param {string[]} cliRoots
 * @param {string | undefined} envRoots
 * @param {string} workspaceRoot
 * @returns {string[]}
 */
function readAllowedRoots(cliRoots, envRoots, workspaceRoot) {
  const envValues =
    typeof envRoots === 'string'
      ? envRoots
          .split(',')
          .map(value => value.trim())
          .filter(value => value.length > 0)
      : []
  const allRoots =
    cliRoots.length > 0
      ? cliRoots
      : envValues.length > 0
        ? envValues
        : [workspaceRoot]

  return Array.from(
    new Set(
      allRoots.map(root =>
        normalizePathForDisplay(path.resolve(workspaceRoot, root)),
      ),
    ),
  )
}

/**
 * @param {string} repoRoot
 * @returns {string}
 */
function readConnectorVersion(repoRoot) {
  const packageJsonPath = path.join(repoRoot, 'package.json')
  const packageJson = /** @type {unknown} */ (
    JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  )
  const packageJsonRecord = asRecord(packageJson)
  const version = readString(packageJsonRecord?.version)
  if (!version) {
    return 'noter-connected-machine'
  }

  return `noter@${version}`
}

/**
 * @param {string} repoRoot
 * @returns {ConnectorConfig}
 */
function readConnectorConfig(repoRoot) {
  const args = parseArgs(process.argv.slice(2))
  const appDir = path.join(repoRoot, 'apps', 'noter')
  const envFile = path.join(appDir, '.env.local')
  const fileEnv = readEnvFile(envFile)
  const env = { ...fileEnv, ...process.env }
  const workspaceRoot = path.resolve(
    args.workspaceRoot ??
      env.NOTER_CONNECTED_MACHINE_WORKSPACE_ROOT ??
      process.cwd(),
  )
  const machineOs = normalizeMachineOs(process.platform)
  const hostname = os.hostname()

  return {
    appDir,
    convexUrl: readRequiredSetting(
      args.convexUrl ?? env.CONVEX_URL ?? env.VITE_CONVEX_URL,
      'CONVEX_URL or VITE_CONVEX_URL',
    ),
    deployKey: readRequiredSetting(
      args.deployKey ?? env.CONVEX_DEPLOY_KEY,
      'CONVEX_DEPLOY_KEY',
    ),
    userId: readRequiredSetting(
      args.userId ?? env.NOTER_CONNECTED_MACHINE_USER_ID,
      'NOTER_CONNECTED_MACHINE_USER_ID',
    ),
    machineId: readRequiredSetting(
      args.machineId ??
        env.NOTER_CONNECTED_MACHINE_ID ??
        `${slugify(hostname)}-${machineOs}`,
      'NOTER_CONNECTED_MACHINE_ID',
    ),
    displayName:
      args.displayName ?? env.NOTER_CONNECTED_MACHINE_DISPLAY_NAME ?? hostname,
    hostname,
    os: machineOs,
    connectorVersion: readConnectorVersion(repoRoot),
    workspaceRoot,
    allowedRoots: readAllowedRoots(
      args.allowedRoots,
      env.NOTER_CONNECTED_MACHINE_ALLOWED_ROOTS,
      workspaceRoot,
    ),
    heartbeatIntervalMs:
      args.heartbeatIntervalMs ??
      readOptionalPositiveInteger(
        env.NOTER_CONNECTED_MACHINE_HEARTBEAT_INTERVAL_MS,
      ) ??
      DEFAULT_HEARTBEAT_INTERVAL_MS,
    syncIntervalMs:
      args.syncIntervalMs ??
      readOptionalPositiveInteger(
        env.NOTER_CONNECTED_MACHINE_SYNC_INTERVAL_MS,
      ) ??
      DEFAULT_SYNC_INTERVAL_MS,
    once: args.once,
  }
}

/**
 * @param {string | undefined} value
 * @returns {number | null}
 */
function readOptionalPositiveInteger(value) {
  if (!value) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    exitWithError(`Expected a positive integer but received: ${value}`)
  }
  return parsed
}

/**
 * @param {unknown} candidate
 * @returns {candidate is ConvexBrowserModule}
 */
function isConvexBrowserModule(candidate) {
  return Boolean(
    candidate &&
      typeof candidate === 'object' &&
      'ConvexHttpClient' in candidate &&
      typeof candidate.ConvexHttpClient === 'function',
  )
}

/**
 * @param {unknown} candidate
 * @returns {candidate is ConvexServerModule}
 */
function isConvexServerModule(candidate) {
  return Boolean(
    candidate &&
      typeof candidate === 'object' &&
      'makeFunctionReference' in candidate &&
      typeof candidate.makeFunctionReference === 'function',
  )
}

/**
 * @param {ConnectorConfig} config
 * @returns {{
 *   heartbeat(status: 'online' | 'offline'): Promise<void>
 *   replaceThreadSummaries(
 *     threads: Array<{
 *       provider: 'codex'
 *       providerThreadId: string
 *       projectRoot: string
 *       projectLabel: string
 *       workspaceLabel: string
 *       branch: string
 *       title: string
 *       preview: string
 *       updatedAt: number
 *       loaded: boolean
 *       pinned: boolean
 *       archived: boolean
 *       sourceKind: string
 *     }>
 *   ): Promise<void>
 * }}
 */
function createConvexConnector(config) {
  const requireFromApp = createRequire(path.join(config.appDir, 'package.json'))
  /** @type {unknown} */
  const convexBrowserModule = requireFromApp('convex/browser')
  /** @type {unknown} */
  const convexServerModule = requireFromApp('convex/server')

  if (!isConvexBrowserModule(convexBrowserModule)) {
    exitWithError('Failed to load Convex browser client from apps/noter.')
  }
  if (!isConvexServerModule(convexServerModule)) {
    exitWithError('Failed to load Convex server helpers from apps/noter.')
  }

  const client = new convexBrowserModule.ConvexHttpClient(config.convexUrl, {
    logger: false,
  })
  client.setAdminAuth(config.deployKey)

  const heartbeatReference = convexServerModule.makeFunctionReference(
    'connectedMachines:upsertHeartbeatFromConnector',
  )
  const replaceThreadSummariesReference =
    convexServerModule.makeFunctionReference(
      'connectedMachines:replaceThreadSummariesFromConnector',
    )

  return {
    async heartbeat(status) {
      await client.mutation(heartbeatReference, {
        userId: config.userId,
        machineId: config.machineId,
        displayName: config.displayName,
        hostname: config.hostname,
        os: config.os,
        status,
        connectorVersion: config.connectorVersion,
        capabilities: CONNECTOR_CAPABILITIES,
        allowedRoots: config.allowedRoots,
      })
    },
    async replaceThreadSummaries(threads) {
      await client.mutation(replaceThreadSummariesReference, {
        userId: config.userId,
        machineId: config.machineId,
        threads,
      })
    },
  }
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
function asRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return Object.fromEntries(Object.entries(value))
}

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
function readString(value) {
  return typeof value === 'string' ? value : undefined
}

/**
 * @param {unknown} value
 * @returns {number | undefined}
 */
function readNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function readStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter(entry => typeof entry === 'string')
}

/**
 * @param {string} cwd
 * @returns {string}
 */
function readPathLeaf(cwd) {
  const segments = normalizePathForDisplay(cwd)
    .split('/')
    .filter(segment => segment.length > 0)
  return segments[segments.length - 1] ?? cwd
}

/**
 * @param {string} cwd
 * @returns {string | null}
 */
function readCodexWorktreeId(cwd) {
  const match = normalizePathForDisplay(cwd).match(/\/worktrees\/([^/]+)\//)
  return match?.[1] ?? null
}

/**
 * Use the shared git common dir as the project identity so sibling worktrees
 * collapse into one project while keeping their individual cwd labels.
 *
 * @param {{
 *   cwd: string
 *   projectRoot: string
 *   resolvedFromGit: boolean
 * }} args
 * @returns {ThreadProjectInfo}
 */
function buildThreadProjectInfo(args) {
  const normalizedCwd = normalizePathForDisplay(path.resolve(args.cwd))
  const normalizedProjectRoot = normalizePathForDisplay(
    path.resolve(args.projectRoot),
  )
  const isProjectRoot = normalizedCwd === normalizedProjectRoot

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
    }
  }

  const codexWorktreeId = readCodexWorktreeId(normalizedCwd)
  const cwdLeaf = readPathLeaf(normalizedCwd)
  const projectRootLeaf = readPathLeaf(normalizedProjectRoot)
  const cwdParentLeaf = readPathLeaf(path.dirname(normalizedCwd))
  const projectParentLeaf = readPathLeaf(path.dirname(normalizedProjectRoot))
  const workspaceLabel =
    codexWorktreeId ??
    (cwdLeaf !== projectRootLeaf ? cwdLeaf : null) ??
    (cwdParentLeaf !== projectParentLeaf ? cwdParentLeaf : null) ??
    cwdLeaf

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
  }
}

/**
 * @param {string} cwd
 * @returns {ThreadProjectInfo}
 */
function buildFallbackThreadProjectInfo(cwd) {
  return buildThreadProjectInfo({
    cwd,
    projectRoot: cwd,
    resolvedFromGit: false,
  })
}

/** @type {Map<string, Promise<ThreadProjectInfo>>} */
const threadProjectInfoByCwd = new Map()

/**
 * @param {string} cwd
 * @returns {Promise<ThreadProjectInfo>}
 */
async function readThreadProjectInfo(cwd) {
  const cached = threadProjectInfoByCwd.get(cwd)
  if (cached) {
    return cached
  }

  const promise = (async () => {
    const fallback = buildFallbackThreadProjectInfo(cwd)

    try {
      const { stdout } = await execFileAsync(
        'git',
        [
          '-C',
          cwd,
          'rev-parse',
          '--path-format=absolute',
          '--show-toplevel',
          '--git-common-dir',
        ],
        {
          timeout: 5_000,
          maxBuffer: 64 * 1024,
        },
      )
      const [topLevelLine, commonDirLine] = stdout
        .trim()
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0)

      if (!topLevelLine || !commonDirLine) {
        return fallback
      }

      return buildThreadProjectInfo({
        cwd,
        projectRoot: path.dirname(commonDirLine),
        resolvedFromGit: true,
      })
    } catch {
      return fallback
    }
  })()

  threadProjectInfoByCwd.set(cwd, promise)
  return promise
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function readPinnedThreadIds(value) {
  return Array.from(new Set(readStringArray(value)))
}

/**
 * @returns {string}
 */
function resolveCodexHomeDirectory() {
  const configuredHome = process.env.CODEX_HOME?.trim()
  if (configuredHome) {
    return configuredHome
  }

  return path.join(os.homedir(), '.codex')
}

/**
 * @returns {Promise<string[]>}
 */
async function readDesktopPinnedThreadIds() {
  const globalStatePath = path.join(
    resolveCodexHomeDirectory(),
    CODEX_GLOBAL_STATE_FILENAME,
  )

  try {
    const rawGlobalState = await readFile(globalStatePath, 'utf8')
    const parsedGlobalState = asRecord(JSON.parse(rawGlobalState))
    return readPinnedThreadIds(parsedGlobalState?.['pinned-thread-ids'])
  } catch {
    return []
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function describeThreadSource(value) {
  if (typeof value === 'string') {
    return value
  }

  const record = asRecord(value)
  if (!record) {
    return 'unknown'
  }

  const subAgent = record.subAgent
  if (typeof subAgent === 'string') {
    return `subAgent:${subAgent}`
  }

  const subAgentRecord = asRecord(subAgent)
  if (subAgentRecord) {
    const nestedKey = Object.keys(subAgentRecord)[0]
    if (nestedKey) {
      return `subAgent:${nestedKey}`
    }
  }

  const key = Object.keys(record)[0]
  return key || 'unknown'
}

/**
 * @param {unknown} value
 * @returns {CodexThreadSummary | null}
 */
function normalizeThread(value) {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const id = readString(record.id)
  const preview = readString(record.preview)
  const cwd = readString(record.cwd)
  const updatedAt = readNumber(record.updatedAt)
  const createdAt = readNumber(record.createdAt)
  if (!id || preview === undefined || !cwd || updatedAt === undefined) {
    return null
  }
  if (createdAt === undefined) {
    return null
  }

  const gitInfo = asRecord(record.gitInfo)
  const fallbackProjectInfo = buildFallbackThreadProjectInfo(cwd)

  return {
    id,
    name: readString(record.name) ?? null,
    preview,
    cwd,
    project: fallbackProjectInfo.project,
    workspace: fallbackProjectInfo.workspace,
    updatedAt,
    gitInfo: gitInfo
      ? {
          branch: readString(gitInfo.branch) ?? null,
          originUrl: readString(gitInfo.originUrl) ?? null,
          sha: readString(gitInfo.sha) ?? null,
        }
      : null,
    path:
      typeof record.path === 'string'
        ? normalizePathForDisplay(record.path)
        : null,
    sourceKind: describeThreadSource(record.source),
  }
}

/**
 * @param {CodexThreadSummary} thread
 * @param {ThreadProjectInfo} projectInfo
 * @returns {CodexThreadSummary}
 */
function applyThreadProjectInfo(thread, projectInfo) {
  return {
    ...thread,
    project: projectInfo.project,
    workspace: projectInfo.workspace,
  }
}

/**
 * @param {CodexThreadSummary} thread
 * @returns {string | null}
 */
function readThreadProjectAliasKey(thread) {
  const originUrl = thread.gitInfo?.originUrl
  if (!originUrl) {
    return null
  }

  return `${originUrl}::${readPathLeaf(thread.cwd)}`
}

/**
 * Some older Codex sessions point at worktree paths that no longer exist, so
 * Git cannot resolve their common dir directly. When the same repo still has a
 * live thread elsewhere on disk, reuse that canonical project root and keep
 * only the dead worktree label as per-thread metadata.
 *
 * @param {ThreadProjectEntry[]} entries
 * @returns {CodexThreadSummary[]}
 */
function alignFallbackThreadProjects(entries) {
  /** @type {Map<string, ThreadProjectInfo>} */
  const canonicalProjectInfoByAliasKey = new Map()

  for (const entry of entries) {
    if (!entry.projectInfo.resolvedFromGit) {
      continue
    }

    const aliasKey = readThreadProjectAliasKey(entry.thread)
    if (!aliasKey || canonicalProjectInfoByAliasKey.has(aliasKey)) {
      continue
    }

    canonicalProjectInfoByAliasKey.set(aliasKey, entry.projectInfo)
  }

  return entries.map(entry => {
    if (entry.projectInfo.resolvedFromGit) {
      return applyThreadProjectInfo(entry.thread, entry.projectInfo)
    }

    const aliasKey = readThreadProjectAliasKey(entry.thread)
    if (!aliasKey) {
      return applyThreadProjectInfo(entry.thread, entry.projectInfo)
    }

    const canonicalProjectInfo = canonicalProjectInfoByAliasKey.get(aliasKey)
    if (!canonicalProjectInfo) {
      return applyThreadProjectInfo(entry.thread, entry.projectInfo)
    }

    return applyThreadProjectInfo(
      entry.thread,
      buildThreadProjectInfo({
        cwd: entry.thread.cwd,
        projectRoot: canonicalProjectInfo.project.rootCwd,
        resolvedFromGit: false,
      }),
    )
  })
}

/**
 * @param {string | null} threadPath
 * @returns {boolean}
 */
function codexThreadPathIsArchived(threadPath) {
  if (threadPath === null) {
    return false
  }

  return normalizePathForDisplay(threadPath).includes('/archived_sessions/')
}

class CodexAppServerClient {
  /**
   * @param {string} workspaceRoot
   */
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot
    this.process = null
    this.startPromise = null
    this.initialized = false
    this.stdoutBuffer = ''
    this.nextRequestId = 1
    /** @type {Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void, timeoutId: NodeJS.Timeout }>} */
    this.pendingRequests = new Map()
  }

  isRunning() {
    return Boolean(
      this.process && !this.process.killed && this.process.exitCode === null,
    )
  }

  async ensureCodexBinary() {
    const { stdout } = await execFileAsync('codex', ['--version'], {
      cwd: this.workspaceRoot,
      timeout: 10_000,
    })
    const version = stdout.trim()
    if (!version) {
      throw new Error('codex --version returned an empty response')
    }
    return version
  }

  /**
   * @param {string} message
   * @returns {void}
   */
  rejectPendingRequests(message) {
    for (const [requestId, pendingRequest] of this.pendingRequests.entries()) {
      clearTimeout(pendingRequest.timeoutId)
      pendingRequest.reject(new Error(message))
      this.pendingRequests.delete(requestId)
    }
  }

  /**
   * @param {string} line
   * @returns {void}
   */
  handleLine(line) {
    const trimmed = line.trim()
    if (!trimmed) {
      return
    }

    /** @type {unknown} */
    let message
    try {
      message = JSON.parse(trimmed)
    } catch (error) {
      console.warn(
        `Ignoring invalid Codex app-server payload: ${String(error)}`,
      )
      return
    }

    const record = asRecord(message)
    if (!record || typeof record.id !== 'number') {
      return
    }

    const pendingRequest = this.pendingRequests.get(record.id)
    if (!pendingRequest) {
      return
    }

    clearTimeout(pendingRequest.timeoutId)
    this.pendingRequests.delete(record.id)

    if ('error' in record) {
      const errorMessage =
        readString(asRecord(record.error)?.message) ??
        'Codex RPC request failed.'
      pendingRequest.reject(new Error(errorMessage))
      return
    }

    pendingRequest.resolve(record.result)
  }

  /**
   * @param {Record<string, unknown>} message
   * @returns {void}
   */
  writeMessage(message) {
    if (!this.process || !this.isRunning()) {
      throw new Error('Codex app-server is not running')
    }

    this.process.stdin.write(`${JSON.stringify(message)}\n`)
  }

  /**
   * @param {{
   *   method: string
   *   params?: Record<string, unknown>
   *   timeoutMs?: number
   * }} args
   * @returns {Promise<unknown>}
   */
  async sendRequestNoEnsure({
    method,
    params = {},
    timeoutMs = CODEX_RPC_TIMEOUT_MS,
  }) {
    if (!this.isRunning()) {
      throw new Error('Codex app-server is not running')
    }

    const requestId = this.nextRequestId++

    /** @type {Promise<unknown>} */
    const responsePromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error(`Codex RPC timeout for method: ${method}`))
      }, timeoutMs)

      this.pendingRequests.set(requestId, { resolve, reject, timeoutId })

      try {
        this.writeMessage({
          id: requestId,
          method,
          params,
        })
      } catch (error) {
        clearTimeout(timeoutId)
        this.pendingRequests.delete(requestId)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })

    return await responsePromise
  }

  /**
   * @param {string} method
   * @param {Record<string, unknown>} params
   * @returns {void}
   */
  sendNotificationNoEnsure(method, params) {
    this.writeMessage({ method, params })
  }

  async ensureRuntime() {
    if (this.initialized && this.isRunning()) {
      return
    }

    if (this.startPromise) {
      await this.startPromise
      return
    }

    this.startPromise = (async () => {
      await this.ensureCodexBinary()
      const processHandle = spawn(
        'codex',
        ['app-server', '--listen', 'stdio://'],
        {
          cwd: this.workspaceRoot,
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )

      this.process = processHandle
      this.initialized = false
      this.stdoutBuffer = ''

      processHandle.stdout.on(
        'data',
        /** @param {Buffer | string} chunk */ chunk => {
          this.stdoutBuffer += chunk.toString()
          let newlineIndex = this.stdoutBuffer.indexOf('\n')
          while (newlineIndex !== -1) {
            const line = this.stdoutBuffer.slice(0, newlineIndex)
            this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1)
            this.handleLine(line)
            newlineIndex = this.stdoutBuffer.indexOf('\n')
          }
        },
      )

      processHandle.stderr.on(
        'data',
        /** @param {Buffer | string} chunk */ chunk => {
          const message = chunk.toString().trim()
          if (message) {
            console.warn(`[codex] ${message}`)
          }
        },
      )

      processHandle.on('exit', () => {
        this.initialized = false
        this.process = null
        this.rejectPendingRequests('Codex app-server process ended')
      })

      try {
        await this.sendRequestNoEnsure({
          method: 'initialize',
          params: {
            clientInfo: {
              name: 'noter_connected_machine_connector',
              title: 'Noter Connected Machine Connector',
              version: '0.1.0',
            },
          },
          timeoutMs: CODEX_INIT_TIMEOUT_MS,
        })
        this.sendNotificationNoEnsure('initialized', {})
        this.initialized = true
      } catch (error) {
        await this.stop()
        throw error
      }
    })()

    try {
      await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  async stop() {
    if (!this.process || this.process.exitCode !== null) {
      return
    }

    const processToStop = this.process
    await new Promise(resolve => {
      let finished = false
      const finish = () => {
        if (finished) {
          return
        }
        finished = true
        resolve(undefined)
      }

      const timeoutId = setTimeout(() => {
        if (processToStop.exitCode === null) {
          processToStop.kill('SIGKILL')
        }
        finish()
      }, 5_000)

      processToStop.once('exit', () => {
        clearTimeout(timeoutId)
        finish()
      })

      processToStop.kill('SIGTERM')
    })
  }

  /**
   * @param {{ archived: boolean, cursor: string | null }} args
   * @returns {Promise<unknown>}
   */
  async listThreads({ archived, cursor }) {
    await this.ensureRuntime()
    /** @type {Record<string, unknown>} */
    const params = {
      archived,
      sourceKinds: DEFAULT_THREAD_SOURCE_KINDS,
      limit: 100,
    }
    if (cursor) {
      params.cursor = cursor
    }
    return await this.sendRequestNoEnsure({
      method: 'thread/list',
      params,
    })
  }

  /**
   * @param {string | null} cursor
   * @returns {Promise<unknown>}
   */
  async listLoadedThreads(cursor) {
    await this.ensureRuntime()
    /** @type {Record<string, unknown>} */
    const params = {
      limit: 100,
    }
    if (cursor) {
      params.cursor = cursor
    }
    return await this.sendRequestNoEnsure({
      method: 'thread/loaded/list',
      params,
    })
  }

  /**
   * @param {string} threadId
   * @returns {Promise<unknown>}
   */
  async readThreadSummary(threadId) {
    await this.ensureRuntime()
    return await this.sendRequestNoEnsure({
      method: 'thread/read',
      params: {
        threadId,
        includeTurns: false,
      },
    })
  }
}

/**
 * @param {CodexAppServerClient} client
 * @param {boolean} archived
 * @returns {Promise<CodexThreadSummary[]>}
 */
async function readThreadInventory(client, archived) {
  /** @type {ThreadProjectEntry[]} */
  const entries = []
  /** @type {string | null} */
  let cursor = null

  do {
    const result = await client.listThreads({ archived, cursor })
    const record = asRecord(result)
    /** @type {CodexThreadSummary[]} */
    const threads = Array.isArray(record?.data)
      ? record.data
          .map(thread => normalizeThread(thread))
          .filter(thread => thread !== null)
      : []

    const nextEntries = await Promise.all(
      threads.map(async thread => ({
        thread,
        projectInfo: await readThreadProjectInfo(thread.cwd),
      })),
    )
    entries.push(...nextEntries)
    cursor = readString(record?.nextCursor) ?? null
  } while (cursor)

  return alignFallbackThreadProjects(entries)
}

/**
 * @param {CodexAppServerClient} client
 * @returns {Promise<Set<string>>}
 */
async function readLoadedThreadIds(client) {
  /** @type {Set<string>} */
  const loadedThreadIds = new Set()
  /** @type {string | null} */
  let cursor = null

  do {
    const result = await client.listLoadedThreads(cursor)
    const record = asRecord(result)
    for (const threadId of readStringArray(record?.data)) {
      loadedThreadIds.add(threadId)
    }
    cursor = readString(record?.nextCursor) ?? null
  } while (cursor)

  return loadedThreadIds
}

/**
 * @param {CodexAppServerClient} client
 * @param {string} threadId
 * @returns {Promise<CodexThreadSummary | null>}
 */
async function readPinnedThreadSummary(client, threadId) {
  try {
    const result = await client.readThreadSummary(threadId)
    const normalizedThread = normalizeThread(asRecord(result)?.thread)
    if (normalizedThread === null) {
      return null
    }

    return applyThreadProjectInfo(
      normalizedThread,
      await readThreadProjectInfo(normalizedThread.cwd),
    )
  } catch {
    return null
  }
}

/**
 * @param {CodexAppServerClient} client
 * @returns {Promise<Array<{
 *   provider: 'codex'
 *   providerThreadId: string
 *   projectRoot: string
 *   projectLabel: string
 *   workspaceLabel: string
 *   branch: string
 *   title: string
 *   preview: string
 *   updatedAt: number
 *   loaded: boolean
 *   pinned: boolean
 *   archived: boolean
 *   sourceKind: string
 * }>>}
 */
async function readMachineThreadSummaries(client) {
  const [pinnedThreadIds, loadedThreadIds, activeThreads, archivedThreads] =
    await Promise.all([
      readDesktopPinnedThreadIds(),
      readLoadedThreadIds(client),
      readThreadInventory(client, false),
      readThreadInventory(client, true),
    ])

  /** @type {Map<string, CodexThreadSummary>} */
  const threadsById = new Map()
  for (const thread of [...activeThreads, ...archivedThreads]) {
    threadsById.set(thread.id, thread)
  }

  const missingPinnedThreadIds = pinnedThreadIds.filter(
    threadId => !threadsById.has(threadId),
  )
  if (missingPinnedThreadIds.length > 0) {
    const missingPinnedThreads = await Promise.all(
      missingPinnedThreadIds.map(threadId =>
        readPinnedThreadSummary(client, threadId),
      ),
    )
    for (const thread of missingPinnedThreads) {
      if (thread) {
        threadsById.set(thread.id, thread)
      }
    }
  }

  return Array.from(threadsById.values())
    .map(thread => ({
      provider: /** @type {'codex'} */ ('codex'),
      providerThreadId: thread.id,
      projectRoot: thread.project.rootCwd,
      projectLabel: thread.project.label,
      workspaceLabel: thread.workspace.label ?? thread.project.label,
      branch: thread.gitInfo?.branch ?? '',
      title: thread.name?.trim() || thread.preview,
      preview: thread.preview,
      updatedAt: thread.updatedAt,
      loaded: loadedThreadIds.has(thread.id),
      pinned: pinnedThreadIds.includes(thread.id),
      archived: codexThreadPathIsArchived(thread.path),
      sourceKind: thread.sourceKind,
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * @param {ConnectorConfig} config
 * @param {{ heartbeat(status: 'online' | 'offline'): Promise<void>, replaceThreadSummaries(threads: Array<Record<string, unknown>>): Promise<void> }} convexConnector
 * @param {CodexAppServerClient} codexClient
 * @returns {Promise<void>}
 */
async function runConnectorLoop(config, convexConnector, codexClient) {
  /** @type {() => void} */
  let resolveStop = () => {}
  /** @type {Promise<'stop'>} */
  const stopPromise = new Promise(resolve => {
    resolveStop = () => resolve('stop')
  })

  const requestStop = () => {
    resolveStop()
  }

  process.once('SIGINT', requestStop)
  process.once('SIGTERM', requestStop)

  try {
    let nextHeartbeatAt = 0
    let nextSyncAt = 0

    for (;;) {
      const now = Date.now()

      try {
        if (now >= nextHeartbeatAt) {
          await convexConnector.heartbeat('online')
          nextHeartbeatAt = Date.now() + config.heartbeatIntervalMs
          console.log(
            `[connector] heartbeat ${config.machineId} (${config.displayName})`,
          )
        }

        if (now >= nextSyncAt) {
          const threadSummaries = await readMachineThreadSummaries(codexClient)
          await convexConnector.replaceThreadSummaries(threadSummaries)
          nextSyncAt = Date.now() + config.syncIntervalMs
          console.log(
            `[connector] synced ${threadSummaries.length} thread summaries`,
          )
        }
      } catch (error) {
        if (config.once) {
          throw error
        }

        console.error(
          `[connector] cycle failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
        await sleep(5_000)
        continue
      }

      if (config.once) {
        break
      }

      const nextWakeAt = Math.min(nextHeartbeatAt, nextSyncAt)
      const waitMs = Math.max(250, nextWakeAt - Date.now())
      const wakeReason = await Promise.race([
        sleep(waitMs).then(() => 'tick'),
        stopPromise,
      ])
      if (wakeReason === 'stop') {
        break
      }
    }
  } finally {
    try {
      await convexConnector.heartbeat('offline')
    } catch (error) {
      console.error(
        `[connector] failed to publish offline heartbeat: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    await codexClient.stop()
  }
}

async function main() {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  )
  const config = readConnectorConfig(repoRoot)
  const convexConnector = createConvexConnector(config)
  const codexClient = new CodexAppServerClient(config.workspaceRoot)

  console.log(
    `[connector] starting ${config.machineId} for user ${config.userId} in ${config.workspaceRoot}`,
  )

  await runConnectorLoop(config, convexConnector, codexClient)
}

await main().catch(error => {
  console.error(
    error instanceof Error ? error.stack ?? error.message : String(error),
  )
  process.exit(1)
})
