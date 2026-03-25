#!/usr/bin/env node
// @ts-check
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * @typedef {{
 *   once: boolean
 *   dryRun: boolean
 *   label: string
 *   intervalSeconds: number
 *   prNumber: number | null
 *   showHelp: boolean
 * }} ConnectOptions
 *
 * @typedef {{
 *   name: string
 * }} PullRequestLabel
 *
 * @typedef {{
 *   number: number
 *   title: string
 *   body: string
 *   headRefName: string
 *   headRefOid: string
 *   url: string
 *   isDraft: boolean
 *   labels: PullRequestLabel[]
 * }} PullRequestSummary
 *
 * @typedef {{
 *   source: string
 *   mode: string
 *   firstMessage: string
 *   requestedModel: string
 *   requestedReasoningEffort: string
 *   repositoryFullName: string
 *   headRefName: string
 *   noterThreadId?: string
 * }} NoterOriginMarker
 *
 * @typedef {{
 *   ok: true
 *   marker: NoterOriginMarker
 * } | {
 *   ok: false
 *   reason: string
 * }} MarkerValidationResult
 *
 * @typedef {{
 *   status: 'succeeded' | 'failed'
 *   prNumber: number
 *   headRefName: string
 *   headRefOid: string
 *   claimedAt: string
 *   finishedAt: string
 *   runId: string
 *   worktreePath: string
 *   artifactDir: string
 *   requestedModel: string
 *   requestedReasoningEffort: string
 *   error?: string
 *   remoteHeadAfterRun?: string
 * }} HandledRunRecord
 *
 * @typedef {{
 *   notedAt: string
 *   prNumber: number
 *   headRefOid: string
 *   reason: string
 * }} InvalidRunRecord
 *
 * @typedef {{
 *   version: 1
 *   handledRuns: Record<string, HandledRunRecord>
 *   invalidRuns: Record<string, InvalidRunRecord>
 * }} ConnectState
 */

const DEFAULT_LABEL = 'research'
const DEFAULT_INTERVAL_SECONDS = 60
const MARKER_PREFIX = '<!-- noter-origin:v1 '
const MARKER_SUFFIX = ' -->'
const HELP_TEXT = `Usage: scripts/noter-pr-connect.js [options]

Poll GitHub PRs for explicit noter-origin metadata and launch local Codex runs.

Options:
  --once               Run one polling cycle and exit.
  --dry-run            Print decisions without mutating GitHub or launching Codex.
  --label <name>       Required PR label. Default: research
  --interval <seconds> Poll interval for watch mode. Default: 60
  --pr <number>        Limit processing to a specific PR number.
  -h, --help           Show this help message.
`

const options = parseArgs(process.argv.slice(2))
if (options.showHelp) {
  console.log(HELP_TEXT)
  process.exit(0)
}

const repoRoot = resolveRepoRoot()
const repoFullName = resolveRepositoryFullName(repoRoot)
const stateRoot = path.join(os.homedir(), '.codex', 'noter-connect')
const worktreesRoot = path.join(stateRoot, 'worktrees')
const runsRoot = path.join(stateRoot, 'runs')
const statePath = path.join(stateRoot, 'state.json')

/** @type {boolean} */
let stopRequested = false
process.on('SIGINT', () => {
  stopRequested = true
})
process.on('SIGTERM', () => {
  stopRequested = true
})

await main()

async function main() {
  const state = loadState()
  if (options.once) {
    await processCycle(state)
    persistState(state)
    return
  }

  console.log(
    `[connect] Watching ${repoFullName} every ${options.intervalSeconds}s for label "${options.label}"`,
  )
  while (!stopRequested) {
    await processCycle(state)
    persistState(state)
    if (stopRequested) {
      break
    }
    await sleep(options.intervalSeconds * 1000)
  }
}

/** @returns {string} */
function resolveRepoRoot() {
  return runCommand('git', ['rev-parse', '--show-toplevel']).trim()
}

/**
 * @param {string} root
 * @returns {string}
 */
