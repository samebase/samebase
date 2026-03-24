#!/usr/bin/env node
// @ts-check
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HELP_TEXT = `Usage: scripts/playwright-branch-browser.js <command> [args]

Commands:
  session                Print the deterministic Playwright session name.
  profile                Print the branch-owned browser profile directory.
  open [url]             Open the branch session without unloading a dirty tab.
  cli <command> [args]   Run @playwright/cli inside the branch session.
  help                   Show this help message.

Environment:
  PLAYWRIGHT_SESSION     Override the computed session name.`

const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const EXPLICIT_SESSION_PATTERN = /^[A-Za-z0-9._-]+$/
const PLAYWRIGHT_CLI_CHROMIUM_ARGS = ['--disable-session-crashed-bubble']
const SESSION_REPO_SEGMENT_MAX_LENGTH = 5
const SESSION_BRANCH_SEGMENT_MAX_LENGTH = 3
const SESSION_HASH_LENGTH = 6

if (isMainModule()) {
  main(process.argv.slice(2))
}

/**
 * @typedef {{
 *   browser: {
 *     launchOptions: {
 *       args: string[]
 *     }
 *   }
 * }} PlaywrightCliConfig
 */

/**
 * @param {string[]} args
 * @returns {void}
 */
function main(args) {
  const [command, ...rest] = args

  if (
    !command ||
    command === 'help' ||
    command === '--help' ||
    command === '-h'
  ) {
    console.log(HELP_TEXT)
    return
  }

  if (command === 'session') {
    console.log(getSessionName())
    return
  }

  if (command === 'profile') {
    console.log(getProfileDir(getSessionName()))
    return
  }

  if (command === 'open') {
    openBranchSession(rest[0])
    return
  }

  if (command === 'cli') {
    if (rest.length === 0) {
      fail('Missing playwright-cli command. Use `cli <command> [args]`.')
    }

    runPlaywrightCli([`-s=${getSessionName()}`, ...rest])
    return
  }

  fail(`Unknown command: ${command}`)
}

/**
 * Re-entering a branch session should never unload the current working tab.
 * Opening a fresh tab keeps unsaved editor state intact and avoids native
 * beforeunload popups when a branch window is already in use.
 *
 * @param {string | undefined} url
 * @returns {void}
 */
function openBranchSession(url) {
  const session = getSessionName()
  const cliArgs = [`-s=${session}`]
  const initialSessionState = getSessionState(session)

  if (initialSessionState === 'unknown') {
    fail(
      `Could not determine whether Playwright session "${session}" is already running. Refusing to reopen it because that could replace an unsaved browser tab.`,
    )
  }

  if (initialSessionState === 'exists') {
    const reuseArgs = [...cliArgs, 'tab-new']
    if (url) {
      reuseArgs.push(url)
    }

    const reuseResult = runPlaywrightCli(reuseArgs, {
      allowFailure: true,
      stdio: 'pipe',
    })

    if (reuseResult.status === 0) {
      writeCapturedOutput(reuseResult)
      return
    }

    if (requiresSessionReopen(reuseResult, session)) {
      writeCapturedOutput(reuseResult)
    } else {
      writeCapturedOutput(reuseResult)

      // `open` stops an existing session before recreating it, so only fall
      // back when we can prove the original session is already gone.
      if (getSessionState(session) !== 'missing') {
        fail(
          `Playwright session "${session}" rejected 'tab-new'. Leaving the existing browser untouched so unsaved changes are not lost.`,
        )
      }
    }
  }

  const profileDir = getProfileDir(session)
  mkdirSync(profileDir, { recursive: true })

  const openArgs = [...cliArgs, 'open']
  if (url) {
    openArgs.push(url)
  }

  openArgs.push('--persistent', `--profile=${profileDir}`)
  runPlaywrightCli(openArgs)
}

/**
 * Saved session configs can outlive a Playwright CLI upgrade. In that case the
 * first command fails before the registry entry disappears, but re-opening the
 * session is the documented recovery path.
 *
 * @param {import('node:child_process').SpawnSyncReturns<string>} result
 * @param {string} session
 * @returns {boolean}
 */
function requiresSessionReopen(result, session) {
  const output = `${result.stdout}\n${result.stderr}`
  const escapedSession = session.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`session '${escapedSession}' is v`, 'i').test(output)
}

/**
 * @param {import('node:child_process').SpawnSyncReturns<string>} result
 * @returns {void}
 */
function writeCapturedOutput(result) {
  if (result.stdout) {
    process.stdout.write(result.stdout)
  }

  if (result.stderr) {
    process.stderr.write(result.stderr)
  }
}

/** @returns {string} */
function getSessionName() {
  const explicitSession = process.env.PLAYWRIGHT_SESSION?.trim()
  if (explicitSession) {
    return getSafeExplicitSession(explicitSession)
  }

  const repoRoot = getRepoRoot()
  const branchIdentifier = getBranchIdentifier()
  return buildDerivedSessionName(repoRoot, branchIdentifier)
}

/**
 * @param {string} session
 * @returns {string}
 */
function getProfileDir(session) {
  return path.join(getRepoRoot(), '.playwright-cli', 'profiles', session)
}

/**
 * Every branch-owned persistent browser should inherit the same launch flags so
 * Chrome crash recovery UI never blocks automation after an unclean exit.
 *
 * @returns {PlaywrightCliConfig}
 */
export function buildPlaywrightCliConfig() {
  return {
    browser: {
      launchOptions: {
        args: [...PLAYWRIGHT_CLI_CHROMIUM_ARGS],
      },
    },
  }
}

