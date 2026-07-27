import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

import {
  checkAgentPluginVersion,
  findLatestPackageChangeBase,
  isReleaseVersionGreater,
} from "./check-agent-plugin-version.ts";

function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function writePackageVersion(repoRoot: string, version: string): void {
  writeFileSync(
    path.join(repoRoot, "packages/agent-plugins/package.json"),
    `{
  "version": "${version}"
}
`,
    "utf8",
  );
}

function commit(repoRoot: string, message: string): string {
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", message]);
  return git(repoRoot, ["rev-parse", "HEAD"]);
}

describe("agent plugin release versions", () => {
  it("accepts a strictly greater numeric release version", () => {
    expect(isReleaseVersionGreater("0.2.1", "0.2.0")).toBe(true);
    expect(isReleaseVersionGreater("0.3.0", "0.2.9")).toBe(true);
    expect(isReleaseVersionGreater("1.0.0", "0.99.99")).toBe(true);
    expect(isReleaseVersionGreater("9007199254740993.0.0", "9007199254740992.0.0")).toBe(true);
  });

  it("rejects equal, lower, and non-release versions", () => {
    expect(isReleaseVersionGreater("0.2.0", "0.2.0")).toBe(false);
    expect(isReleaseVersionGreater("0.1.9", "0.2.0")).toBe(false);
    expect(() => isReleaseVersionGreater("0.2.1-beta.1", "0.2.0")).toThrow(
      "numeric major.minor.patch",
    );
  });

  it("keeps an invalid package change failed after an unrelated commit", () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), "samebase-agent-plugin-version-test-"));

    try {
      git(repoRoot, ["init", "-b", "main"]);
      git(repoRoot, ["config", "commit.gpgsign", "false"]);
      git(repoRoot, ["config", "user.name", "Agent Plugin Version Test"]);
      git(repoRoot, ["config", "user.email", "agent-plugin-version-test@example.com"]);
      mkdirSync(path.join(repoRoot, "packages/agent-plugins"), { recursive: true });
      writePackageVersion(repoRoot, "0.2.0");
      writeFileSync(path.join(repoRoot, "packages/agent-plugins/README.md"), "Initial\n", "utf8");
      const initialCommit = commit(repoRoot, "Initial package");

      writeFileSync(path.join(repoRoot, "packages/agent-plugins/README.md"), "Changed\n", "utf8");
      commit(repoRoot, "Change package without version");
      writeFileSync(path.join(repoRoot, "unrelated.txt"), "Unrelated\n", "utf8");
      commit(repoRoot, "Unrelated change");

      const baseCommit = findLatestPackageChangeBase(repoRoot);
      expect(git(repoRoot, ["rev-parse", baseCommit])).toBe(initialCommit);
      expect(() => checkAgentPluginVersion(repoRoot, baseCommit)).toThrow(
        "version 0.2.0 is not greater than 0.2.0",
      );

      writePackageVersion(repoRoot, "0.2.1");
      commit(repoRoot, "Increase package version");
      expect(checkAgentPluginVersion(repoRoot, findLatestPackageChangeBase(repoRoot))).toBe(
        "Agent plugin version increased from 0.2.0 to 0.2.1.",
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
