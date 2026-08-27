import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { checkTemplateReleaseContract } from "./check-template-release-contract.ts";

const sourceRepository = "https://github.com/samebase/samebase";

function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function writeTemplateMetadata(repoRoot: string, baseline: string): void {
  writeFileSync(
    path.join(repoRoot, "templates/app/.samebase/template.json"),
    `${JSON.stringify({ schemaVersion: 1, sourceRepository, baseline }, null, 2)}\n`,
    "utf8",
  );
}

function writeTemplateChangelog(repoRoot: string, buildLabels: readonly string[]): void {
  writeFileSync(
    path.join(repoRoot, "templates/app/.samebase/CHANGELOG.md"),
    `# Samebase template changelog\n\n${buildLabels.map((label) => `## ${label}\n`).join("\n")}`,
    "utf8",
  );
}

describe("template release contract", () => {
  it("requires the projected baseline, changelog entry, and changed-script build marker", () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), "samebase-template-release-test-"));
    const metadataRoot = path.join(repoRoot, "templates/app/.samebase");
    const scriptsRoot = path.join(repoRoot, "templates/app/scripts");

    try {
      mkdirSync(metadataRoot, { recursive: true });
      mkdirSync(scriptsRoot, { recursive: true });
      git(repoRoot, ["init", "-b", "main"]);
      git(repoRoot, ["config", "commit.gpgsign", "false"]);
      git(repoRoot, ["config", "user.name", "Template Release Test"]);
      git(repoRoot, ["config", "user.email", "template-release-test@example.com"]);
      writeTemplateMetadata(repoRoot, "v1");
      writeTemplateChangelog(repoRoot, ["v1"]);
      writeFileSync(
        path.join(scriptsRoot, "deploy.ts"),
        "// Samebase source build: v1\nexport {};\n",
        "utf8",
      );
      writeFileSync(path.join(repoRoot, "templates/app/README.md"), "Initial\n", "utf8");
      git(repoRoot, ["add", "."]);
      git(repoRoot, ["commit", "-m", "Initial template"]);
      git(repoRoot, ["update-ref", "refs/remotes/origin/main", "HEAD"]);

      expect(checkTemplateReleaseContract(repoRoot, "origin/main")).toBe(
        "The template release contract is unchanged at v1.",
      );

      rmSync(path.join(repoRoot, "templates/app/README.md"));
      expect(() => checkTemplateReleaseContract(repoRoot, "origin/main")).toThrow(
        "baseline must be v2",
      );

      writeFileSync(path.join(repoRoot, "templates/app/README.md"), "Changed\n", "utf8");
      expect(() => checkTemplateReleaseContract(repoRoot, "origin/main")).toThrow(
        "baseline must be v2",
      );

      writeTemplateMetadata(repoRoot, "v2");
      writeTemplateChangelog(repoRoot, ["v1", "v2"]);
      writeFileSync(
        path.join(scriptsRoot, "deploy.ts"),
        "// Samebase source build: v1\nexport const changed = true;\n",
        "utf8",
      );
      expect(() => checkTemplateReleaseContract(repoRoot, "origin/main")).toThrow(
        "deploy.ts changed and must use // Samebase source build: v2",
      );

      writeFileSync(
        path.join(scriptsRoot, "deploy.ts"),
        "// Samebase source build: v2\nexport const changed = true;\n",
        "utf8",
      );
      expect(checkTemplateReleaseContract(repoRoot, "origin/main")).toBe(
        "The template release contract is current at v2.",
      );

      writeFileSync(path.join(scriptsRoot, "nested.ts"), "export {};\n", "utf8");
      expect(() => checkTemplateReleaseContract(repoRoot, "origin/main")).toThrow(
        "nested.ts line 1 must use // Samebase source build: v<N>",
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
