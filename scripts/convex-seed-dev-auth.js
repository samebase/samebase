#!/usr/bin/env node
// @ts-check
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  listListeningPids,
  parsePort,
  sleep,
} from '../apps/noter/convex-local-utils.js'

/**
 * @typedef {{ path: string, vars: Record<string, string> }} EnvFile
 */

const repoRoot = resolveRepoRoot()
const appDir = path.join(repoRoot, 'apps', 'noter')
const localEnvPath = path.join(appDir, '.env.local')
const seedEnvPath = path.join(appDir, '.env.anon-seed.local')

const localEnv = readEnvFile(localEnvPath)
if (!localEnv) {
  exitWithError(`Local env file not found: ${localEnvPath}`)
}

const seedEnv = readEnvFile(seedEnvPath)
if (!seedEnv) {
  exitWithError(`Seed env file not found: ${seedEnvPath}`)
}

const backendPort = resolveBackendPort(localEnv.vars)
if (!backendPort) {
  exitWithError(
    `Local env file does not contain VITE_CONVEX_URL or CONVEX_URL: ${localEnvPath}`,
  )
}

const WORKTREE_ENV_SYNC_ALLOWLIST = new Set(['ANTHROPIC_API_KEY'])
const seedEntries = Object.entries(seedEnv.vars).filter(
  ([name]) =>
    name.startsWith('DEV_SEED_') || WORKTREE_ENV_SYNC_ALLOWLIST.has(name),
)

const backend = spawn(
  'node',
  [
    'convex-dev.js',
    '--tail-logs=disable',
    '--typecheck=disable',
    '--codegen=disable',
  ],
  {
    cwd: appDir,
    env: { ...process.env, CONVEX_AGENT_MODE: 'anonymous' },
    stdio: 'inherit',
  },
)
const backendPid = backend.pid

let backendExited = false
backend.on('exit', () => {
  backendExited = true
})
const waitForBackendExit = async () => {
  if (backendExited) {
    return
  }
  backend.kill('SIGTERM')
  const deadline = Date.now() + 5000
  while (!backendExited && Date.now() < deadline) {
    await sleep(100)
  }
  if (!backendExited) {
    backend.kill('SIGKILL')
  }
}

/**
 * @param {number} port
 * @returns {Promise<void>}
 */
const terminateListeningPidsOnPort = async port => {
  /**
   * @param {string} value
   * @returns {number | null}
   */
  const toPid = value => {
    const asNumber = Number(value)
    return Number.isFinite(asNumber) ? asNumber : null
  }

  /**
   * @param {string[]} pids
   * @param {NodeJS.Signals} signal
   */
  const killPids = (pids, signal) => {
    for (const pidString of pids) {
      const pid = toPid(pidString)
      if (pid === null) continue
      try {
        process.kill(pid, signal)
      } catch {
        // ignore
      }
    }
  }

  let pids = listListeningPids(port)
  if (pids.length === 0) {
    return
  }

  // convex dev can leave behind the underlying `convex-local` process if the
  // node wrapper is terminated abruptly. Ensure we leave the port clean for
  // subsequent `convex dev` invocations in `make anon`.
  killPids(pids, 'SIGTERM')

  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    await sleep(100)
    pids = listListeningPids(port)
    if (pids.length === 0) {
      return
    }
  }

  killPids(pids, 'SIGKILL')
}

let exitCode = 0
try {
  const ready = await waitForBackend(backendPort)
  if (!ready) {
    exitWithError(`Local backend did not start on port ${backendPort}`)
  }

  for (const [name, value] of seedEntries) {
    const result = spawnSync(
      'npx',
      ['convex', 'env', 'set', name, '--env-file', localEnvPath],
      {
        cwd: appDir,
        input: value,
        encoding: 'utf8',
        stdio: ['pipe', 'inherit', 'inherit'],
      },
    )
    if (result.status !== 0) {
      exitWithError(`Failed to set ${name} in local Convex env`)
    }
  }

  const runResult = spawnSync(
    'npx',
    [
      'convex',
      'run',
      'devAuth:seedPasswordAccount',
      '--env-file',
      localEnvPath,
      '--typecheck',
      'disable',
      '--codegen',
      'disable',
    ],
    { cwd: appDir, stdio: 'inherit' },
  )
  if (runResult.status !== 0) {
    exitWithError('Failed to run devAuth:seedPasswordAccount')
  }
} catch (error) {
  exitCode = 1
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
} finally {
  await waitForBackendExit()
  await terminateListeningPidsOnPort(backendPort)
}

process.exit(exitCode)

/**
 * @returns {string}
 */
function resolveRepoRoot() {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    stdio: 'pipe',
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    return process.cwd()
  }
  const root = (result.stdout ?? '').trim()
  return root.length > 0 ? root : process.cwd()
}

/**
 * @param {string} filePath
 * @returns {EnvFile | null}
 */
function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null
  }
  /** @type {Record<string, string>} */
  const vars = {}
  const contents = fs.readFileSync(filePath, 'utf8')
  for (const line of contents.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex <= 0) continue
    const name = line.slice(0, eqIndex).trim()
    const rawValue = line.slice(eqIndex + 1).trim()
    if (!name) continue
    let value = rawValue
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    vars[name] = value
  }
  return { path: filePath, vars }
}

/**
 * @param {Record<string, string>} vars
 * @returns {number | null}
 */
function resolveBackendPort(vars) {
  const url = vars.VITE_CONVEX_URL ?? vars.CONVEX_URL
  if (!url) return null
  return parsePort(url)
}

/**
 * @param {number} port
 * @returns {Promise<boolean>}
 */
async function waitForBackend(port) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/instance_name`, {
        signal: AbortSignal.timeout(500),
      })
      if (response.ok) {
        return true
      }
    } catch {
      // ignore and retry
    }
    await sleep(250)
  }
  return false
}

/**
 * @param {string} message
 * @returns {never}
 */
function exitWithError(message) {
  throw new Error(message)
}