function resolveRepositoryFullName(root) {
  const remoteUrl = runCommand('git', ['remote', 'get-url', 'origin'], {
    cwd: root,
  }).trim()
  const sshMatch = remoteUrl.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`
  }

  const httpsMatch = remoteUrl.match(
    /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
  )
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`
  }

  throw new Error(`Unsupported GitHub remote URL: ${remoteUrl}`)
}

/**
 * @param {string[]} args
 * @returns {ConnectOptions}
 */
function parseArgs(args) {
  /** @type {ConnectOptions} */
  const result = {
    once: false,
    dryRun: false,
    label: DEFAULT_LABEL,
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    prNumber: null,
    showHelp: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--once') {
      result.once = true
      continue
    }
    if (arg === '--dry-run') {
      result.dryRun = true
      continue
    }
    if (arg === '--label') {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        exitWithError(`Missing value for ${arg}\n\n${HELP_TEXT}`)
      }
      result.label = value
      index += 1
      continue
    }
    if (arg === '--interval') {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        exitWithError(`Missing value for ${arg}\n\n${HELP_TEXT}`)
      }
      const intervalSeconds = Number.parseInt(value, 10)
      if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
        exitWithError(`Invalid interval: ${value}`)
      }
      result.intervalSeconds = intervalSeconds
      index += 1
      continue
    }
    if (arg === '--pr') {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        exitWithError(`Missing value for ${arg}\n\n${HELP_TEXT}`)
      }
      const prNumber = Number.parseInt(value, 10)
      if (!Number.isFinite(prNumber) || prNumber <= 0) {
        exitWithError(`Invalid pull request number: ${value}`)
      }
      result.prNumber = prNumber
      index += 1
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

/** @returns {ConnectState} */
function loadState() {
  if (!fs.existsSync(statePath)) {
    return {
      version: 1,
      handledRuns: {},
      invalidRuns: {},
    }
  }

  const raw = fs.readFileSync(statePath, 'utf8')
  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Could not parse state file ${statePath}: ${describeError(error)}`,
    )
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    parsed['version'] !== 1 ||
    typeof parsed['handledRuns'] !== 'object' ||
    parsed['handledRuns'] === null ||
    Array.isArray(parsed['handledRuns']) ||
    typeof parsed['invalidRuns'] !== 'object' ||
    parsed['invalidRuns'] === null ||
    Array.isArray(parsed['invalidRuns'])
  ) {
    throw new Error(`Unexpected state shape in ${statePath}`)
  }

  return /** @type {ConnectState} */ (parsed)
}

/**
 * @param {ConnectState} state
 * @returns {void}
 */
function persistState(state) {
  if (options.dryRun) {
    return
  }
  fs.mkdirSync(stateRoot, { recursive: true })
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

/**
 * @param {ConnectState} state
 * @returns {Promise<void>}
 */
async function processCycle(state) {
  const pullRequests = listOpenPullRequests()
  for (const pullRequest of pullRequests) {
    if (stopRequested) {
      break
    }
    if (options.prNumber !== null && pullRequest.number !== options.prNumber) {
      continue
    }
    if (!pullRequest.labels.some(({ name }) => name === options.label)) {
      continue
    }

    const runKey = buildRunKey(pullRequest)
    if (state.handledRuns[runKey]) {
      continue
    }

    const validation = validateOriginMarker(pullRequest)
    if (!validation.ok) {
      const existingInvalid = state.invalidRuns[runKey]
      if (existingInvalid?.reason === validation.reason) {
        continue
      }

      if (options.dryRun) {
        console.log(
          `[connect] Would skip PR #${pullRequest.number}: ${validation.reason}`,
        )
        continue
      }

      console.log(
        `[connect] Skipping PR #${pullRequest.number}: ${validation.reason}`,
      )
      tryPostPullRequestComment(
        pullRequest.number,
        buildInvalidContractComment(pullRequest, validation.reason),
      )
      state.invalidRuns[runKey] = {
        notedAt: new Date().toISOString(),
        prNumber: pullRequest.number,
        headRefOid: pullRequest.headRefOid,
        reason: validation.reason,
      }
      continue
    }

    await handleValidPullRequest(pullRequest, validation.marker, state)
  }
}

