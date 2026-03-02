#!/usr/bin/env node
// @ts-check
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { WORKTREE_ENV_ALLOWLIST } from './worktree-env-allowlist.js'

/**
 * @typedef {'dev' | 'prod' | 'preview'} DeploymentType
 *
 * @typedef {{
 *   sourceEnv: string | null
 *   targetEnv: string | null
 *   dryRun: boolean
 *   showHelp: boolean
 * }} SyncOptions
 *
 * @typedef {{
 *   path: string
 *   vars: Record<string, string>
 * }} EnvFile
 *
 * @typedef {{
 *   type: DeploymentType
 *   name: string
 *   raw: string
 * }} Deployment
 *
 * @typedef {{
 *   name: string
 *   value: string
 * }} EnvEntry
 *
 * @typedef {{
 *   worktree: string
 *   branch: string | null
 * }} WorktreeInfo
 */

const HELP_TEXT = `Usage: scripts/convex-sync-dev-env.js [options]

Build a local seed env file by pulling allowlisted values from the cloud dev deployment.

Options:
  --source-env <path>     Path to a dev env file (contains CONVEX_DEPLOYMENT=dev:*).
                          If omitted, the script scans git worktrees and picks main.
  --target-env <path>     Output env file path.
                          Default: apps/noter/.env.anon-seed.local
  --dry-run               Show what would be written.
  -h, --help              Show this help message.
`

const options = parseArgs(process.argv.slice(2))
if (options.showHelp) {
  console.log(HELP_TEXT)
  process.exit(0)
}

const repoRoot = resolveRepoRoot()
const appDir = path.join(repoRoot, 'apps', 'noter')
const targetEnvPath = path.resolve(
  options.targetEnv ?? path.join(appDir, '.env.anon-seed.local'),
)
const localAnonEnvPath = path.join(appDir, '.env.local')

const localAnonEnv = readEnvFile(localAnonEnvPath)
if (!localAnonEnv) {
  exitWithError(
    `Local env file not found: ${localAnonEnvPath}\n` +
      'Run anonymous Convex dev once before generating the seed env.',
  )
}

const localAnonDeployment = parseDeploymentFromEnv(localAnonEnv.vars)
if (!localAnonDeployment) {
  exitWithError(
    `Local env file does not contain a usable CONVEX_DEPLOYMENT: ${localAnonEnvPath}`,
  )
}
if (!isAnonymousLikeDeploymentName(localAnonDeployment.name)) {
  exitWithError(
    `Local deployment must be anonymous/local (got ${localAnonDeployment.raw}).`,
  )
}

const sourceEnvPath = options.sourceEnv
  ? path.resolve(options.sourceEnv)
  : findSourceEnvFile(repoRoot)

if (!sourceEnvPath) {
  if (options.dryRun) {
    console.log(`Would write 1 seed var to ${targetEnvPath}`)
    console.log('- CONVEX_DEPLOYMENT')
    process.exit(0)
  }
  writeEnvFile(targetEnvPath, [
    { name: 'CONVEX_DEPLOYMENT', value: localAnonDeployment.raw },
  ])
  console.log(
    'No cloud dev env source found. Wrote seed env file with local CONVEX_DEPLOYMENT only.',
  )
  process.exit(0)
}

const sourceEnv = readEnvFile(sourceEnvPath)
if (!sourceEnv) {
  exitWithError(`Source env file not found: ${sourceEnvPath}`)
}

const sourceDeployment = parseDeploymentFromEnv(sourceEnv.vars)
if (!sourceDeployment) {
  exitWithError(
    `Source env does not contain a usable CONVEX_DEPLOYMENT: ${sourceEnvPath}`,
  )
}
if (sourceDeployment.type !== 'dev') {
  exitWithError(`Source deployment must be dev (got ${sourceDeployment.raw}).`)
}
if (isAnonymousLikeDeploymentName(sourceDeployment.name)) {
  exitWithError(
    `Source deployment is anonymous (${sourceDeployment.raw}). ` +
      'Use a cloud dev deployment as source.',
  )
}

const entries = listDeploymentEnvVars({
  appDir,
  envFile: sourceEnvPath,
}).filter(({ name }) => WORKTREE_ENV_ALLOWLIST.has(name))

const sorted = entries.slice().sort((a, b) => a.name.localeCompare(b.name))

if (options.dryRun) {
  console.log(
    `Would write ${sorted.length + 1} seed var${sorted.length + 1 === 1 ? '' : 's'} ` +
      `from ${sourceDeployment.raw} to ${targetEnvPath}`,
  )
  console.log('- CONVEX_DEPLOYMENT')
  for (const { name } of sorted) {
    console.log(`- ${name}`)
  }
  process.exit(0)
}

writeEnvFile(targetEnvPath, [
  { name: 'CONVEX_DEPLOYMENT', value: localAnonDeployment.raw },
  ...sorted,
])
console.log(
  `Wrote ${sorted.length + 1} seed var${sorted.length + 1 === 1 ? '' : 's'} ` +
    `to ${targetEnvPath}`,
)

/**
 * @param {string[]} args
 * @returns {SyncOptions}
 */
function parseArgs(args) {
  /** @type {SyncOptions} */
  const result = {
    sourceEnv: null,
    targetEnv: null,
    dryRun: false,
    showHelp: false,
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--source-env') {
      const value = args[i + 1]
      if (!value || value.startsWith('-')) {
        exitWithError(`Missing value for ${arg}\n\n${HELP_TEXT}`)
      }
      result.sourceEnv = value
      i += 1
      continue
    }
    if (arg === '--target-env') {
      const value = args[i + 1]
      if (!value || value.startsWith('-')) {
        exitWithError(`Missing value for ${arg}\n\n${HELP_TEXT}`)
      }
      result.targetEnv = value
      i += 1
      continue
    }
    if (arg === '--dry-run') {
      result.dryRun = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      result.showHelp = true
      continue
    }
    exitWithError(`Unknown argument: ${arg}\n\n${HELP_TEXT}`)
  }

  return result
}

