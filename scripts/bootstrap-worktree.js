#!/usr/bin/env node
// @ts-check
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

/**
 * @typedef {{
 *   anonMode: boolean
 *   enableBranch: boolean
 * }} BootstrapOptions
 *
 * @typedef {{
 *   anonMode: boolean
 *   cacheRoot: string
 *   currentHash: string
 *   workspaceDir: string
 * }} InstallOptions
 */

const HELP_TEXT = `Usage: scripts/bootstrap-worktree.js [--anon] [--no-branch]

Options:
  --anon       Run dependency install with CONVEX_AGENT_MODE=anonymous.
  --no-branch  Disable detached-HEAD auto-branch creation.
  -h, --help   Show this help message.`

const FIRST_WORDS = [
  'amber',
  'brisk',
  'calm',
  'daring',
  'ember',
  'frozen',
  'gentle',
  'hidden',
  'iron',
  'jade',
  'keen',
  'lucid',
  'mellow',
  'nimble',
  'open',
  'polar',
  'quick',
  'royal',
  'solar',
  'tidal',
  'urban',
  'vivid',
  'wild',
  'young',
]

const SECOND_WORDS = [
  'anchor',
  'beacon',
  'canyon',
  'delta',
  'ember',
  'forest',
  'harbor',
  'island',
  'jungle',
  'lagoon',
  'meadow',
  'nectar',
  'oak',
  'pebble',
  'quartz',
  'river',
  'summit',
  'thicket',
  'valley',
  'willow',
  'zenith',
]

const THIRD_WORDS = [
  'arc',
  'bloom',
  'crest',
  'drift',
  'echo',
  'flare',
  'glint',
  'harbor',
  'jetline',
  'knot',
  'line',
  'mist',
  'nova',
  'orbit',
  'pulse',
  'ridge',
  'spark',
  'trail',
  'union',
  'veil',
  'wave',
  'yarn',
  'zone',
]

const options = parseArgs(process.argv.slice(2))
const workspaceDir = process.env.WORKSPACE_DIR ?? process.cwd()

process.chdir(workspaceDir)

if (options.enableBranch) {
  createBranchIfDetached()
}

const cacheRoot = configureCacheRoot()
const currentHash = computeInstallHash(workspaceDir)
installDependenciesIfNeeded({
  anonMode: options.anonMode,
  cacheRoot,
  currentHash,
  workspaceDir,
})

/**
 * @param {string[]} args
 * @returns {BootstrapOptions}
 */
function parseArgs(args) {
  /** @type {BootstrapOptions} */
  const result = {
    anonMode: false,
    enableBranch: true,
  }

  for (const arg of args) {
    if (arg === '--anon') {
      result.anonMode = true
      continue
    }
    if (arg === '--no-branch') {
      result.enableBranch = false
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log(HELP_TEXT)
      process.exit(0)
    }

    console.error(`Unknown argument: ${arg}`)
    console.error(HELP_TEXT)
    process.exit(1)
  }

  return result
}

/** @returns {void} */
function createBranchIfDetached() {
  if (!isGitRepo()) {
    return
  }

  const currentBranch = getCurrentBranch()
  if (currentBranch.length > 0) {
    return
  }

  const candidate = pickAvailableBranchName()
  const createResult = spawnSync('git', ['switch', '-c', candidate], {
    stdio: 'ignore',
  })

  if (createResult.status === 0) {
    console.log(`Created branch: ${candidate}`)
  } else {
    console.log('Could not create branch (leaving HEAD detached).')
  }
}

/** @returns {boolean} */
function isGitRepo() {
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    stdio: 'ignore',
  })
  return result.status === 0
}

/** @returns {string} */
function getCurrentBranch() {
  const result = spawnSync('git', ['symbolic-ref', '-q', '--short', 'HEAD'], {
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    return ''
  }

  return (result.stdout ?? '').trim()
}

/** @returns {string} */
function pickAvailableBranchName() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateThreeWordBranch()
    if (!branchExists(candidate)) {
      return candidate
    }
  }

  const fallbackBase = `codex/auto-${timestampForBranch()}`
  if (!branchExists(fallbackBase)) {
    return fallbackBase
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = Math.floor(Math.random() * 90_000) + 10_000
    const candidate = `${fallbackBase}-${suffix}`
    if (!branchExists(candidate)) {
      return candidate
    }
  }

  return `${fallbackBase}-${Date.now()}`
}

/** @returns {string} */
function generateThreeWordBranch() {
  return `codex/${pickRandom(FIRST_WORDS)}-${pickRandom(SECOND_WORDS)}-${pickRandom(THIRD_WORDS)}`
}

