import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

export const DAYTONA_RUNTIME_ENV_FILES = Object.freeze([
  '.env.local',
  '.env.daytona-source.local',
  '.env.anon-seed.local',
])

/**
 * @typedef {{
 *   path: string
 *   exists: boolean
 *   keys: string[]
 *   normalizedLines: string[]
 *   normalizedHash: string | null
 * }} DaytonaRuntimeEnvFileManifest
 */

/**
 * @typedef {{
 *   version: 1
 *   repo: {
 *     dir: string
 *     headSha: string
 *     status: string[]
 *   }
 *   appRoot: string
 *   envFiles: Record<string, DaytonaRuntimeEnvFileManifest>
 *   services: {
 *     previewPort: number
 *     previewPortListening: boolean
 *     localConvexConfigured: boolean
 *   }
 * }} DaytonaRuntimeManifest
 */

/**
 * @param {string} contents
 * @returns {Record<string, string>}
 */
export function parseDotEnvFile(contents) {
  /** @type {Record<string, string>} */
  const entries = {}
  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue
    }
    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }
    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    if (key.length === 0) {
      continue
    }
    entries[key] = value
  }
  return entries
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeDeploymentValue(value) {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return ''
  }
  const separatorIndex = trimmed.indexOf(':')
  if (separatorIndex <= 0) {
    return '<redacted>'
  }
  const prefix = trimmed.slice(0, separatorIndex)
  return `${prefix}:<redacted>`
}

/**
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */
function normalizeEnvValue(key, value) {
  const trimmed = value.trim()
  if (key === 'CONVEX_DEPLOYMENT') {
    return normalizeDeploymentValue(trimmed)
  }
  if (key === 'CONVEX_DEPLOY_KEY') {
    return '<redacted>'
  }
  if (key === 'VITE_CONVEX_URL' || key === 'CONVEX_CLOUD_URL') {
    return trimmed
  }
  if (
    key.endsWith('_KEY') ||
    key.endsWith('_TOKEN') ||
    key.includes('SECRET') ||
    key.includes('PASSWORD')
  ) {
    return '<redacted>'
  }
  return trimmed
}

/**
 * @param {Record<string, string>} entries
 * @returns {string[]}
 */
export function normalizeDaytonaEnvEntries(entries) {
  return Object.keys(entries)
    .sort((left, right) => left.localeCompare(right))
    .map(key => `${key}=${normalizeEnvValue(key, entries[key] ?? '')}`)
}

/**
 * @param {string} contents
 * @returns {{
 *   keys: string[]
 *   normalizedLines: string[]
 *   normalizedHash: string
 * }}
 */
export function normalizeDaytonaEnvFileContents(contents) {
  const entries = parseDotEnvFile(contents)
  const normalizedLines = normalizeDaytonaEnvEntries(entries)
  return {
    keys: Object.keys(entries).sort((left, right) => left.localeCompare(right)),
    normalizedLines,
    normalizedHash: createHash('sha256')
      .update(normalizedLines.join('\n'))
      .digest('hex'),
  }
}

/**
 * @param {string} filePath
 * @returns {{
 *   path: string
 *   exists: boolean
 *   keys: string[]
 *   normalizedLines: string[]
 *   normalizedHash: string | null
 * }}
 */
function buildEnvFileManifest(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      path: filePath,
      exists: false,
      keys: [],
      normalizedLines: [],
      normalizedHash: null,
    }
  }

  const contents = fs.readFileSync(filePath, 'utf8')
  const normalized = normalizeDaytonaEnvFileContents(contents)
  return {
    path: filePath,
    exists: true,
    keys: normalized.keys,
    normalizedLines: normalized.normalizedLines,
    normalizedHash: normalized.normalizedHash,
  }
}

/**
 * @param {string} repoDir
 * @param {string[]} args
 * @returns {string}
 */
function runGit(repoDir, args) {
  const result = spawnSync('git', ['-C', repoDir, ...args], {
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'git failed').trim())
  }
  return (result.stdout || '').trim()
}

/**
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isLocalPortListening(port) {
  /** @type {(value: boolean) => void} */
  return new Promise(resolve => {
    const socket = net.createConnection({
      host: '127.0.0.1',
      port,
    })

    /** @param {boolean} value */
    const finish = value => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }

    socket.setTimeout(1000)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

/**
 * @param {{
 *   repoDir: string
 *   appRootRelativePath: string
 *   previewPort?: number
 * }} args
 * @returns {Promise<DaytonaRuntimeManifest>}
 */
export async function collectDaytonaRuntimeManifest(args) {
  const repoDir = path.resolve(args.repoDir)
  const appRoot = path.resolve(repoDir, args.appRootRelativePath)
  /** @type {Record<string, DaytonaRuntimeEnvFileManifest>} */
  const envFiles = {}

  for (const fileName of DAYTONA_RUNTIME_ENV_FILES) {
    envFiles[fileName] = buildEnvFileManifest(path.join(appRoot, fileName))
  }

  const envLocal = envFiles['.env.local'] ?? {
    path: path.join(appRoot, '.env.local'),
    exists: false,
    keys: [],
    normalizedLines: [],
    normalizedHash: null,
  }
  const localConvexConfigured = envLocal.normalizedLines.some(
    line =>
      line.startsWith('CONVEX_DEPLOYMENT=local:') ||
      line.startsWith('VITE_CONVEX_URL=http://127.0.0.1:'),
  )

  return {
    version: 1,
    repo: {
      dir: repoDir,
      headSha: runGit(repoDir, ['rev-parse', 'HEAD']),
      status: runGit(repoDir, ['status', '--short'])
        .split('\n')
        .map(line => line.trimEnd())
        .filter(line => line.length > 0),
    },
    appRoot,
    envFiles,
    services: {
      previewPort: args.previewPort ?? 5173,
      previewPortListening: await isLocalPortListening(
        args.previewPort ?? 5173,
      ),
      localConvexConfigured,
    },
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @param {string} pathPrefix
 * @param {string[]} diffs
 */
function diffManifestValues(left, right, pathPrefix, diffs) {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      diffs.push(
        `${pathPrefix}: array length mismatch (${left.length} !== ${right.length})`,
      )
    }
    const length = Math.max(left.length, right.length)
    for (let index = 0; index < length; index += 1) {
      diffManifestValues(
        left[index],
        right[index],
        `${pathPrefix}[${index}]`,
        diffs,
      )
    }
    return
  }

  if (isObject(left) && isObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    for (const key of [...keys].sort((a, b) => a.localeCompare(b))) {
      diffManifestValues(
        left[key],
        right[key],
        pathPrefix ? `${pathPrefix}.${key}` : key,
        diffs,
      )
    }
    return
  }

  if (left !== right) {
    diffs.push(
      `${pathPrefix}: ${JSON.stringify(left)} !== ${JSON.stringify(right)}`,
    )
  }
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @returns {string[]}
 */
export function diffDaytonaRuntimeManifests(left, right) {
  /** @type {string[]} */
  const diffs = []
  diffManifestValues(left, right, '', diffs)
  return diffs
}