/**
 * @param {string} repoRoot
 * @returns {string}
 */
export function getPlaywrightCliConfigPath(repoRoot) {
  return path.join(repoRoot, '.playwright-cli', 'cli.config.json')
}

/**
 * @param {string} repoRoot
 * @returns {string}
 */
export function ensurePlaywrightCliConfig(repoRoot) {
  const configPath = getPlaywrightCliConfigPath(repoRoot)
  mkdirSync(path.dirname(configPath), { recursive: true })
  writeFileSync(
    configPath,
    `${JSON.stringify(buildPlaywrightCliConfig(), null, 2)}\n`,
    'utf8',
  )
  return configPath
}

/** @returns {string} */
function getRepoRoot() {
  return runGit(['rev-parse', '--show-toplevel'])
}

/**
 * @returns {string}
 */
function getBranchIdentifier() {
  const branchName = tryRunGit(['symbolic-ref', '-q', '--short', 'HEAD'])
  if (branchName) {
    return branchName
  }

  const shortSha = runGit(['rev-parse', '--short', 'HEAD'])
  return `detached-${shortSha}`
}

/**
 * @param {string} session
 * @returns {'exists' | 'missing' | 'unknown'}
 */
function getSessionState(session) {
  const result = runPlaywrightCli(['list', '--all'], {
    allowFailure: true,
    stdio: 'pipe',
  })

  if (result.status !== 0) {
    return 'unknown'
  }

  const escapedSession = session.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sessionLine = new RegExp(`^-\\s+${escapedSession}(?::|\\s|$)`)

  return `${result.stdout}\n${result.stderr}`
    .split('\n')
    .some(line => sessionLine.test(line.trimStart()))
    ? 'exists'
    : 'missing'
}

/**
 * @param {string[]} args
 * @param {{ allowFailure?: boolean, stdio?: 'inherit' | 'pipe' }} [options]
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function runPlaywrightCli(args, options = {}) {
  const repoRoot = getRepoRoot()
  const configPath = ensurePlaywrightCliConfig(repoRoot)
  const result = spawnSync(
    PNPM_COMMAND,
    [
      '--dir',
      path.join(repoRoot, 'apps/noter'),
      'exec',
      'playwright-cli',
      `--config=${configPath}`,
      ...args,
    ],
    {
      encoding: 'utf8',
      stdio: options.stdio ?? 'inherit',
    },
  )

  if (!options.allowFailure && result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  return result
}

/**
 * @param {string[]} args
 * @returns {string}
 */
function runGit(args) {
  const value = tryRunGit(args)
  if (!value) {
    fail(`Git command failed: git ${args.join(' ')}`)
  }
  return value
}

/**
 * @param {string[]} args
 * @returns {string}
 */
function tryRunGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    return ''
  }

  return result.stdout.trim()
}

/**
 * @param {string} value
 * @returns {string}
 */
function slugify(value) {
  const normalized = value
    .trim()
    .replaceAll(/[^A-Za-z0-9._-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')

  return normalized || 'unknown'
}

/**
 * Stable session names need to stay below local Unix socket path limits while
 * still being recognizable in Playwright CLI listings.
 *
 * @param {string} value
 * @param {number} maxLength
 * @returns {string}
 */
function truncateSessionSegment(value, maxLength) {
  const truncated = value.slice(0, maxLength).replaceAll(/^-|-$/g, '')
  return truncated || 'unknown'
}

/**
 * Most worktree branches use the `codex/` prefix, which is not useful inside a
 * derived session name and only increases the socket path length.
 *
 * @param {string} branchIdentifier
 * @returns {string}
 */
function normalizeBranchSessionSegment(branchIdentifier) {
  return branchIdentifier.startsWith('codex/')
    ? branchIdentifier.slice('codex/'.length)
    : branchIdentifier
}

/**
 * @param {string} branchIdentifier
 * @returns {string}
 */
function abbreviateBranchSessionSegment(branchIdentifier) {
  const normalizedBranch = slugify(
    normalizeBranchSessionSegment(branchIdentifier),
  )
  const segments = normalizedBranch.split('-').filter(Boolean)

  if (segments.length > 1) {
    return truncateSessionSegment(
      segments.map(segment => segment[0]).join(''),
      SESSION_BRANCH_SEGMENT_MAX_LENGTH,
    )
  }

  return truncateSessionSegment(
    normalizedBranch,
    SESSION_BRANCH_SEGMENT_MAX_LENGTH,
  )
}

/**
 * @param {string} explicitSession
 * @returns {string}
 */
function getSafeExplicitSession(explicitSession) {
  if (!EXPLICIT_SESSION_PATTERN.test(explicitSession)) {
    fail(
      'PLAYWRIGHT_SESSION may only contain letters, numbers, ".", "_" and "-".',
    )
  }

  return explicitSession
}

/**
 * @param {string} repoRoot
 * @param {string} branchIdentifier
 * @returns {string}
 */
export function buildDerivedSessionName(repoRoot, branchIdentifier) {
  const repoName = truncateSessionSegment(
    slugify(path.basename(repoRoot)),
    SESSION_REPO_SEGMENT_MAX_LENGTH,
  )
  const branchName = abbreviateBranchSessionSegment(branchIdentifier)
  const stableSuffix = createHash('sha256')
    .update(`${repoRoot}\0${branchIdentifier}`)
    .digest('hex')
    .slice(0, SESSION_HASH_LENGTH)

  return `${repoName}-${branchName}-${stableSuffix}`
}

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(message)
  console.error(HELP_TEXT)
  process.exit(1)
}

/** @returns {boolean} */
function isMainModule() {
  return process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false
}
