#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// MARK: - Types

type ConnectOptions = {
  once: boolean;
  dryRun: boolean;
  label: string;
  intervalSeconds: number;
  prNumber: number | null;
  showHelp: boolean;
};

type PullRequestLabel = {
  name: string;
};

type PullRequestRepositoryRef = {
  name: string;
} | null;

type PullRequestRepositoryOwnerRef = {
  login: string;
} | null;

type PullRequestSummary = {
  number: number;
  title: string;
  body: string;
  headRefName: string;
  headRefOid: string;
  headRepository: PullRequestRepositoryRef;
  headRepositoryOwner: PullRequestRepositoryOwnerRef;
  url: string;
  isDraft: boolean;
  labels: PullRequestLabel[];
};

type SamebaseOriginMarker = {
  source: string;
  mode: string;
  firstMessage: string;
  requestedModel: string;
  requestedReasoningEffort: string;
  repositoryFullName: string;
  headRefName: string;
  samebaseThreadId?: string;
};

type MarkerValidationResult =
  | {
      ok: true;
      marker: SamebaseOriginMarker;
    }
  | {
      ok: false;
      reason: string;
    };

type HandledRunRecord = {
  status: "succeeded" | "failed";
  prNumber: number;
  headRefName: string;
  headRefOid: string;
  claimedAt: string;
  finishedAt: string;
  runId: string;
  worktreePath: string;
  artifactDir: string;
  requestedModel: string;
  requestedReasoningEffort: string;
  error?: string;
  remoteHeadAfterRun?: string;
};

type InvalidRunRecord = {
  notedAt: string;
  prNumber: number;
  headRefOid: string;
  reason: string;
};

type ConnectState = {
  version: 1;
  handledRuns: Record<string, HandledRunRecord>;
  failedRuns: Record<string, HandledRunRecord>;
  invalidRuns: Record<string, InvalidRunRecord>;
};

// MARK: - Constants

const DEFAULT_LABEL = "research";
const DEFAULT_INTERVAL_SECONDS = 60;
const FAILED_RUN_RETRY_COOLDOWN_MS = 15 * 60 * 1000;
const SAFE_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ALLOWED_REASONING_EFFORTS = ["low", "medium", "high", "xhigh"];
const MARKER_PREFIX = "<!-- samebase-origin:v1 ";
const MARKER_SUFFIX = " -->";
const HELP_TEXT = `Usage: scripts/samebase-pr-connect.ts [options]

Poll GitHub PRs for explicit samebase-origin metadata and launch local Codex runs.

Options:
  --once               Run one polling cycle and exit.
  --dry-run            Print decisions without mutating GitHub or launching Codex.
  --label <name>       Required PR label. Default: research
  --interval <seconds> Poll interval for watch mode. Default: 60
  --pr <number>        Limit processing to a specific PR number.
  -h, --help           Show this help message.
`;

// MARK: - Bootstrap

const options = parseArgs(process.argv.slice(2));
if (options.showHelp) {
  console.log(HELP_TEXT);
  process.exit(0);
}

const repoRoot = resolveRepoRoot();
const repoFullName = resolveRepositoryFullName(repoRoot);
const stateRoot = path.join(os.homedir(), ".codex", "samebase-connect");
const worktreesRoot = path.join(stateRoot, "worktrees");
const runsRoot = path.join(stateRoot, "runs");
const statePath = path.join(stateRoot, "state.json");
const repositoryPathSegment = sanitizePathSegment(repoFullName.replace("/", "-"));

let stopRequested: boolean = false;
process.on("SIGINT", () => {
  stopRequested = true;
});
process.on("SIGTERM", () => {
  stopRequested = true;
});

await main();

// MARK: - Main Loop

async function main() {
  const state = loadState();
  if (options.once) {
    await processCycle(state);
    persistState(state);
    return;
  }

  console.log(
    `[connect] Watching ${repoFullName} every ${options.intervalSeconds}s for label "${options.label}"`,
  );
  while (!shouldStop()) {
    try {
      await processCycle(state);
    } catch (error) {
      console.error(`[connect] Cycle failed: ${describeError(error)}`);
    }
    persistState(state);
    if (shouldStop()) {
      break;
    }
    await sleep(options.intervalSeconds * 1000);
  }
}

function resolveRepoRoot(): string {
  return runCommand("git", ["rev-parse", "--show-toplevel"]).trim();
}

