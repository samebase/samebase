#!/usr/bin/env node
// @ts-check
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const HELP_TEXT = `Usage: scripts/worktree-temp-prefix.js [options] [intent...]

Outputs a temporary repo prefix/name scoped to the current worktree.

Options:
  --id      Print only the current worktree token.
  --prefix  Print only the temp prefix (default when no intent is given).
  -h, --help
            Show this help message.

Examples:
  node scripts/worktree-temp-prefix.js
  node scripts/worktree-temp-prefix.js --id
  node scripts/worktree-temp-prefix.js chat fab
`

const args = process.argv.slice(2)
let outputMode = 'auto'
const intentParts = []

for (const arg of args) {
  if (arg === '--') {
    continue
  }
  if (arg === '--id') {
    outputMode = 'id'
    continue
  }
  if (arg === '--prefix') {
    outputMode = 'prefix'
    continue
  }
  if (arg === '--help' || arg === '-h') {
    console.log(HELP_TEXT)
    process.exit(0)
  }
  if (arg.startsWith('-')) {
    console.error(`Unknown argument: ${arg}`)
    console.error(HELP_TEXT)
    process.exit(1)
  }
  intentParts.push(arg)
}

const token = resolveWorktreeToken()
const prefix = `tmp-${token}-`

if (outputMode === 'id') {
  console.log(token)
  process.exit(0)
}

if (outputMode === 'prefix' || intentParts.length === 0) {
  console.log(prefix)
  process.exit(0)
}

const intent = sanitizeSegment(intentParts.join('-'))
if (!intent) {
  console.error('Intent must contain at least one alphanumeric character.')
  process.exit(1)
}

console.log(`${prefix}${intent}`)

/**
 * @param {string[]} gitArgs
 * @returns {string}
 */
function readGitOutput(gitArgs) {
  const result = spawnSync('git', gitArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })

  if (result.status !== 0) {
    return ''
  }

  return (result.stdout ?? '').trim()
}

/**
 * @param {string} value
 * @returns {string}
 */
function sanitizeSegment(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** @returns {string} */
function resolveGitRoot() {
  return readGitOutput(['rev-parse', '--show-toplevel']) || process.cwd()
}

/** @returns {string} */
function resolveBranchToken() {
  const branch = readGitOutput(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (!branch || branch === 'HEAD') {
    return ''
  }
  return sanitizeSegment(branch.replace(/^codex\//, ''))
}

/**
 * @param {string} root
 * @returns {string}
 */
function resolveCodexWorktreeToken(root) {
  const match = root.match(
    /[\\/]\.codex[\\/]worktrees[\\/]([^\\/]+)[\\/][^\\/]+$/,
  )
  return match?.[1] ? sanitizeSegment(match[1]) : ''
}

/** @returns {string} */
function resolveWorktreeToken() {
  const root = resolveGitRoot()
  const codexToken = resolveCodexWorktreeToken(root)
  if (codexToken) {
    return codexToken
  }

  const rootBase = sanitizeSegment(path.basename(root))
  if (rootBase && rootBase !== 'noter') {
    return rootBase
  }

  const branchToken = resolveBranchToken()
  if (branchToken) {
    return branchToken
  }

  const parentBase = sanitizeSegment(path.basename(path.dirname(root)))
  if (parentBase) {
    return parentBase
  }

  return 'workspace'
}