/** @returns {PullRequestSummary[]} */
function listOpenPullRequests() {
  const stdout = runCommand(
    'gh',
    [
      'pr',
      'list',
      '--repo',
      repoFullName,
      '--state',
      'open',
      '--limit',
      '100',
      '--json',
      'number,title,body,headRefName,headRefOid,url,isDraft,labels',
    ],
    { cwd: repoRoot },
  )
  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch (error) {
    throw new Error(
      `Could not parse gh pr list output: ${describeError(error)}`,
    )
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Expected gh pr list to return an array')
  }

  return /** @type {PullRequestSummary[]} */ (parsed)
}

/**
 * @param {PullRequestSummary} pullRequest
 * @returns {string}
 */
function buildRunKey(pullRequest) {
  return `${repoFullName}#${pullRequest.number}@${pullRequest.headRefOid}`
}

/**
 * @param {PullRequestSummary} pullRequest
 * @returns {MarkerValidationResult}
 */
function validateOriginMarker(pullRequest) {
  const extractedMarker = extractOriginMarkerJson(pullRequest.body)
  if (!extractedMarker.ok) {
    return {
      ok: false,
      reason: extractedMarker.reason,
    }
  }

  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(extractedMarker.json)
  } catch (error) {
    return {
      ok: false,
      reason: `invalid noter-origin JSON: ${describeError(error)}`,
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      reason: 'noter-origin marker must decode to a JSON object',
    }
  }

  const marker = /** @type {Record<string, unknown>} */ (parsed)
  const requiredStringFields = [
    'source',
    'mode',
    'firstMessage',
    'requestedModel',
    'requestedReasoningEffort',
    'repositoryFullName',
    'headRefName',
  ]
  for (const fieldName of requiredStringFields) {
    if (
      typeof marker[fieldName] !== 'string' ||
      marker[fieldName].trim().length === 0
    ) {
      return {
        ok: false,
        reason: `noter-origin marker is missing required string field "${fieldName}"`,
      }
    }
  }

  if (marker['source'] !== 'noter_ui') {
    return {
      ok: false,
      reason: `noter-origin source must be "noter_ui" (got "${String(
        marker['source'],
      )}")`,
    }
  }

  if (marker['mode'] !== 'research') {
    return {
      ok: false,
      reason: `noter-origin mode must be "research" (got "${String(
        marker['mode'],
      )}")`,
    }
  }

  if (marker['repositoryFullName'] !== repoFullName) {
    return {
      ok: false,
      reason:
        `noter-origin repositoryFullName "${String(marker['repositoryFullName'])}" ` +
        `does not match current repo "${repoFullName}"`,
    }
  }

  if (marker['headRefName'] !== pullRequest.headRefName) {
    return {
      ok: false,
      reason:
        `noter-origin headRefName "${String(marker['headRefName'])}" ` +
        `does not match PR head "${pullRequest.headRefName}"`,
    }
  }

  return {
    ok: true,
    marker: /** @type {NoterOriginMarker} */ (marker),
  }
}

/**
 * @param {PullRequestSummary} pullRequest
 * @param {NoterOriginMarker} marker
 * @param {ConnectState} state
 * @returns {Promise<void>}
 */