function resolveRepositoryFullName(root: string): string {
  const remoteUrl = runCommand("git", ["remote", "get-url", "origin"], {
    cwd: root,
  }).trim();
  const sshMatch = remoteUrl.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  const httpsMatch = remoteUrl.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  throw new Error(`Unsupported GitHub remote URL: ${remoteUrl}`);
}

function parseArgs(args: string[]): ConnectOptions {
  const result: ConnectOptions = {
    once: false,
    dryRun: false,
    label: DEFAULT_LABEL,
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    prNumber: null,
    showHelp: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--once") {
      result.once = true;
      continue;
    }
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (arg === "--label") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        exitWithError(`Missing value for ${arg}\n\n${HELP_TEXT}`);
      }
      result.label = value;
      index += 1;
      continue;
    }
    if (arg === "--interval") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        exitWithError(`Missing value for ${arg}\n\n${HELP_TEXT}`);
      }
      const intervalSeconds = Number.parseInt(value, 10);
      if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
        exitWithError(`Invalid interval: ${value}`);
      }
      result.intervalSeconds = intervalSeconds;
      index += 1;
      continue;
    }
    if (arg === "--pr") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        exitWithError(`Missing value for ${arg}\n\n${HELP_TEXT}`);
      }
      const prNumber = Number.parseInt(value, 10);
      if (!Number.isFinite(prNumber) || prNumber <= 0) {
        exitWithError(`Invalid pull request number: ${value}`);
      }
      result.prNumber = prNumber;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      result.showHelp = true;
      continue;
    }

    exitWithError(`Unknown argument: ${arg}\n\n${HELP_TEXT}`);
  }

  return result;
}

// MARK: - Local State

function loadState(): ConnectState {
  if (!fs.existsSync(statePath)) {
    return {
      version: 1,
      handledRuns: {},
      failedRuns: {},
      invalidRuns: {},
    };
  }

  const raw = fs.readFileSync(statePath, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Could not parse state file ${statePath}: ${describeError(error)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Unexpected state shape in ${statePath}`);
  }

  const parsedRecord = parsed as Record<string, unknown>;
  if (
    parsedRecord["version"] !== 1 ||
    typeof parsedRecord["handledRuns"] !== "object" ||
    parsedRecord["handledRuns"] === null ||
    Array.isArray(parsedRecord["handledRuns"]) ||
    (parsedRecord["failedRuns"] !== undefined &&
      (typeof parsedRecord["failedRuns"] !== "object" ||
        parsedRecord["failedRuns"] === null ||
        Array.isArray(parsedRecord["failedRuns"]))) ||
    typeof parsedRecord["invalidRuns"] !== "object" ||
    parsedRecord["invalidRuns"] === null ||
    Array.isArray(parsedRecord["invalidRuns"])
  ) {
    throw new Error(`Unexpected state shape in ${statePath}`);
  }

  return {
    version: 1,
    handledRuns: parsedRecord["handledRuns"] as Record<string, HandledRunRecord>,
    failedRuns:
      parsedRecord["failedRuns"] === undefined
        ? {}
        : (parsedRecord["failedRuns"] as Record<string, HandledRunRecord>),
    invalidRuns: parsedRecord["invalidRuns"] as Record<string, InvalidRunRecord>,
  };
}

function persistState(state: ConnectState): void {
  if (options.dryRun) {
    return;
  }
  fs.mkdirSync(stateRoot, { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function processCycle(state: ConnectState): Promise<void> {
  const pullRequests = listOpenPullRequests();
  for (const pullRequest of pullRequests) {
    if (stopRequested) {
      break;
    }
    if (options.prNumber !== null && pullRequest.number !== options.prNumber) {
      continue;
    }
    if (!pullRequest.labels.some(({ name }) => name === options.label)) {
      continue;
    }

    const runKey = buildRunKey(pullRequest);
    if (Object.hasOwn(state.handledRuns, runKey)) {
      continue;
    }
    const failedRunRecord = Object.hasOwn(state.failedRuns, runKey)
      ? state.failedRuns[runKey]
      : null;
    if (
      failedRunRecord !== null &&
      shouldDelayFailedRunRetry(failedRunRecord.finishedAt, new Date())
    ) {
      continue;
    }

    const validation = validateOriginMarker(pullRequest);
    if (!validation.ok) {
      const existingInvalid = Object.hasOwn(state.invalidRuns, runKey)
        ? state.invalidRuns[runKey]
        : null;
      // Avoid posting the same "missing contract" comment every polling cycle.
      if (existingInvalid !== null && existingInvalid.reason === validation.reason) {
        continue;
      }

      if (options.dryRun) {
        console.log(`[connect] Would skip PR #${pullRequest.number}: ${validation.reason}`);
        continue;
      }

      console.log(`[connect] Skipping PR #${pullRequest.number}: ${validation.reason}`);
      tryPostPullRequestComment(
        pullRequest.number,
        buildInvalidContractComment(pullRequest, validation.reason),
      );
      state.invalidRuns[runKey] = {
        notedAt: new Date().toISOString(),
        prNumber: pullRequest.number,
        headRefOid: pullRequest.headRefOid,
        reason: validation.reason,
      };
      continue;
    }

    await handleValidPullRequest(pullRequest, validation.marker, state);
  }
}

