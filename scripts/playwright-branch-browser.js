#!/usr/bin/env node
// @ts-check
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const HELP_TEXT = `Usage: scripts/playwright-branch-browser.js <command> [args]

Commands:
  session                Print the deterministic Playwright session name.
  profile                Print the branch-owned browser profile directory.
  open [url]             Open the branch session without unloading a dirty tab.
  cli <command> [args]   Run @playwright/cli inside the branch session.
  help                   Show this help message.

Environment:
  PLAYWRIGHT_SESSION     Override the computed session name.`

const NPX_COMMAND = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const PLAYWRIGHT_CLI_ARGS = ['--yes', '@playwright/cli']

main(process.argv.slice(2))

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

  if (sessionExists(session)) {
    const reuseArgs = [...cliArgs, 'tab-new']
    if (url) {
      reuseArgs.push(url)
    }

    const reuseResult = runPlaywrightCli(reuseArgs, {
      allowFailure: true,
      stdio: 'inherit',
    })

    if (reuseResult.status === 0) {
      return
    }
  }

  const profileDir = getProfileDir(session)
  mkdirSync(profileDir, { recursive: true })

  const openArgs = [...cliArgs, 'open']
  if (url) {
    openArgs.push(url)
  }

  openArgs.push('--browser=chrome', '--persistent', `--profile=${profileDir}`)
  runPlaywrightCli(openArgs)
}

/** @returns {string} */
function getSessionName() {
  const explicitSession = process.env.PLAYWRIGHT_SESSION?.trim()
  if (explicitSession) {
    return explicitSession
  }

  const repoName = slugify(path.basename(getRepoRoot()))
  const branchName = slugify(getBranchIdentifier())
  return `${repoName}-${branchName}`
}

/**
 * @param {string} session
 * @returns {string}
 */
function getProfileDir(session) {
  return path.join(getRepoRoot(), '.playwright-cli', 'profiles', session)
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
 * @returns {boolean}
 */
function sessionExists(session) {
  const result = runPlaywrightCli(['list', '--all'], {
    allowFailure: true,
    stdio: 'pipe',
  })

  if (result.status !== 0) {
    return false
  }

  const output = `${result.stdout}\n${result.stderr}`
  const escapedSession = session.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|\\s)${escapedSession}(\\s|$)`, 'm').test(output)
}

/**
 * @param {string[]} args
 * @param {{ allowFailure?: boolean, stdio?: 'inherit' | 'pipe' }} [options]
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function runPlaywrightCli(args, options = {}) {
  const result = spawnSync(NPX_COMMAND, [...PLAYWRIGHT_CLI_ARGS, ...args], {
    encoding: 'utf8',
    stdio: options.stdio ?? 'inherit',
  })

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
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(message)
  console.error(HELP_TEXT)
  process.exit(1)
}