async function handleValidPullRequest(pullRequest, marker, state) {
  const runKey = buildRunKey(pullRequest)
  const runId = buildRunId(pullRequest)
  const runStartAt = new Date().toISOString()
  const worktreePath = buildWorktreePath(pullRequest)
  const artifactDir = path.join(
    runsRoot,
    `pr-${pullRequest.number}`,
    `${timestampForPath(runStartAt)}-${sanitizePathSegment(pullRequest.headRefOid)}`,
  )

  if (options.dryRun) {
    console.log(
      `[connect] Would run PR #${pullRequest.number} in ${worktreePath} ` +
        `with model ${marker.requestedModel} / effort ${marker.requestedReasoningEffort}`,
    )
    return
  }

  ensureWorktreeForPullRequest(pullRequest)
  fs.mkdirSync(artifactDir, { recursive: true })
  console.log(
    `[connect] Claiming PR #${pullRequest.number} as ${runId} ` +
      `(${marker.requestedModel}, ${marker.requestedReasoningEffort})`,
  )
  tryPostPullRequestComment(
    pullRequest.number,
    buildClaimComment({
      pullRequest,
      marker,
      runId,
    }),
  )

  /** @type {HandledRunRecord} */
  const handledRecord = {
    status: 'failed',
    prNumber: pullRequest.number,
    headRefName: pullRequest.headRefName,
    headRefOid: pullRequest.headRefOid,
    claimedAt: runStartAt,
    finishedAt: runStartAt,
    runId,
    worktreePath,
    artifactDir,
    requestedModel: marker.requestedModel,
    requestedReasoningEffort: marker.requestedReasoningEffort,
  }

  try {
    const result = runCodexForPullRequest({
      pullRequest,
      marker,
      runId,
      worktreePath,
      artifactDir,
    })
    handledRecord.finishedAt = new Date().toISOString()
    handledRecord.status = result.exitCode === 0 ? 'succeeded' : 'failed'
    handledRecord.remoteHeadAfterRun = fetchPullRequestHeadOid(
      pullRequest.number,
    )
    if (result.exitCode !== 0) {
      handledRecord.error = `codex exec exited with status ${result.exitCode}`
    }
    state.handledRuns[runKey] = handledRecord
    tryPostPullRequestComment(
      pullRequest.number,
      buildCompletionComment({
        pullRequest,
        runId,
        exitCode: result.exitCode,
        lastMessage: result.lastMessage,
        remoteHeadAfterRun: handledRecord.remoteHeadAfterRun,
      }),
    )
  } catch (error) {
    handledRecord.finishedAt = new Date().toISOString()
    handledRecord.status = 'failed'
    handledRecord.error = describeError(error)
    state.handledRuns[runKey] = handledRecord
    tryPostPullRequestComment(
      pullRequest.number,
      buildFailureComment({
        pullRequest,
        runId,
        error: handledRecord.error,
      }),
    )
    console.error(
      `[connect] PR #${pullRequest.number} failed: ${handledRecord.error}`,
    )
  }
}

/**
 * @param {PullRequestSummary} pullRequest
 * @returns {string}
 */
function buildWorktreePath(pullRequest) {
  return path.join(
    worktreesRoot,
    `pr-${pullRequest.number}-${sanitizePathSegment(pullRequest.headRefName)}`,
    'noter',
  )
}

/**
 * @param {PullRequestSummary} pullRequest
 * @returns {string}
 */