// MARK: - GitHub PR Discovery

function listOpenPullRequests(): PullRequestSummary[] {
  const pullRequests: PullRequestSummary[] = [];
  let page = 1;
  let pageResultCount = 100;
  while (pageResultCount === 100) {
    const pageResults = listOpenPullRequestPage(page);
    pullRequests.push(...pageResults);
    pageResultCount = pageResults.length;
    page += 1;
  }

  return pullRequests;
}

/**
 * Keep paging through GitHub's open PR list so the runner does not silently
 * miss labeled targets when the repository has more than 100 open PRs.
 */
function listOpenPullRequestPage(page: number): PullRequestSummary[] {
  const stdout = runCommand(
    "gh",
    [
      "api",
      `repos/${repoFullName}/pulls`,
      "--method",
      "GET",
      "--field",
      "state=open",
      "--field",
      `page=${page}`,
      "--field",
      "per_page=100",
    ],
    { cwd: repoRoot },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Could not parse gh api pulls output: ${describeError(error)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Expected gh api pulls to return an array");
  }

  return parsed.map(normalizePullRequestSummary);
}

function normalizePullRequestSummary(value: unknown): PullRequestSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected gh api pulls to return pull request objects");
  }

  const record = value as Record<string, unknown>;
  const head = normalizePullRequestHead(record["head"]);
  const labels = normalizePullRequestLabels(record["labels"]);
  const body = record["body"];
  if (
    typeof record["number"] !== "number" ||
    typeof record["title"] !== "string" ||
    (body !== null && typeof body !== "string") ||
    typeof record["html_url"] !== "string" ||
    typeof record["draft"] !== "boolean"
  ) {
    throw new Error("Expected gh api pulls to return pull request objects");
  }

  return {
    number: record["number"],
    title: record["title"],
    body: body ?? "",
    headRefName: head.headRefName,
    headRefOid: head.headRefOid,
    headRepository: head.headRepository,
    headRepositoryOwner: head.headRepositoryOwner,
    url: record["html_url"],
    isDraft: record["draft"],
    labels,
  };
}

function normalizePullRequestLabels(value: unknown): PullRequestLabel[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected gh api pulls to return label arrays");
  }

  return value.map((labelValue) => {
    const label: unknown = labelValue;
    if (!label || typeof label !== "object" || Array.isArray(label)) {
      throw new Error("Expected gh api pulls to return label objects");
    }

    const record = label as Record<string, unknown>;
    if (typeof record["name"] !== "string") {
      throw new Error("Expected gh api pulls to return label objects");
    }

    return { name: record["name"] };
  });
}

function normalizePullRequestHead(value: unknown): {
  headRefName: string;
  headRefOid: string;
  headRepository: PullRequestRepositoryRef;
  headRepositoryOwner: PullRequestRepositoryOwnerRef;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected gh api pulls to return head objects");
  }

  const record = value as Record<string, unknown>;
  if (typeof record["ref"] !== "string" || typeof record["sha"] !== "string") {
    throw new Error("Expected gh api pulls to return head objects");
  }

  const repository = normalizePullRequestRepository(record["repo"]);
  return {
    headRefName: record["ref"],
    headRefOid: record["sha"],
    headRepository: repository.headRepository,
    headRepositoryOwner: repository.headRepositoryOwner,
  };
}

