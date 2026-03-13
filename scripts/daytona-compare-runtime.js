#!/usr/bin/env node
// @ts-check
import fs from 'node:fs'
import { diffDaytonaRuntimeManifests } from '../runtime/daytonaRuntimeManifest.js'

const HELP_TEXT = `Usage: scripts/daytona-compare-runtime.js --left <path> --right <path>

Compare two normalized Daytona runtime manifests and exit non-zero on mismatch.

Options:
  --left <path>   Left manifest JSON file.
  --right <path>  Right manifest JSON file.
  -h, --help      Show this help message.
`

const options = parseArgs(process.argv.slice(2))
if (options.showHelp) {
  console.log(HELP_TEXT)
  process.exit(0)
}

const left = readJsonFile(options.left)
const right = readJsonFile(options.right)
const diffs = diffDaytonaRuntimeManifests(left, right)

if (diffs.length === 0) {
  console.log('Runtime manifests match.')
  process.exit(0)
}

console.error('Runtime manifests differ:')
for (const diff of diffs) {
  console.error(`- ${diff}`)
}
process.exit(1)

/**
 * @param {string[]} args
 * @returns {{
 *   left: string
 *   right: string
 *   showHelp: boolean
 * }}
 */
function parseArgs(args) {
  /** @type {{
   *   left: string | null
   *   right: string | null
   *   showHelp: boolean
   * }}
   */
  const result = {
    left: null,
    right: null,
    showHelp: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--left') {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        exitWithError(`Missing value for ${arg}\n\n${HELP_TEXT}`)
      }
      result.left = value
      index += 1
      continue
    }
    if (arg === '--right') {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        exitWithError(`Missing value for ${arg}\n\n${HELP_TEXT}`)
      }
      result.right = value
      index += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      result.showHelp = true
      continue
    }
    exitWithError(`Unknown argument: ${arg}\n\n${HELP_TEXT}`)
  }

  if (result.showHelp) {
    return {
      left: '',
      right: '',
      showHelp: true,
    }
  }

  if (!result.left || !result.right) {
    exitWithError(`Both --left and --right are required.\n\n${HELP_TEXT}`)
  }

  const left = result.left
  const right = result.right

  return {
    left,
    right,
    showHelp: false,
  }
}

/**
 * @param {string} filePath
 * @returns {unknown}
 */
function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  /** @type {unknown} */
  const parsed = JSON.parse(raw)
  return validateManifest(filePath, parsed)
}

/**
 * @param {string} filePath
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function validateManifest(filePath, value) {
  if (!isRecord(value)) {
    exitWithError(`${filePath} must contain a JSON object.`)
  }
  if (Reflect.get(value, 'version') !== 1) {
    exitWithError(
      `${filePath} must contain a Daytona runtime manifest with version 1.`,
    )
  }
  const repo = Reflect.get(value, 'repo')
  if (!isRecord(repo) || typeof Reflect.get(repo, 'headSha') !== 'string') {
    exitWithError(`${filePath} is missing repo.headSha.`)
  }
  if (typeof Reflect.get(value, 'appRoot') !== 'string') {
    exitWithError(`${filePath} is missing appRoot.`)
  }
  const envFiles = Reflect.get(value, 'envFiles')
  if (!isRecord(envFiles)) {
    exitWithError(`${filePath} is missing envFiles.`)
  }
  const services = Reflect.get(value, 'services')
  if (
    !isRecord(services) ||
    typeof Reflect.get(services, 'previewPort') !== 'number' ||
    typeof Reflect.get(services, 'previewPortListening') !== 'boolean'
  ) {
    exitWithError(
      `${filePath} is missing services.previewPort or services.previewPortListening.`,
    )
  }
  return value
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param {string} message
 * @returns {never}
 */
function exitWithError(message) {
  console.error(message)
  process.exit(1)
  throw new Error(message)
}
