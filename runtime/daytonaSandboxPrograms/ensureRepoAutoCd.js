import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * @typedef {{
 *   repoPath: string
 *   bashProfileFiles?: readonly string[]
 * }} EnsureRepoAutoCdArgs
 */

export const DEFAULT_BASH_PROFILE_FILES = [
  '/root/.bashrc',
  '/home/daytona/.bashrc',
  '/etc/bash.bashrc',
]

/**
 * @param {string} value
 * @returns {string}
 */
function quoteForShell(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * @param {unknown} error
 * @returns {error is NodeJS.ErrnoException}
 */
function isEnoentError(error) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/**
 * @param {string} filePath
 * @param {string} line
 * @param {{ ensureParentDir: boolean }} options
 */
async function ensureLineInFile(filePath, line, { ensureParentDir }) {
  if (ensureParentDir) {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
  }

  let existingContents = ''
  try {
    existingContents = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if (isEnoentError(error)) {
      existingContents = ''
    } else {
      throw error
    }
  }

  const existingLines = existingContents
    .split('\n')
    .map(value => value.replace(/\r$/, ''))
  if (existingLines.includes(line)) {
    return
  }

  const nextContents =
    existingContents.length === 0
      ? `${line}\n`
      : existingContents.endsWith('\n')
        ? `${existingContents}${line}\n`
        : `${existingContents}\n${line}\n`

  await fs.writeFile(filePath, nextContents, 'utf8')
}

/**
 * @param {EnsureRepoAutoCdArgs} args
 */
export async function ensureRepoAutoCd(args) {
  const line = `cd ${quoteForShell(args.repoPath)}`

  for (const filePath of args.bashProfileFiles ?? DEFAULT_BASH_PROFILE_FILES) {
    await ensureLineInFile(filePath, line, { ensureParentDir: false })
  }
}

async function main() {
  const repoPath = process.argv.at(2)
  if (repoPath === undefined || repoPath === '') {
    throw new Error(
      'Usage: node runtime/daytonaSandboxPrograms/ensureRepoAutoCd.js <repoPath>',
    )
  }

  await ensureRepoAutoCd({ repoPath })
}

const currentFilePath = fileURLToPath(import.meta.url)
const invokedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : null

if (invokedFilePath === currentFilePath) {
  await main()
}
