import { execFileSync } from "node:child_process";

/**
Compute the projected `v<N>:` app build label from the latest `origin/main`
commit count and apply it to the current branch's PR title. This turns the
most error-prone manual workflow rule (refresh the label after create, rebase,
ready, and before merge) into one deterministic command.

Usage:
  node ./scripts/pr-build-label.ts            # compute and update the PR title
  node ./scripts/pr-build-label.ts --print-only

@see docs/agent-workflows.md "Main Build Version Labels" for the full protocol,
including the squash-subject rule this script intentionally leaves manual.
*/

function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

function computeProjectedLabel(): string {
  run("git", ["fetch", "origin", "main", "--quiet"]);
  const mainCount = Number(run("git", ["rev-list", "--count", "origin/main"]));
  if (!Number.isInteger(mainCount) || mainCount <= 0) {
    throw new Error("Could not compute the origin/main commit count.");
  }
  return `v${mainCount + 1}`;
}

function readCurrentPr(): { number: number; title: string } | null {
  let raw: string;
  try {
    raw = run("gh", ["pr", "view", "--json", "number,title"]);
  } catch {
    return null;
  }
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("number" in parsed) ||
    !("title" in parsed) ||
    typeof parsed.number !== "number" ||
    typeof parsed.title !== "string"
  ) {
    throw new Error(`Unexpected gh pr view payload: ${raw}`);
  }
  return { number: parsed.number, title: parsed.title };
}

const printOnly = process.argv.includes("--print-only");
const label = computeProjectedLabel();
const pr = readCurrentPr();

if (!pr) {
  console.log(`projected label: ${label} (no PR found for the current branch)`);
  process.exit(0);
}

const bareTitle = pr.title.replace(/^v\d+:\s*/, "");
const nextTitle = `${label}: ${bareTitle}`;

if (pr.title === nextTitle) {
  console.log(`PR #${pr.number} title already current: ${nextTitle}`);
  process.exit(0);
}

if (printOnly) {
  console.log(`projected label: ${label}`);
  console.log(`PR #${pr.number} title would become: ${nextTitle}`);
  process.exit(0);
}

run("gh", ["pr", "edit", String(pr.number), "--title", nextTitle]);
console.log(`PR #${pr.number} title updated: ${nextTitle}`);