function ensureWorktreeForPullRequest(pullRequest) {
  const worktreeDir = buildWorktreePath(pullRequest)
  const branchRef = `refs/heads/${pullRequest.headRefName}`
  const existingWorktree = findWorktreeByBranch(branchRef)
  if (
    existingWorktree &&
    path.resolve(existingWorktree) !== path.resolve(worktreeDir)
  ) {
    throw new Error(
      `Branch ${pullRequest.headRefName} is already checked out at ${existingWorktree}`,
    )
  }

  runCommand('git', ['fetch', 'origin', pullRequest.headRefName], {
    cwd: repoRoot,
  })

  if (!fs.existsSync(worktreeDir)) {
    fs.mkdirSync(path.dirname(worktreeDir), { recursive: true })
    if (localBranchExists(pullRequest.headRefName)) {
      runCommand(
        'git',
        ['worktree', 'add', worktreeDir, pullRequest.headRefName],
        {
          cwd: repoRoot,
        },
      )
    } else {
      runCommand(
        'git',
        [
          'worktree',
          'add',
          '-b',
          pullRequest.headRefName,
          worktreeDir,
          `origin/${pullRequest.headRefName}`,
        ],
        { cwd: repoRoot },
      )
    }
    runCommand(
      'git',
      [
        '-C',
        worktreeDir,
        'branch',
        '--set-upstream-to',
        `origin/${pullRequest.headRefName}`,
        pullRequest.headRefName,
      ],
      { cwd: repoRoot },
    )
  }

  const dirtyStatus = runCommand(
    'git',
    ['-C', worktreeDir, 'status', '--short'],
    {
      cwd: repoRoot,
    },
  )
  if (dirtyStatus.trim().length > 0) {
    throw new Error(
      `Worktree ${worktreeDir} is dirty; refusing to reuse it automatically`,
    )
  }

  runCommand('git', ['-C', worktreeDir, 'switch', pullRequest.headRefName], {
    cwd: repoRoot,
  })
  runCommand(
    'git',
    ['-C', worktreeDir, 'fetch', 'origin', pullRequest.headRefName],
    {
      cwd: repoRoot,
    },
  )
  runCommand(
    'git',
    [
      '-C',
      worktreeDir,
      'merge',
      '--ff-only',
      `origin/${pullRequest.headRefName}`,
    ],
    { cwd: repoRoot },
  )

  return worktreeDir
}

/**
 * @param {string} branchName
 * @returns {boolean}
 */
function localBranchExists(branchName) {
  const result = spawnSync(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`],
    {
      cwd: repoRoot,
      stdio: 'ignore',
    },
  )
  return result.status === 0
}

/**
 * @param {string} branchRef
 * @returns {string | null}
 */
function findWorktreeByBranch(branchRef) {
  const stdout = runCommand('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoRoot,
  })
  const blocks = stdout.split('\n\n').filter(block => block.trim().length > 0)
  for (const block of blocks) {
    const lines = block.split('\n')
    let worktreePath = null
    let currentBranch = null
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        worktreePath = line.slice('worktree '.length)
        continue
      }
      if (line.startsWith('branch ')) {
        currentBranch = line.slice('branch '.length)
      }
    }
    if (worktreePath && currentBranch === branchRef) {
      return worktreePath
    }
  }
  return null
}

/**
 * @param {{
 *   pullRequest: PullRequestSummary
 *   marker: NoterOriginMarker
 *   runId: string
 *   worktreePath: string
 *   artifactDir: string
 * }} params
 * @returns {{ exitCode: number, lastMessage: string }}
 */
function runCodexForPullRequest(params) {
  const eventsPath = path.join(params.artifactDir, 'events.jsonl')
  const lastMessagePath = path.join(params.artifactDir, 'last-message.md')
  const prompt = buildCodexPrompt(params)
  const eventsFd = fs.openSync(eventsPath, 'w')

  try {
    const result = spawnSync(
      'codex',
      [
        'exec',
        '--dangerously-bypass-approvals-and-sandbox',
        '--json',
        '--output-last-message',
        lastMessagePath,
        '-C',
        params.worktreePath,
        '-c',
        `model="${params.marker.requestedModel}"`,
        '-c',
        `model_reasoning_effort="${params.marker.requestedReasoningEffort}"`,
        '-',
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        input: prompt,
        stdio: ['pipe', eventsFd, 'inherit'],
      },
    )
    if (result.error) {
      throw result.error
    }

    const lastMessage = fs.existsSync(lastMessagePath)
      ? fs.readFileSync(lastMessagePath, 'utf8').trim()
      : ''
    return {
      exitCode: result.status ?? 1,
      lastMessage,
    }
  } finally {
    fs.closeSync(eventsFd)
  }
}

/**
 * @param {{
 *   pullRequest: PullRequestSummary
 *   marker: NoterOriginMarker
 *   runId: string
 *   worktreePath: string
 *   artifactDir: string
 * }} params
 * @returns {string}
 */
function buildCodexPrompt(params) {
  const markerText = `${MARKER_PREFIX}${JSON.stringify(params.marker)}${MARKER_SUFFIX}`
  return [
    'A draft PR created from noter.md UI was claimed by a local `make connect` run.',
    '',
    `Repository: ${repoFullName}`,
    `PR: #${params.pullRequest.number} ${params.pullRequest.url}`,
    `Head branch: ${params.pullRequest.headRefName}`,
    `Worktree: ${params.worktreePath}`,
    `Local run id: ${params.runId}`,
    `Artifacts directory: ${params.artifactDir}`,
    '',
    'Important context:',
    '- Read AGENTS.md and the current source-of-truth docs before making decisions.',
    '- Noter Convex chat state and Codex thread state are separate systems today. Do not assume hidden shared chat history outside this prompt and the PR body.',
    '- The PR body marker below is the durable machine-readable contract for this run.',
    `- If you need to push branch updates, prefer \`git push origin HEAD:${params.pullRequest.headRefName}\`.`,
    '',
    'Requested Codex runtime:',
    `- model: ${params.marker.requestedModel}`,
    `- reasoning effort: ${params.marker.requestedReasoningEffort}`,
    '',
    'Visible first user message:',
    params.marker.firstMessage,
    '',
    'Hidden PR body marker:',
    markerText,
    '',
    'Task:',
    'Continue the work implied by the first user message. Research the topic in depth, update the PR branch if code or docs should change, and update the PR description/comments with findings and validation.',
  ].join('\n')
}

