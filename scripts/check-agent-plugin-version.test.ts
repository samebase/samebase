import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

import {
  checkAgentPluginVersion,
  findLatestPluginChangeBase,
  isReleaseVersionGreater,
} from "./check-agent-plugin-version.ts";

function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const pluginRoot = "packages/plugin";
const pluginManifestPath = `${pluginRoot}/plugins/samebase/.codex-plugin/plugin.json`;

function writePluginVersion(repoRoot: string, version: string): void {
  mkdirSync(path.dirname(path.join(repoRoot, pluginManifestPath)), { recursive: true });
  writeFileSync(
    path.join(repoRoot, pluginManifestPath),
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

  it("keeps an invalid plugin change failed until its version increases", () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), "samebase-agent-plugin-version-test-"));

    try {
      git(repoRoot, ["init", "-b", "main"]);
      git(repoRoot, ["config", "commit.gpgsign", "false"]);
      git(repoRoot, ["config", "user.name", "Agent Plugin Version Test"]);
      git(repoRoot, ["config", "user.email", "agent-plugin-version-test@example.com"]);
      writePluginVersion(repoRoot, "0.2.19");
      writeFileSync(path.join(repoRoot, pluginRoot, "README.md"), "Initial\n", "utf8");
      const initialCommit = commit(repoRoot, "Initial plugin");

      writeFileSync(path.join(repoRoot, pluginRoot, "README.md"), "Changed\n", "utf8");
      commit(repoRoot, "Change plugin without version");
      writeFileSync(path.join(repoRoot, "unrelated.txt"), "Unrelated\n", "utf8");
      commit(repoRoot, "Unrelated change");

      const baseCommit = findLatestPluginChangeBase(repoRoot);
      expect(git(repoRoot, ["rev-parse", baseCommit])).toBe(initialCommit);
      expect(() => checkAgentPluginVersion(repoRoot, baseCommit)).toThrow(
        "version 0.2.19 is not greater than 0.2.19",
      );

      writePluginVersion(repoRoot, "0.2.20");
      commit(repoRoot, "Increase plugin version");
      expect(checkAgentPluginVersion(repoRoot, findLatestPluginChangeBase(repoRoot))).toBe(
        "Samebase plugin version increased from 0.2.19 to 0.2.20.",
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