/**
 * @param {readonly string[]} words
 * @returns {string}
 */
function pickRandom(words) {
  if (words.length === 0) {
    throw new Error('Cannot pick from an empty list.')
  }
  const index = Math.floor(Math.random() * words.length)
  return words[index]
}

/**
 * @param {string} branchName
 * @returns {boolean}
 */
function branchExists(branchName) {
  const result = spawnSync(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`],
    { stdio: 'ignore' },
  )
  return result.status === 0
}

/** @returns {string} */
function timestampForBranch() {
  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}-${hours}${minutes}${seconds}`
}

/** @returns {string} */
function configureCacheRoot() {
  const vscodeDir = '/vscode'
  if (!existsSync(vscodeDir)) {
    return ''
  }

  try {
    accessSync(vscodeDir, constants.W_OK)
  } catch {
    return ''
  }

  const cacheRoot = '/vscode/noter-cache'
  mkdirSync(cacheRoot, { recursive: true })

  process.env.PNPM_HOME =
    process.env.PNPM_HOME ?? path.join(cacheRoot, 'pnpm-home')
  process.env.PNPM_STORE_DIR =
    process.env.PNPM_STORE_DIR ?? path.join(cacheRoot, 'pnpm-store')
  process.env.PATH = `${process.env.PNPM_HOME}:${process.env.PATH ?? ''}`

  return cacheRoot
}

/**
 * @param {string} workspace
 * @returns {string}
 */
function computeInstallHash(workspace) {
  /** @type {string[]} */
  const hashInputs = []
  const rootFiles = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']

  for (const file of rootFiles) {
    if (existsSync(path.join(workspace, file))) {
      hashInputs.push(file)
    }
  }

  const appsDir = path.join(workspace, 'apps')
  if (existsSync(appsDir)) {
    collectPackageJsonFiles('apps', 0, hashInputs)
  }

  hashInputs.sort((left, right) => left.localeCompare(right))
  if (hashInputs.length === 0) {
    return ''
  }

  const hash = createHash('sha256')
  for (const relativeFile of hashInputs) {
    const absoluteFile = path.join(workspace, relativeFile)
    hash.update(`${relativeFile}\n`)
    hash.update(readFileSync(absoluteFile))
  }
  return hash.digest('hex')
}

/**
 * @param {string} relativeDir
 * @param {number} depth
 * @param {string[]} output
 * @returns {void}
 */
function collectPackageJsonFiles(relativeDir, depth, output) {
  if (depth > 3) {
    return
  }

  const absoluteDir = path.resolve(relativeDir)
  const entries = readdirSync(absoluteDir, { withFileTypes: true })

  for (const entry of entries) {
    const entryRelativePath = path.join(relativeDir, entry.name)
    if (entry.isFile() && entry.name === 'package.json') {
      output.push(entryRelativePath.split(path.sep).join('/'))
      continue
    }

    if (entry.isDirectory()) {
      collectPackageJsonFiles(entryRelativePath, depth + 1, output)
    }
  }
}

/**
 * @param {InstallOptions} args
 * @returns {void}
 */
function installDependenciesIfNeeded({
  anonMode,
  cacheRoot,
  currentHash,
  workspaceDir: workspace,
}) {
  const hashFileBase = cacheRoot || path.join(workspace, '.devcontainer')
  const hashFile = path.join(hashFileBase, 'pnpm-install.hash')
  const previousHash = existsSync(hashFile)
    ? readFileSync(hashFile, 'utf8').trim()
    : ''
  const nodeModulesDir = path.join(workspace, 'node_modules')
  const shouldInstall =
    !existsSync(nodeModulesDir) ||
    currentHash.length === 0 ||
    currentHash !== previousHash

  if (!shouldInstall) {
    console.log('Dependencies unchanged; skipping pnpm install.')
    return
  }

  console.log('Installing dependencies with pnpm...')
  const env = {
    ...process.env,
    ...(anonMode ? { CONVEX_AGENT_MODE: 'anonymous' } : {}),
  }

  const installResult = spawnSync(
    'pnpm',
    ['install', '--frozen-lockfile', '--prefer-offline'],
    {
      stdio: 'inherit',
      env,
    },
  )

  if (installResult.status !== 0) {
    process.exit(installResult.status ?? 1)
  }

  if (currentHash.length > 0) {
    mkdirSync(path.dirname(hashFile), { recursive: true })
    writeFileSync(hashFile, `${currentHash}\n`, 'utf8')
  }
}