/**
 * @param {number} pullRequestNumber
 * @returns {string}
 */
function fetchPullRequestHeadOid(pullRequestNumber) {
  const stdout = runCommand(
    'gh',
    [
      'pr',
      'view',
      String(pullRequestNumber),
      '--repo',
      repoFullName,
      '--json',
      'headRefOid',
    ],
    { cwd: repoRoot },
  )
  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch (error) {
    throw new Error(
      `Could not parse gh pr view output: ${describeError(error)}`,
    )
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    typeof parsed['headRefOid'] !== 'string'
  ) {
    throw new Error('gh pr view did not return a headRefOid string')
  }
  return parsed['headRefOid']
}

/**
 * @param {number} pullRequestNumber
 * @param {string} body
 * @returns {void}
 */
function postPullRequestComment(pullRequestNumber, body) {
  runCommand(
    'gh',
    [
      'pr',
      'comment',
      String(pullRequestNumber),
      '--repo',
      repoFullName,
      '--body-file',
      '-',
    ],
    {
      cwd: repoRoot,
      input: body,
    },
  )
}

/**
 * @param {number} pullRequestNumber
 * @param {string} body
 * @returns {void}
 */
function tryPostPullRequestComment(pullRequestNumber, body) {
  try {
    postPullRequestComment(pullRequestNumber, body)
  } catch (error) {
    console.error(
      `[connect] Could not post comment to PR #${pullRequestNumber}: ${describeError(error)}`,
    )
  }
}

/**
 * @param {{
 *   pullRequest: PullRequestSummary
 *   marker: NoterOriginMarker
 *   runId: string
 * }} params
 * @returns {string}
 */
function buildClaimComment(params) {
  return [
    'Local `make connect` claimed this PR.',
    '',
    `- host: \`${os.hostname()}\``,
    `- local run id: \`${params.runId}\``,
    `- head branch: \`${params.pullRequest.headRefName}\``,
    `- requested model: \`${params.marker.requestedModel}\``,
    `- requested reasoning effort: \`${params.marker.requestedReasoningEffort}\``,
    '',
    'The worktree and artifacts live on the operator machine; raw local filesystem paths are intentionally not posted back to GitHub.',
  ].join('\n')
}

/**
 * @param {PullRequestSummary} pullRequest
 * @param {string} reason
 * @returns {string}
 */