function normalizePullRequestRepository(value: unknown): {
  headRepository: PullRequestRepositoryRef;
  headRepositoryOwner: PullRequestRepositoryOwnerRef;
} {
  if (value === null) {
    return {
      headRepository: null,
      headRepositoryOwner: null,
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected gh api pulls to return repository objects");
  }

  const record = value as Record<string, unknown>;
  const repositoryName = typeof record["name"] === "string" ? record["name"] : null;
  const repositoryOwner = normalizePullRequestRepositoryOwner(record["owner"]);
  return {
    headRepository: repositoryName === null ? null : { name: repositoryName },
    headRepositoryOwner: repositoryOwner,
  };
}

function normalizePullRequestRepositoryOwner(value: unknown): PullRequestRepositoryOwnerRef {
  if (value === null) {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected gh api pulls to return owner objects");
  }

  const record = value as Record<string, unknown>;
  return typeof record["login"] === "string" ? { login: record["login"] } : null;
}

function readHeadRepositoryFullName(pullRequest: PullRequestSummary): string | null {
  const repositoryName = pullRequest.headRepository?.name;
  const repositoryOwner = pullRequest.headRepositoryOwner?.login;
  if (!repositoryName || !repositoryOwner) {
    return null;
  }

  return `${repositoryOwner}/${repositoryName}`;
}

function buildRunKey(pullRequest: PullRequestSummary): string {
  return `${repoFullName}#${pullRequest.number}@${pullRequest.headRefOid}`;
}

function validateOriginMarker(pullRequest: PullRequestSummary): MarkerValidationResult {
  // Treat the PR body marker as the cross-system contract. We do not infer this
  // from Samebase chat state or branch naming.
  const extractedMarker = extractOriginMarkerJson(pullRequest.body);
  if (!extractedMarker.ok) {
    return {
      ok: false,
      reason: extractedMarker.reason,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractedMarker.json);
  } catch (error) {
    return {
      ok: false,
      reason: `invalid samebase-origin JSON: ${describeError(error)}`,
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      reason: "samebase-origin marker must decode to a JSON object",
    };
  }

  const marker = parsed as Record<string, unknown>;
  const requiredStringFields = [
    "source",
    "mode",
    "firstMessage",
    "requestedModel",
    "requestedReasoningEffort",
    "repositoryFullName",
    "headRefName",
  ];
  for (const fieldName of requiredStringFields) {
    if (typeof marker[fieldName] !== "string" || marker[fieldName].trim().length === 0) {
      return {
        ok: false,
        reason: `samebase-origin marker is missing required string field "${fieldName}"`,
      };
    }
  }

  const requestedModel = String(marker["requestedModel"]);
  if (!SAFE_MODEL_PATTERN.test(requestedModel)) {
    return {
      ok: false,
      reason: `samebase-origin requestedModel "${requestedModel}" contains unsupported characters`,
    };
  }

  const requestedReasoningEffort = String(marker["requestedReasoningEffort"]);
  if (!ALLOWED_REASONING_EFFORTS.includes(requestedReasoningEffort)) {
    return {
      ok: false,
      reason: `samebase-origin requestedReasoningEffort "${requestedReasoningEffort}" is unsupported`,
    };
  }

  if (marker["source"] !== "samebase_ui") {
    return {
      ok: false,
      reason: `samebase-origin source must be "samebase_ui" (got "${String(marker["source"])}")`,
    };
  }

  if (marker["mode"] !== "research") {
    return {
      ok: false,
      reason: `samebase-origin mode must be "research" (got "${String(marker["mode"])}")`,
    };
  }

  if (marker["repositoryFullName"] !== repoFullName) {
    return {
      ok: false,
      reason:
        `samebase-origin repositoryFullName "${String(marker["repositoryFullName"])}" ` +
        `does not match current repo "${repoFullName}"`,
    };
  }

  if (marker["headRefName"] !== pullRequest.headRefName) {
    return {
      ok: false,
      reason:
        `samebase-origin headRefName "${String(marker["headRefName"])}" ` +
        `does not match PR head "${pullRequest.headRefName}"`,
    };
  }

  return {
    ok: true,
    marker: marker as SamebaseOriginMarker,
  };
}

// MARK: - Run Orchestration

async function handleValidPullRequest(
  pullRequest: PullRequestSummary,
  marker: SamebaseOriginMarker,
  state: ConnectState,
): Promise<void> {
  const runKey = buildRunKey(pullRequest);
  const runId = buildRunId(pullRequest);
  const runStartAt = new Date().toISOString();
  const worktreePath = buildWorktreePath(pullRequest);
  const artifactDir = path.join(
    runsRoot,
    repositoryPathSegment,
    `pr-${pullRequest.number}`,
    `${timestampForPath(runStartAt)}-${sanitizePathSegment(pullRequest.headRefOid)}`,
  );

  if (options.dryRun) {
    // Dry-run computes the same deterministic paths but stops before mutating
    // local git state, GitHub, or Codex state.
    console.log(
      `[connect] Would run PR #${pullRequest.number} in ${worktreePath} ` +
        `with model ${marker.requestedModel} / effort ${marker.requestedReasoningEffort}`,
    );
    return;
  }

  const handledRecord: HandledRunRecord = {
    status: "failed",
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
  };

  try {
    ensureWorktreeForPullRequest(pullRequest);
    fs.mkdirSync(artifactDir, { recursive: true });
    console.log(
      `[connect] Claiming PR #${pullRequest.number} as ${runId} ` +
        `(${marker.requestedModel}, ${marker.requestedReasoningEffort})`,
    );
    tryPostPullRequestComment(
      pullRequest.number,
      buildClaimComment({
        pullRequest,
        marker,
        runId,
      }),
    );
    const result = runCodexForPullRequest({
      pullRequest,
      marker,
      runId,
      worktreePath,
      artifactDir,
    });
    handledRecord.finishedAt = new Date().toISOString();
    handledRecord.status = result.exitCode === 0 ? "succeeded" : "failed";
    handledRecord.remoteHeadAfterRun = fetchPullRequestHeadOid(pullRequest.number);
    if (result.exitCode !== 0) {
      handledRecord.error = `codex exec exited with status ${result.exitCode}`;
    }
    // Persist successful SHAs before commenting so a transient GitHub comment
    // failure still prevents duplicate executions for the same completed head.
    if (handledRecord.status === "succeeded") {
      recordHandledRun(state, runKey, handledRecord);
      delete state.failedRuns[runKey];
    } else {
      recordFailedRun(state, runKey, handledRecord);
    }
    tryPostPullRequestComment(
      pullRequest.number,
      buildCompletionComment({
        pullRequest,
        runId,
        exitCode: result.exitCode,
        remoteHeadAfterRun: handledRecord.remoteHeadAfterRun,
      }),
    );
  } catch (error) {
    handledRecord.finishedAt = new Date().toISOString();
    handledRecord.status = "failed";
    handledRecord.error = describeError(error);
    handledRecord.remoteHeadAfterRun = tryFetchPullRequestHeadOid(pullRequest.number);
    recordFailedRun(state, runKey, handledRecord);
    tryPostPullRequestComment(
      pullRequest.number,
      buildFailureComment({
        pullRequest,
        runId,
      }),
    );
    console.error(`[connect] PR #${pullRequest.number} failed: ${handledRecord.error}`);
  }
}

function buildWorktreePath(pullRequest: PullRequestSummary): string {
  return path.join(
    worktreesRoot,
    repositoryPathSegment,
    `pr-${pullRequest.number}-${sanitizePathSegment(pullRequest.headRefName)}`,
    "samebase",
  );
}

// MARK: - Worktree Management

function ensureWorktreeForPullRequest(pullRequest: PullRequestSummary): string {
  const headRepositoryFullName = readHeadRepositoryFullName(pullRequest);
  if (headRepositoryFullName !== repoFullName) {
    throw new Error(
      `PR #${pullRequest.number} head repository ${headRepositoryFullName ?? "(unknown)"} does not match origin ${repoFullName}`,
    );
  }

  const worktreeDir = buildWorktreePath(pullRequest);
  const branchRef = `refs/heads/${pullRequest.headRefName}`;
  const existingWorktree = findWorktreeByBranch(branchRef);
  // Fail closed if the PR branch is already checked out somewhere else. The
  // watcher should not guess which worktree owns it.
  if (existingWorktree && path.resolve(existingWorktree) !== path.resolve(worktreeDir)) {
    throw new Error(
      `Branch ${pullRequest.headRefName} is already checked out at ${existingWorktree}`,
    );
  }

  // Always refresh from origin first so we fast-forward onto the PR head the
  // watcher actually observed.
  runCommand("git", ["fetch", "origin", pullRequest.headRefName], {
    cwd: repoRoot,
  });

  if (!fs.existsSync(worktreeDir)) {
    fs.mkdirSync(path.dirname(worktreeDir), { recursive: true });
    if (localBranchExists(pullRequest.headRefName)) {
      runCommand("git", ["worktree", "add", worktreeDir, pullRequest.headRefName], {
        cwd: repoRoot,
      });
    } else {
      runCommand(
        "git",
        [
          "worktree",
          "add",
          "-b",
          pullRequest.headRefName,
          worktreeDir,
          `origin/${pullRequest.headRefName}`,
        ],
        { cwd: repoRoot },
      );
    }
    runCommand(
      "git",
      [
        "-C",
        worktreeDir,
        "branch",
        "--set-upstream-to",
        `origin/${pullRequest.headRefName}`,
        pullRequest.headRefName,
      ],
      { cwd: repoRoot },
    );
  }

  const dirtyStatus = runCommand("git", ["-C", worktreeDir, "status", "--short"], {
    cwd: repoRoot,
  });
  if (dirtyStatus.trim().length > 0) {
    throw new Error(`Worktree ${worktreeDir} is dirty; refusing to reuse it automatically`);
  }

  runCommand("git", ["-C", worktreeDir, "switch", pullRequest.headRefName], {
    cwd: repoRoot,
  });
  runCommand("git", ["-C", worktreeDir, "fetch", "origin", pullRequest.headRefName], {
    cwd: repoRoot,
  });
  runCommand("git", ["-C", worktreeDir, "reset", "--hard", `origin/${pullRequest.headRefName}`], {
    cwd: repoRoot,
  });

  return worktreeDir;
}

function localBranchExists(branchName: string): boolean {
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], {
    cwd: repoRoot,
    stdio: "ignore",
  });
  return result.status === 0;
}

