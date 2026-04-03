export type GitOutputReader = (command: string) => string | null;
export type GitCommandRunner = (command: string) => boolean;

const SHALLOW_GIT_REPOSITORY_OUTPUT = "true";
const FULL_GIT_REPOSITORY_OUTPUT = "false";

export function parsePositiveInteger(
  value: string | null | undefined,
): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function readIsShallowGitRepository(
  readGitOutput: GitOutputReader,
): boolean | null {
  const output = readGitOutput("git rev-parse --is-shallow-repository");
  if (output === SHALLOW_GIT_REPOSITORY_OUTPUT) {
    return true;
  }
  if (output === FULL_GIT_REPOSITORY_OUTPUT) {
    return false;
  }
  return null;
}

/**
 * A shallow clone makes `git rev-list --count HEAD` lie as `1`, so only trust
 * the ancestry count after the checkout confirms full history.
 */
function ensureFullGitHistory(args: {
  readGitOutput: GitOutputReader;
  runGitCommand: GitCommandRunner;
}): boolean {
  const initialShallowState = readIsShallowGitRepository(args.readGitOutput);
  if (initialShallowState !== true) {
    return initialShallowState !== null;
  }

  for (const command of [
    "git fetch --quiet --unshallow origin",
    "git fetch --quiet --depth=2147483647 origin",
  ]) {
    args.runGitCommand(command);
    if (readIsShallowGitRepository(args.readGitOutput) === false) {
      return true;
    }
  }

  return false;
}

export function resolveAppCommitNumber(args: {
  envCommitNumber: string | null | undefined;
  readGitOutput: GitOutputReader;
  runGitCommand: GitCommandRunner;
}): number | null {
  const envCommitNumber = parsePositiveInteger(args.envCommitNumber);
  if (envCommitNumber !== null) {
    return envCommitNumber;
  }

  if (!ensureFullGitHistory(args)) {
    return null;
  }

  return parsePositiveInteger(args.readGitOutput("git rev-list --count HEAD"));
}