function buildInvalidContractComment(pullRequest, reason) {
  return [
    'Local `make connect` skipped this PR because the automation contract is incomplete.',
    '',
    `- PR: #${pullRequest.number}`,
    `- required label: \`${options.label}\``,
    `- error: ${reason}`,
    '',
    'Current runner contract:',
    `- visible label: \`${options.label}\``,
    '- hidden body marker: `<!-- noter-origin:v1 {...} -->`',
    '- required marker fields: `source`, `mode`, `firstMessage`, `requestedModel`, `requestedReasoningEffort`, `repositoryFullName`, `headRefName`',
    '',
    'Nothing was launched.',
  ].join('\n')
}

/**
 * @param {{
 *   pullRequest: PullRequestSummary
 *   runId: string
 *   exitCode: number
 *   lastMessage: string
 *   remoteHeadAfterRun: string
 * }} params
 * @returns {string}
 */
function buildCompletionComment(params) {
  const lines = [
    'Local `make connect` run finished.',
    '',
    `- host: \`${os.hostname()}\``,
    `- local run id: \`${params.runId}\``,
    `- status: \`${params.exitCode === 0 ? 'succeeded' : 'failed'}\``,
    `- exit code: \`${params.exitCode}\``,
    `- PR head after run: \`${params.remoteHeadAfterRun}\``,
    '',
    'Last assistant message excerpt:',
    '```text',
    truncateText(
      params.lastMessage || '(no final assistant message captured)',
      2000,
    ),
    '```',
  ]
  return lines.join('\n')
}

/**
 * @param {{
 *   pullRequest: PullRequestSummary
 *   runId: string
 *   error: string
 * }} params
 * @returns {string}
 */
function buildFailureComment(params) {
  return [
    'Local `make connect` run failed before completion.',
    '',
    `- host: \`${os.hostname()}\``,
    `- local run id: \`${params.runId}\``,
    `- PR: #${params.pullRequest.number}`,
    `- error: ${params.error}`,
    '',
    'The operator can inspect the local run artifacts and retry after fixing the issue.',
  ].join('\n')
}

/**
 * @param {PullRequestSummary} pullRequest
 * @returns {string}
 */
function buildRunId(pullRequest) {
  return `pr-${pullRequest.number}-${timestampForPath(new Date().toISOString())}`
}

/**
 * @param {string} value
 * @returns {string}
 */
function timestampForPath(value) {
  return value.replaceAll(/[:.-]/g, '')
}

/**
 * @param {string} value
 * @returns {string}
 */
function sanitizePathSegment(value) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned.length > 0 ? cleaned.slice(0, 80) : 'run'
}

/**
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
function truncateText(text, maxLength) {
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, maxLength - 16)}\n\n[truncated]`
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{
 *   cwd?: string
 *   input?: string
 * }} [options]
 * @returns {string}
 */
function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim()
    const stdout = String(result.stdout ?? '').trim()
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
        stdout.length > 0 ? `stdout:\n${stdout}` : null,
        stderr.length > 0 ? `stderr:\n${stderr}` : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
    )
  }
  return result.stdout
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function describeError(error) {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * @param {string} body
 * @returns {{ ok: true, json: string } | { ok: false, reason: string }}
 */
function extractOriginMarkerJson(body) {
  const markerStart = body.indexOf(MARKER_PREFIX)
  if (markerStart === -1) {
    return {
      ok: false,
      reason:
        'missing hidden `<!-- noter-origin:v1 {...} -->` marker in the PR body',
    }
  }

  const jsonStart = markerStart + MARKER_PREFIX.length
  const markerEnd = body.indexOf(MARKER_SUFFIX, jsonStart)
  if (markerEnd === -1) {
    return {
      ok: false,
      reason: 'noter-origin marker is missing the closing `-->` delimiter',
    }
  }

  return {
    ok: true,
    json: body.slice(jsonStart, markerEnd),
  }
}

/**
 * @param {number} milliseconds
 * @returns {Promise<void>}
 */
function sleep(milliseconds) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds)
  })
}

/**
 * @param {string} message
 * @returns {never}
 */
function exitWithError(message) {
  console.error(message)
  process.exit(1)
}