function findWorktreeByBranch(branchRef: string): string | null {
  const stdout = runCommand("git", ["worktree", "list", "--porcelain"], {
    cwd: repoRoot,
  });
  const blocks = stdout.split("\n\n").filter((block) => block.trim().length > 0);
  for (const block of blocks) {
    const lines = block.split("\n");
    let worktreePath = null;
    let currentBranch = null;
    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        worktreePath = line.slice("worktree ".length);
        continue;
      }
      if (line.startsWith("branch ")) {
        currentBranch = line.slice("branch ".length);
      }
    }
    if (worktreePath && currentBranch === branchRef) {
      return worktreePath;
    }
  }
  return null;
}

// MARK: - Codex Execution

function runCodexForPullRequest(params: {
  pullRequest: PullRequestSummary;
  marker: SamebaseOriginMarker;
  runId: string;
  worktreePath: string;
  artifactDir: string;
}): { exitCode: number } {
  const eventsPath = path.join(params.artifactDir, "events.jsonl");
  const lastMessagePath = path.join(params.artifactDir, "last-message.md");
  const prompt = buildCodexPrompt(params);
  const eventsFd = fs.openSync(eventsPath, "w");

  try {
    const result = spawnSync(
      "codex",
      [
        "exec",
        "--ask-for-approval",
        "never",
        "--sandbox",
        "workspace-write",
        "--json",
        "--output-last-message",
        lastMessagePath,
        "-C",
        params.worktreePath,
        "-c",
        `model="${params.marker.requestedModel}"`,
        "-c",
        `model_reasoning_effort="${params.marker.requestedReasoningEffort}"`,
        "-",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        input: prompt,
        stdio: ["pipe", eventsFd, "inherit"],
      },
    );
    if (result.error) {
      throw result.error;
    }
    return {
      exitCode: result.status ?? 1,
    };
  } finally {
    fs.closeSync(eventsFd);
  }
}