/** @returns {string} */
function resolveRepoRoot() {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  })
  if (result.status === 0) {
    return (result.stdout || '').trim() || process.cwd()
  }
  return process.cwd()
}

/**
 * @param {string} filePath
 * @returns {EnvFile | null}
 */
function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null
  }
  const contents = fs.readFileSync(filePath, 'utf8')
  /** @type {Record<string, string>} */
  const vars = {}
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) {
      continue
    }
    const key = trimmed.slice(0, eqIndex).trim()
    const value = stripQuotes(trimmed.slice(eqIndex + 1).trim())
    vars[key] = value
  }
  return { path: filePath, vars }
}

/**
 * @param {string} value
 * @returns {string}
 */
function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

/**
 * @param {Record<string, string>} vars
 * @returns {Deployment | null}
 */
function parseDeploymentFromEnv(vars) {
  const raw = vars.CONVEX_DEPLOYMENT
  if (!raw) {
    return null
  }
  const value = raw.trim()
  if (!value) {
    return null
  }

  if (isAnonymousLikeDeploymentName(value)) {
    return { type: 'dev', name: value, raw: value }
  }

  const index = value.indexOf(':')
  if (index <= 0) {
    return null
  }
  const prefix = value.slice(0, index).trim()
  const name = value.slice(index + 1).trim()
  if (!name) {
    return null
  }
  if (isDeploymentType(prefix)) {
    return { type: prefix, name, raw: value }
  }
  const isAnonymousPrefix = prefix === 'anonymous' || prefix === 'local'
  if (isAnonymousPrefix && isAnonymousLikeDeploymentName(name)) {
    return { type: 'dev', name, raw: value }
  }
  return null
}

/**
 * @param {string} value
 * @returns {value is DeploymentType}
 */
function isDeploymentType(value) {
  return value === 'dev' || value === 'prod' || value === 'preview'
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isAnonymousLikeDeploymentName(name) {
  return name.startsWith('anonymous-') || name.startsWith('local-')
}

/**
 * @param {{ appDir: string; envFile: string }} args
 * @returns {EnvEntry[]}
 */
function listDeploymentEnvVars({ appDir, envFile }) {
  const result = spawnSync(
    'npx',
    ['convex', 'env', 'list', '--env-file', envFile],
    { cwd: appDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )

  if (result.status !== 0) {
    const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim()
    const message = output || 'convex env list failed'
    exitWithError(message)
  }

  const output = (result.stdout || '').trim()
  if (!output || output === 'No environment variables set.') {
    return []
  }

  /** @type {EnvEntry[]} */
  const entries = []
  for (const line of output.split(/\r?\n/)) {
    const eqIndex = line.indexOf('=')
    if (eqIndex <= 0) {
      continue
    }
    const name = line.slice(0, eqIndex)
    const value = line.slice(eqIndex + 1)
    entries.push({ name, value })
  }
  return entries
}

/**
 * @param {string} filePath
 * @param {EnvEntry[]} entries
 */
function writeEnvFile(filePath, entries) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const lines = entries.map(
    entry => `${entry.name}=${formatEnvValue(entry.value)}`,
  )
  const contents = lines.join('\n') + (lines.length > 0 ? '\n' : '')
  fs.writeFileSync(filePath, contents, 'utf8')
}

/**
 * @param {string} value
 * @returns {string}
 */
function formatEnvValue(value) {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value
  }
  return JSON.stringify(value)
}

/**
 * @param {string} repoRoot
 * @returns {string | null}
 */
function findSourceEnvFile(repoRoot) {
  const worktrees = getWorktrees(repoRoot)
  /** @type {Array<{ envPath: string; branch: string | null }>} */
  const candidates = []

  for (const worktree of worktrees) {
    const envPath = path.join(worktree.worktree, 'apps', 'noter', '.env.local')
    const envFile = readEnvFile(envPath)
    if (!envFile) {
      continue
    }
    const deployment = parseDeploymentFromEnv(envFile.vars)
    if (!deployment || deployment.type !== 'dev') {
      continue
    }
    if (isAnonymousLikeDeploymentName(deployment.name)) {
      continue
    }
    candidates.push({ envPath, branch: worktree.branch })
  }

  if (candidates.length === 0) {
    return null
  }

  const mainCandidate = candidates.find(
    candidate => candidate.branch === 'refs/heads/main',
  )
  if (mainCandidate) {
    return mainCandidate.envPath
  }

  return candidates[0]?.envPath ?? null
}

/**
 * @param {string} repoRoot
 * @returns {WorktreeInfo[]}
 */
function getWorktrees(repoRoot) {
  const result = spawnSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    return []
  }
  const output = (result.stdout || '').trim()
  if (!output) {
    return []
  }
  const blocks = output.split(/\n\n+/)
  return blocks.map(parseWorktreeBlock)
}

/**
 * @param {string} block
 * @returns {WorktreeInfo}
 */
function parseWorktreeBlock(block) {
  const lines = block.split(/\r?\n/)
  /** @type {WorktreeInfo} */
  const data = {
    worktree: '',
    branch: null,
  }
  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      data.worktree = line.slice('worktree '.length).trim()
      continue
    }
    if (line.startsWith('branch ')) {
      data.branch = line.slice('branch '.length).trim()
    }
  }
  return data
}

/**
 * @param {string} message
 * @returns {never}
 */
function exitWithError(message) {
  console.error(message)
  process.exit(1)
}
