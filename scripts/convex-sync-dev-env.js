#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const HELP_TEXT = `Usage: scripts/convex-sync-dev-env.js [options]

Copy Convex environment variables from the cloud dev deployment to the
local anonymous deployment for this worktree.

Options:
  --source-env <path>     Path to an env file that targets the dev deployment.
                          If omitted, the script scans git worktrees for a
                          .env.local with CONVEX_DEPLOYMENT=dev:* (non-anon).
  --target-env <path>     Path to the env file for the local anonymous deployment.
                          Default: apps/noter/.env.local in this repo.
  --include-site-url      Copy SITE_URL too (default: skip).
  --dry-run               Show what would be set without making changes.
  -h, --help              Show this help message.
`

const options = parseArgs(process.argv.slice(2))
if (options.showHelp) {
  console.log(HELP_TEXT)
  process.exit(0)
}

const repoRoot = resolveRepoRoot()
const appDir = path.join(repoRoot, 'apps', 'noter')
const defaultTargetEnv = path.join(appDir, '.env.local')

const targetEnvPath = path.resolve(options.targetEnv ?? defaultTargetEnv)
const targetEnv = readEnvFile(targetEnvPath)
if (!targetEnv) {
  exitWithError(
    `Target env file not found: ${targetEnvPath}\n` +
      'Run a local Convex dev deployment first to generate it.',
  )
}

const targetDeployment = parseDeploymentFromEnv(targetEnv.vars)
if (!targetDeployment || !targetDeployment.name) {
  exitWithError(
    `Target env file does not contain a usable CONVEX_DEPLOYMENT: ${targetEnvPath}`,
  )
}
if (targetDeployment.type === 'prod') {
  exitWithError('Refusing to write env vars to a prod deployment.')
}
if (!targetDeployment.name.startsWith('anonymous-')) {
  exitWithError(
    `Target deployment is not anonymous (${targetDeployment.raw}). ` +
      'This script only syncs to local anonymous deployments.',
  )
}

const discoveredSource =
  options.sourceEnv ?? findSourceEnvFile(repoRoot, targetEnvPath)
if (!discoveredSource) {
  exitWithError('No source env file found. Pass --source-env to specify one.')
}
const sourceEnvPath = path.resolve(discoveredSource)

const sourceEnv = readEnvFile(sourceEnvPath)
if (!sourceEnv) {
  exitWithError(`Source env file not found: ${sourceEnvPath}`)
}

const sourceDeployment = parseDeploymentFromEnv(sourceEnv.vars)
if (!sourceDeployment || !sourceDeployment.type) {
  exitWithError(
    `Source env file does not contain a usable CONVEX_DEPLOYMENT or CONVEX_DEPLOY_KEY: ${sourceEnvPath}`,
  )
}
if (sourceDeployment.type === 'prod') {
  exitWithError('Refusing to read env vars from a prod deployment.')
}
if (sourceDeployment.type !== 'dev') {
  exitWithError(`Source deployment must be dev (got ${sourceDeployment.raw}).`)
}
if (sourceDeployment.name?.startsWith('anonymous-')) {
  exitWithError(
    `Source deployment appears to be anonymous (${sourceDeployment.raw}). ` +
      'Use a cloud dev deployment as the source.',
  )
}

if (path.resolve(sourceEnvPath) === path.resolve(targetEnvPath)) {
  console.log('Source and target env files are the same; nothing to sync.')
  process.exit(0)
}

const ignoredKeys = new Set(['SITE_URL'])
if (options.includeSiteUrl) {
  ignoredKeys.delete('SITE_URL')
}

const entries = listDeploymentEnvVars({
  appDir,
  envFile: sourceEnvPath,
}).filter(({ name }) => !ignoredKeys.has(name))

if (entries.length === 0) {
  console.log('No environment variables to sync.')
  process.exit(0)
}

const sorted = entries.slice().sort((a, b) => a.name.localeCompare(b.name))

console.log(
  `Syncing ${sorted.length} env var${sorted.length === 1 ? '' : 's'} ` +
    `from ${sourceDeployment.raw} -> ${targetDeployment.raw}`,
)
if (ignoredKeys.size > 0) {
  console.log(`Skipping: ${Array.from(ignoredKeys).join(', ')}`)
}

if (options.dryRun) {
  console.log('Dry run; would set:')
  for (const { name } of sorted) {
    console.log(`- ${name}`)
  }
  process.exit(0)
}

for (const { name, value } of sorted) {
  setDeploymentEnvVar({
    appDir,
    envFile: targetEnvPath,
    name,
    value,
  })
}

console.log('Done.')

function parseArgs(args) {
  const result = {
    sourceEnv: null,
    targetEnv: null,
    includeSiteUrl: false,
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
    if (arg === '--include-site-url') {
      result.includeSiteUrl = true
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

function resolveRepoRoot() {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  })
  if (result.status === 0) {
    return (result.stdout || '').trim() || process.cwd()
  }
  return process.cwd()
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null
  }
  const contents = fs.readFileSync(filePath, 'utf8')
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
    let value = trimmed.slice(eqIndex + 1)
    value = stripQuotes(value.trim())
    vars[key] = value
  }
  return { path: filePath, vars }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function parseDeploymentFromEnv(vars) {
  if (vars.CONVEX_DEPLOYMENT) {
    return parseDeploymentString(vars.CONVEX_DEPLOYMENT, 'CONVEX_DEPLOYMENT')
  }
  if (vars.CONVEX_DEPLOY_KEY) {
    return parseDeploymentFromDeployKey(vars.CONVEX_DEPLOY_KEY)
  }
  return null
}

function parseDeploymentString(raw, source) {
  const index = raw.indexOf(':')
  if (index <= 0) {
    return null
  }
  const type = raw.slice(0, index).trim()
  const name = raw.slice(index + 1).trim()
  if (!type || !name) {
    return null
  }
  return { type, name, raw, source }
}

function parseDeploymentFromDeployKey(raw) {
  const prefix = raw.split('|')[0] ?? ''
  const parts = prefix.split(':')
  const type = parts[0]?.trim()
  if (!type) {
    return null
  }
  if (type === 'dev' || type === 'prod') {
    const name = parts.slice(1).join(':').trim()
    if (!name) {
      return null
    }
    return { type, name, raw: prefix, source: 'CONVEX_DEPLOY_KEY' }
  }
  if (type === 'preview') {
    return { type, name: null, raw: prefix, source: 'CONVEX_DEPLOY_KEY' }
  }
  return null
}

function listDeploymentEnvVars({ appDir, envFile }) {
  const result = spawnSync(
    'npx',
    ['convex', 'env', 'list', '--env-file', envFile],
    { cwd: appDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )

  if (result.status !== 0) {
    const message = (result.stderr || '').trim() || 'convex env list failed'
    exitWithError(message)
  }

  const output = (result.stdout || '').trim()
  if (!output || output === 'No environment variables set.') {
    return []
  }

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

function setDeploymentEnvVar({ appDir, envFile, name, value }) {
  const result = spawnSync(
    'npx',
    ['convex', 'env', 'set', '--env-file', envFile, name],
    {
      cwd: appDir,
      encoding: 'utf8',
      input: `${value}\n`,
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  )

  if (result.status !== 0) {
    const message = (result.stderr || '').trim() || `Failed to set ${name}`
    exitWithError(message)
  }
}

function findSourceEnvFile(repoRoot, targetEnvPath) {
  const worktrees = getWorktrees(repoRoot)
  const candidates = []

  for (const worktree of worktrees) {
    const envPath = path.join(worktree.worktree, 'apps', 'noter', '.env.local')
    if (path.resolve(envPath) === path.resolve(targetEnvPath)) {
      continue
    }
    const envFile = readEnvFile(envPath)
    if (!envFile) {
      continue
    }
    const deployment = parseDeploymentFromEnv(envFile.vars)
    if (!deployment || deployment.type !== 'dev') {
      continue
    }
    if (deployment.name?.startsWith('anonymous-')) {
      continue
    }
    candidates.push({ envPath, deployment, worktree })
  }

  if (candidates.length === 0) {
    return null
  }
  const mainCandidate = candidates.find(
    candidate => candidate.worktree.branch === 'refs/heads/main',
  )
  if (mainCandidate) {
    return mainCandidate.envPath
  }
  if (candidates.length === 1) {
    return candidates[0].envPath
  }
  console.log('Multiple dev env files found:')
  for (const candidate of candidates) {
    const branch = candidate.worktree.branch ?? 'detached'
    console.log(
      `- ${candidate.envPath} (${branch}, ${candidate.deployment.raw})`,
    )
  }
  return null
}

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
  return blocks.map(block => parseWorktreeBlock(block))
}

function parseWorktreeBlock(block) {
  const lines = block.split(/\r?\n/)
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

function exitWithError(message) {
  console.error(message)
  process.exit(1)
}
