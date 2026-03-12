#!/usr/bin/env node
// @ts-check
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const HELP_TEXT = `Usage: scripts/daytona-write-source-env.js [options]

Write a Daytona-specific cloud dev source env file for anonymous local bootstrap.

Options:
  --output <path>   Output env file path.
                    Default: apps/noter/.env.daytona-source.local
  --optional        Exit successfully when no usable Daytona cloud dev source is available.
                    Any stale output file will be removed.
  -h, --help        Show this help message.
`

const options = parseArgs(process.argv.slice(2))
if (options.showHelp) {
  console.log(HELP_TEXT)
  process.exit(0)
}

const repoRoot = resolveRepoRoot()
const outputPath = path.resolve(
  options.output ??
    path.join(repoRoot, 'apps', 'noter', '.env.daytona-source.local'),
)

const resolved = resolveSourceDeployment({
  daytonaDeployKey: process.env.DAYTONA_CONVEX_DEPLOY_KEY,
  convexDeployment: process.env.CONVEX_DEPLOYMENT,
})

if (resolved.status === 'missing') {
  removeFileIfExists(outputPath)
  if (options.optional) {
    console.log(
      'No Daytona cloud dev deployment available; skipped source env generation.',
    )
    process.exit(0)
  }
  exitWithError(
    'Could not infer a Daytona cloud dev deployment. ' +
      'Set DAYTONA_CONVEX_DEPLOY_KEY to a dev deployment before generating the source env.',
  )
}

if (resolved.status === 'invalid') {
  removeFileIfExists(outputPath)
  exitWithError(resolved.message)
}

writeEnvFile(outputPath, [
  { name: 'CONVEX_DEPLOYMENT', value: resolved.deployment },
  ...buildSourceAuthEntries(process.env.DAYTONA_CONVEX_DEPLOY_KEY),
])
console.log(`Wrote ${outputPath}`)

/**
 * @typedef {{
 *   output: string | null
 *   optional: boolean
 *   showHelp: boolean
 * }} Options
 *
 * @typedef {{
 *   daytonaDeployKey: string | undefined
 *   convexDeployment: string | undefined
 * }} SourceDeploymentArgs
 *
 * @typedef {{
 *   name: string
 *   value: string
 * }} EnvEntry
 */

/**
 * @param {string[]} args
 * @returns {Options}
 */
function parseArgs(args) {
  /** @type {Options} */
  const result = {
    output: null,
    optional: false,
    showHelp: false,
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--output') {
      const value = args[i + 1]
      if (!value || value.startsWith('-')) {
        exitWithError(`Missing value for ${arg}\n\n${HELP_TEXT}`)
      }
      result.output = value
      i += 1
      continue
    }
    if (arg === '--optional') {
      result.optional = true
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
  if (result.status !== 0) {
    return process.cwd()
  }
  return (result.stdout || '').trim() || process.cwd()
}

/**
 * @param {SourceDeploymentArgs} args
 * @returns {{
 *   status: 'ok'
 *   deployment: string
 * } | {
 *   status: 'missing'
 * } | {
 *   status: 'invalid'
 *   message: string
 * }}
 */
function resolveSourceDeployment(args) {
  const daytonaSpecifier = extractDaytonaDeploymentSpecifier(
    args.daytonaDeployKey,
  )
  if (daytonaSpecifier !== null) {
    return parseSourceDeployment(daytonaSpecifier, 'DAYTONA_CONVEX_DEPLOY_KEY')
  }

  const convexDeployment = args.convexDeployment?.trim() ?? ''
  if (convexDeployment.length === 0) {
    return { status: 'missing' }
  }

  return parseSourceDeployment(convexDeployment, 'CONVEX_DEPLOYMENT')
}

/**
 * @param {string | undefined} rawDeployKey
 * @returns {string | null}
 */
function extractDaytonaDeploymentSpecifier(rawDeployKey) {
  const trimmed = rawDeployKey?.trim() ?? ''
  if (trimmed.length === 0) {
    return null
  }

  const [deploymentSpecifier] = trimmed.split('|', 1)
  const normalized = deploymentSpecifier.trim()
  return normalized.length > 0 ? normalized : null
}

/**
 * @param {string} rawDeployment
 * @param {string} sourceName
 * @returns {{
 *   status: 'ok'
 *   deployment: string
 * } | {
 *   status: 'missing'
 * } | {
 *   status: 'invalid'
 *   message: string
 * }}
 */
function parseSourceDeployment(rawDeployment, sourceName) {
  const normalized = rawDeployment.trim()
  if (normalized.length === 0) {
    return { status: 'missing' }
  }

  if (isAnonymousLikeDeploymentName(normalized)) {
    return { status: 'missing' }
  }

  const separatorIndex = normalized.indexOf(':')
  if (separatorIndex <= 0) {
    return {
      status: 'invalid',
      message:
        `${sourceName} must start with "dev:" for Daytona local seed copying ` +
        `(received "${normalized}").`,
    }
  }

  const deploymentType = normalized.slice(0, separatorIndex).trim()
  const deploymentName = normalized.slice(separatorIndex + 1).trim()
  if (deploymentName.length === 0) {
    return {
      status: 'invalid',
      message: `${sourceName} does not contain a deployment name.`,
    }
  }

  if (isAnonymousLikeDeploymentName(deploymentName)) {
    return { status: 'missing' }
  }

  if (deploymentType === 'dev') {
    return { status: 'ok', deployment: `dev:${deploymentName}` }
  }

  if (deploymentType === 'preview' || deploymentType === 'prod') {
    return {
      status: 'invalid',
      message:
        `${sourceName} must reference a cloud dev deployment for Daytona local mode ` +
        `(received "${normalized}").`,
    }
  }

  return {
    status: 'invalid',
    message: `${sourceName} has an unsupported deployment type: "${deploymentType}".`,
  }
}

/**
 * @param {string | undefined} rawDeployKey
 * @returns {EnvEntry[]}
 */
function buildSourceAuthEntries(rawDeployKey) {
  const normalized = rawDeployKey?.trim() ?? ''
  if (normalized.length === 0) {
    return []
  }
  return [{ name: 'CONVEX_DEPLOY_KEY', value: normalized }]
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isAnonymousLikeDeploymentName(name) {
  return name.startsWith('anonymous-') || name.startsWith('local-')
}

/**
 * @param {string} filePath
 * @param {EnvEntry[]} entries
 */
function writeEnvFile(filePath, entries) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const contents =
    entries.map(entry => `${entry.name}=${entry.value}`).join('\n') + '\n'
  fs.writeFileSync(filePath, contents, 'utf8')
}

/**
 * @param {string} filePath
 * @returns {void}
 */
function removeFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return
  }
  fs.rmSync(filePath)
}

/**
 * @param {string} message
 * @returns {never}
 */
function exitWithError(message) {
  console.error(message)
  process.exit(1)
}