function buildCodexPrompt(params: {
  pullRequest: PullRequestSummary;
  marker: SamebaseOriginMarker;
  runId: string;
  worktreePath: string;
  artifactDir: string;
}): string {
  const markerText = `${MARKER_PREFIX}${JSON.stringify(params.marker)}${MARKER_SUFFIX}`;
  return [
    "A draft PR created from samebase.com UI was claimed by a local `pnpm connect` run.",
    "",
    `Repository: ${repoFullName}`,
    `PR: #${params.pullRequest.number} ${params.pullRequest.url}`,
    `Head branch: ${params.pullRequest.headRefName}`,
    `Local run id: ${params.runId}`,
    "",
    "Important context:",
    "- Read AGENTS.md and the current source-of-truth docs before making decisions.",
    "- Samebase Convex chat state and Codex thread state are separate systems today. Do not assume hidden shared chat history outside this prompt and the PR body.",
    "- The PR body marker below is the durable machine-readable contract for this run.",
    `- If you need to push branch updates, prefer \`git push origin HEAD:${params.pullRequest.headRefName}\`.`,
    "",
    "Requested Codex runtime:",
    `- model: ${params.marker.requestedModel}`,
    `- reasoning effort: ${params.marker.requestedReasoningEffort}`,
    "",
    "Visible first user message:",
    params.marker.firstMessage,
    "",
    // Mirror the validated marker back into the prompt so the Codex run sees
    // the same explicit contract the watcher used to decide it was safe.
    "Hidden PR body marker:",
    markerText,
    "",
    "Task:",
    "Continue the work implied by the first user message. Research the topic in depth, update the PR branch if code or docs should change, and update the PR description/comments with findings and validation.",
  ].join("\n");
}

