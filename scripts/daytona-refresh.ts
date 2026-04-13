#!/usr/bin/env node
import { execFileSync, spawnSync, type StdioOptions } from "node:child_process";

const HELP_TEXT = `Usage: scripts/daytona-refresh.ts <sandbox-id-or-name> [branch] [repo-dir]

Defaults:
  branch   main
  repo-dir /home/daytona/workspace/noter

Auth:
  Uses GITHUB_TOKEN if set, otherwise falls back to \`gh auth token\`.

Optional env:
  DAYTONA_REMOTE_URL  If set, updates remote.origin.url before fetch.`;

const args = process.argv.slice(2);

if (args[0] === "-h" || args[0] === "--help") {
  console.log(HELP_TEXT);
  process.exit(0);
}

const sandbox = args[0];
if (!sandbox) {
  console.error(HELP_TEXT);
  process.exit(1);
}

const branch = args[1] ?? "main";
const repoDir = args[2] ?? "/home/daytona/workspace/noter";

main(sandbox, branch, repoDir);

function main(
  sandboxId: string,
  branchName: string,
  repositoryDir: string,
): void {
  if (!commandExists("daytona")) {
    console.error("daytona CLI not found in PATH.");
    process.exit(1);
  }

  const token = resolveGithubToken();
  if (!token) {
    console.error(
      "Missing GitHub token. Set GITHUB_TOKEN or run: gh auth login",
    );
    process.exit(1);
  }

  const remoteUrl = process.env.DAYTONA_REMOTE_URL?.trim();
  if (remoteUrl) {
    runDaytonaGit(sandboxId, repositoryDir, [
      "remote",
      "set-url",
      "origin",
      remoteUrl,
    ]);
  }

  const basicToken = Buffer.from(`x-access-token:${token}`).toString("base64");
  const authHeader = `authorization: basic ${basicToken}`;

  runDaytonaGit(sandboxId, repositoryDir, [
    "-c",
    `http.extraHeader=${authHeader}`,
    "fetch",
    "origin",
    branchName,
    "--depth=1",
  ]);
  runDaytonaGit(sandboxId, repositoryDir, [
    "checkout",
    "-f",
    "-B",
    branchName,
    "FETCH_HEAD",
  ]);
  runDaytonaGit(sandboxId, repositoryDir, ["reset", "--hard", "FETCH_HEAD"]);

  const sha = runDaytonaGit(sandboxId, repositoryDir, ["rev-parse", "HEAD"], {
    captureStdout: true,
  }).trim();
  console.log(`Refreshed ${sandboxId} (${branchName}) -> ${sha}`);
}

function commandExists(command: string): boolean {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

function resolveGithubToken(): string | null {
  const envToken = process.env.GITHUB_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }

  if (!commandExists("gh")) {
    return null;
  }

  try {
    const token = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function runDaytonaGit(
  sandboxId: string,
  repositoryDir: string,
  gitArgs: string[],
  options: { captureStdout?: boolean } = {},
): string {
  const stdio: StdioOptions = options.captureStdout
    ? ["ignore", "pipe", "inherit"]
    : "inherit";
  const output = execFileSync(
    "daytona",
    ["exec", sandboxId, "--", "git", "-C", repositoryDir, ...gitArgs],
    {
      encoding: "utf8",
      stdio,
    },
  );
  return typeof output === "string" ? output : "";
}