// MARK: - GitHub PR Updates

function fetchPullRequestHeadOid(pullRequestNumber: number): string {
  const stdout = runCommand(
    "gh",
    ["pr", "view", String(pullRequestNumber), "--repo", repoFullName, "--json", "headRefOid"],
    { cwd: repoRoot },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Could not parse gh pr view output: ${describeError(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("gh pr view did not return a headRefOid string");
  }

  const parsedRecord = parsed as Record<string, unknown>;
  if (typeof parsedRecord["headRefOid"] !== "string") {
    throw new Error("gh pr view did not return a headRefOid string");
  }

  return parsedRecord["headRefOid"];
}

function postPullRequestComment(pullRequestNumber: number, body: string): void {
  runCommand(
    "gh",
    ["pr", "comment", String(pullRequestNumber), "--repo", repoFullName, "--body-file", "-"],
    {
      cwd: repoRoot,
      input: body,
    },
  );
}

function tryPostPullRequestComment(pullRequestNumber: number, body: string): void {
  try {
    postPullRequestComment(pullRequestNumber, body);
  } catch (error) {
    console.error(
      `[connect] Could not post comment to PR #${pullRequestNumber}: ${describeError(error)}`,
    );
  }
}

// MARK: - Comment Bodies

function buildClaimComment(params: {
  pullRequest: PullRequestSummary;
  marker: SamebaseOriginMarker;
  runId: string;
}): string {
  return [
    "Local `pnpm connect` claimed this PR.",
    "",
    `- host: \`${os.hostname()}\``,
    `- local run id: \`${params.runId}\``,
    `- head branch: \`${params.pullRequest.headRefName}\``,
    `- requested model: \`${params.marker.requestedModel}\``,
    `- requested reasoning effort: \`${params.marker.requestedReasoningEffort}\``,
    "",
    "The worktree and artifacts live on the operator machine; raw local filesystem paths are intentionally not posted back to GitHub.",
  ].join("\n");
}

function buildInvalidContractComment(pullRequest: PullRequestSummary, reason: string): string {
  return [
    "Local `pnpm connect` skipped this PR because the automation contract is incomplete.",
    "",
    `- PR: #${pullRequest.number}`,
    `- required label: \`${options.label}\``,
    `- error: ${reason}`,
    "",
    "Current runner contract:",
    `- visible label: \`${options.label}\``,
    "- hidden body marker: `<!-- samebase-origin:v1 {...} -->`",
    "- required marker fields: `source`, `mode`, `firstMessage`, `requestedModel`, `requestedReasoningEffort`, `repositoryFullName`, `headRefName`",
    "",
    "Nothing was launched.",
  ].join("\n");
}

function buildCompletionComment(params: {
  pullRequest: PullRequestSummary;
  runId: string;
  exitCode: number;
  remoteHeadAfterRun: string;
}): string {
  const lines = [
    "Local `pnpm connect` run finished.",
    "",
    `- host: \`${os.hostname()}\``,
    `- local run id: \`${params.runId}\``,
    `- status: \`${params.exitCode === 0 ? "succeeded" : "failed"}\``,
    `- exit code: \`${params.exitCode}\``,
    `- PR head after run: \`${params.remoteHeadAfterRun}\``,
    "",
    "The operator can inspect the local run artifacts if deeper debugging is needed.",
  ];
  return lines.join("\n");
}

function buildFailureComment(params: { pullRequest: PullRequestSummary; runId: string }): string {
  return [
    "Local `pnpm connect` run failed before completion.",
    "",
    `- host: \`${os.hostname()}\``,
    `- local run id: \`${params.runId}\``,
    `- PR: #${params.pullRequest.number}`,
    `- result: \`local execution failed\``,
    "",
    "The operator can inspect the local run artifacts and retry after fixing the issue.",
  ].join("\n");
}

// MARK: - Formatting Helpers

function buildRunId(pullRequest: PullRequestSummary): string {
  return `pr-${pullRequest.number}-${timestampForPath(new Date().toISOString())}`;
}

function timestampForPath(value: string): string {
  return value.replaceAll(/[:.-]/g, "");
}

function sanitizePathSegment(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 80) : "run";
}

/**
 * Persist both the observed pre-run head SHA and any post-run head SHA so a
 * successful local push does not cause the watcher to immediately claim the
 * same PR again on the next polling cycle.
 */
function recordHandledRun(state: ConnectState, runKey: string, record: HandledRunRecord): void {
  state.handledRuns[runKey] = record;
  delete state.failedRuns[runKey];
  if (
    typeof record.remoteHeadAfterRun === "string" &&
    record.remoteHeadAfterRun.length > 0 &&
    record.remoteHeadAfterRun !== record.headRefOid
  ) {
    state.handledRuns[`${repoFullName}#${record.prNumber}@${record.remoteHeadAfterRun}`] = {
      ...record,
      headRefOid: record.remoteHeadAfterRun,
    };
  }
}

/**
 * Persist failed attempts separately so operators can retry the same PR head
 * without editing state by hand, while still keeping a cooldown window for the
 * long-running watcher.
 */
function recordFailedRun(state: ConnectState, runKey: string, record: HandledRunRecord): void {
  state.failedRuns[runKey] = record;
}

/**
 * Watch mode should back off after a failed run instead of hammering the same
 * SHA every interval, but one-shot invocations should stay retryable.
 */
function shouldDelayFailedRunRetry(finishedAt: string, now: Date): boolean {
  if (options.once) {
    return false;
  }

  const finishedAtMs = Date.parse(finishedAt);
  if (!Number.isFinite(finishedAtMs)) {
    return false;
  }

  return now.getTime() - finishedAtMs < FAILED_RUN_RETRY_COOLDOWN_MS;
}

// MARK: - Command Utilities

function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    input?: string;
  } = {},
): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        stdout.length > 0 ? `stdout:\n${stdout}` : null,
        stderr.length > 0 ? `stderr:\n${stderr}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }
  return result.stdout;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function extractOriginMarkerJson(
  body: string,
): { ok: true; json: string } | { ok: false; reason: string } {
  const lines = body.split("\n");
  let insideCodeFence = false;
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("```") || trimmedLine.startsWith("~~~")) {
      insideCodeFence = !insideCodeFence;
      continue;
    }
    if (insideCodeFence) {
      continue;
    }
    if (!trimmedLine.startsWith(MARKER_PREFIX)) {
      continue;
    }

    // Require a standalone marker line so inline code examples do not count as
    // real automation contracts.
    if (!trimmedLine.endsWith(MARKER_SUFFIX)) {
      return {
        ok: false,
        reason: "samebase-origin marker is missing the closing `-->` delimiter",
      };
    }

    return {
      ok: true,
      json: trimmedLine.slice(MARKER_PREFIX.length, trimmedLine.length - MARKER_SUFFIX.length),
    };
  }

  return {
    ok: false,
    reason: "missing hidden `<!-- samebase-origin:v1 {...} -->` marker in the PR body",
  };
}

// MARK: - Process Helpers

function shouldStop(): boolean {
  return stopRequested;
}

function tryFetchPullRequestHeadOid(pullRequestNumber: number): string | undefined {
  try {
    return fetchPullRequestHeadOid(pullRequestNumber);
  } catch (error) {
    console.error(
      `[connect] Could not refresh PR #${pullRequestNumber} head SHA: ${describeError(error)}`,
    );
    return undefined;
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function exitWithError(message: string): never {
  console.error(message);
  process.exit(1);
}
