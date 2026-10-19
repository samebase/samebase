import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  findMissingTargetRepositories,
  formatPublishedCommitSubject,
  publishRepositoryExport,
  readCurrentSourceBranchHead,
  repositoryExports,
} from "./publish-repository-exports.ts";

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function configureCommitter(repoRoot: string): void {
  git(repoRoot, ["config", "commit.gpgsign", "false"]);
  git(repoRoot, ["config", "user.name", "Repository Export Test"]);
  git(repoRoot, ["config", "user.email", "repository-export-test@example.com"]);
}

function createRepositoryExportFixture(): {
  sourceCommit: string;
  sourceRepo: string;
  targetHead: string;
  targetRepo: string;
  temporaryRoot: string;
} {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "samebase-repository-export-test-"));
  const sourceOrigin = path.join(temporaryRoot, "source-origin.git");
  const sourceRepo = path.join(temporaryRoot, "source");
  const targetRepo = path.join(temporaryRoot, "target.git");
  const targetWorktree = path.join(temporaryRoot, "target-worktree");

  mkdirSync(sourceRepo);
  git(sourceRepo, ["init", "-b", "main"]);
  configureCommitter(sourceRepo);
  const sourceRoot = path.join(sourceRepo, repositoryExports[0].sourceRoot);
  mkdirSync(sourceRoot, { recursive: true });
  writeFileSync(path.join(sourceRoot, "README.md"), "published\n", "utf8");
  writeFileSync(path.join(sourceRoot, "run.sh"), "#!/bin/sh\nexit 0\n", "utf8");
  chmodSync(path.join(sourceRoot, "run.sh"), 0o755);
  symlinkSync("README.md", path.join(sourceRoot, "readme-link"));
  git(sourceRepo, ["add", "."]);
  git(sourceRepo, ["commit", "-m", "v42: Update internal package (#123)"]);
  const sourceCommit = git(sourceRepo, ["rev-parse", "HEAD"]);

  git(temporaryRoot, ["init", "--bare", sourceOrigin]);
  git(sourceRepo, ["remote", "add", "origin", sourceOrigin]);
  git(sourceRepo, ["push", "-u", "origin", "main"]);

  git(temporaryRoot, ["init", "--bare", targetRepo]);
  mkdirSync(targetWorktree);
  git(targetWorktree, ["init", "-b", "main"]);
  configureCommitter(targetWorktree);
  writeFileSync(path.join(targetWorktree, "obsolete.txt"), "remove me\n", "utf8");
  git(targetWorktree, ["add", "."]);
  git(targetWorktree, ["commit", "-m", "Initial external repository"]);
  const targetHead = git(targetWorktree, ["rev-parse", "HEAD"]);
  git(targetWorktree, ["remote", "add", "origin", targetRepo]);
  git(targetWorktree, ["push", "-u", "origin", "main"]);

  return {
    sourceCommit,
    sourceRepo,
    targetHead,
    targetRepo,
    temporaryRoot,
  };
}

describe("repository exports", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("publishes the convex-hosting template to samebase/base", () => {
    expect(repositoryExports).toContainEqual({
      sourceRoot: "templates/base",
      targetBranch: "main",
      targetRepository: "base",
    });
  });

  it("publishes the Workers template to samebase/base-workers", () => {
    expect(repositoryExports).toContainEqual({
      sourceRoot: "templates/base-workers",
      targetBranch: "main",
      targetRepository: "base-workers",
    });
  });

  it("publishes the Sidebars package to samebase/sidebars", () => {
    expect(repositoryExports).toContainEqual({
      sourceRoot: "packages/sidebars",
      targetBranch: "main",
      targetRepository: "sidebars",
    });
  });

  it("publishes the Sidebars example to samebase/sidebars-example", () => {
    expect(repositoryExports).toContainEqual({
      sourceRoot: "apps/sidebars-example",
      targetBranch: "main",
      targetRepository: "sidebars-example",
    });
  });

  it("publishes the GitHub Actions template to samebase/base-actions", () => {
    expect(repositoryExports).toContainEqual({
      sourceRoot: "templates/base-actions",
      targetBranch: "main",
      targetRepository: "base-actions",
    });
  });

  it("names each target repository that GitHub cannot find", async () => {
    const fetch = vi.fn((url: string) =>
      Promise.resolve(new Response(null, { status: url.endsWith("/base-actions") ? 404 : 200 })),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      findMissingTargetRepositories({ owner: "samebase", lookupToken: "lookup-token" }),
    ).resolves.toEqual(["samebase/base-actions"]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/samebase/base",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer lookup-token" }),
      }),
    );
  });

  it("stops when GitHub answers a target lookup with another error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 500 }))),
    );

    await expect(
      findMissingTargetRepositories({ owner: "samebase", lookupToken: "lookup-token" }),
    ).rejects.toThrow("GitHub answered 500 for the export target samebase/plugin.");
  });

  it("publishes the exact source tree as a direct external child and then becomes a no-op", () => {
    const fixture = createRepositoryExportFixture();
    const gitEnvironment = { ...process.env, GIT_TERMINAL_PROMPT: "0" };

    try {
      const result = publishRepositoryExport({
        definition: repositoryExports[0],
        gitEnvironment,
        repoRoot: fixture.sourceRepo,
        sourceCommit: fixture.sourceCommit,
        sourceRepository: "samebase/samebase",
        targetRemoteUrl: fixture.targetRepo,
      });
      if (result.status !== "published") {
        throw new Error("Expected the repository export to publish a commit.");
      }

      const sourceTree = git(fixture.sourceRepo, [
        "rev-parse",
        `${fixture.sourceCommit}:${repositoryExports[0].sourceRoot}`,
      ]);
      const publishedHead = git(fixture.targetRepo, ["rev-parse", "refs/heads/main"]);
      expect(publishedHead).toBe(result.publishedCommit);
      expect(git(fixture.targetRepo, ["rev-parse", `${publishedHead}^{tree}`])).toBe(sourceTree);
      expect(git(fixture.targetRepo, ["rev-parse", `${publishedHead}^`])).toBe(fixture.targetHead);
      expect(git(fixture.targetRepo, ["show", "-s", "--format=%s", publishedHead])).toBe(
        "v42: Update internal package (samebase/samebase#123)",
      );

      const body = git(fixture.targetRepo, ["show", "-s", "--format=%b", publishedHead]);
      expect(body).toContain("Samebase-Source-Repository: samebase/samebase");
      expect(body).toContain(`Samebase-Source-Commit: ${fixture.sourceCommit}`);
      expect(body).toContain(`Samebase-Source-Path: ${repositoryExports[0].sourceRoot}`);
      expect(
        git(fixture.targetRepo, ["ls-tree", "-r", "--name-only", publishedHead]),
      ).not.toContain("obsolete.txt");
      expect(git(fixture.targetRepo, ["ls-tree", publishedHead, "run.sh"])).toMatch(/^100755 /);
      expect(git(fixture.targetRepo, ["ls-tree", publishedHead, "readme-link"])).toMatch(
        /^120000 /,
      );

      const unchanged = publishRepositoryExport({
        definition: repositoryExports[0],
        gitEnvironment,
        repoRoot: fixture.sourceRepo,
        sourceCommit: fixture.sourceCommit,
        sourceRepository: "samebase/samebase",
        targetRemoteUrl: fixture.targetRepo,
      });
      expect(unchanged.status).toBe("unchanged");
      expect(git(fixture.targetRepo, ["rev-parse", "refs/heads/main"])).toBe(publishedHead);
    } finally {
      rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("reads the current source branch head and detects a superseded source run", () => {
    const fixture = createRepositoryExportFixture();
    const gitEnvironment = { ...process.env, GIT_TERMINAL_PROMPT: "0" };

    try {
      expect(
        readCurrentSourceBranchHead({
          gitEnvironment,
          repoRoot: fixture.sourceRepo,
          sourceBranch: "main",
        }),
      ).toBe(fixture.sourceCommit);

      writeFileSync(path.join(fixture.sourceRepo, "new-main-file.txt"), "newer\n", "utf8");
      git(fixture.sourceRepo, ["add", "."]);
      git(fixture.sourceRepo, ["commit", "-m", "v43: Newer main commit"]);
      git(fixture.sourceRepo, ["push", "origin", "main"]);

      expect(
        readCurrentSourceBranchHead({
          gitEnvironment,
          repoRoot: fixture.sourceRepo,
          sourceBranch: "main",
        }),
      ).not.toBe(fixture.sourceCommit);
    } finally {
      rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("reuses the source subject and qualifies its source pull request", () => {
    expect(
      formatPublishedCommitSubject(
        "v1753: Publish repository exports after CI (#1293)",
        "samebase/samebase",
      ),
    ).toBe("v1753: Publish repository exports after CI (samebase/samebase#1293)");
    expect(formatPublishedCommitSubject("v1754: Update agent plugins", "samebase/samebase")).toBe(
      "v1754: Update agent plugins",
    );
    expect(() => formatPublishedCommitSubject("Internal title", "samebase/samebase")).toThrow(
      "Source commit subject has no build version",
    );
    expect(() => formatPublishedCommitSubject("v1753: Internal title", "samebase")).toThrow(
      "Invalid source repository",
    );
  });

  it("writes the configured target list for the GitHub App token", () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), "samebase-repository-export-output-"));
    const outputPath = path.join(temporaryRoot, "github-output");

    try {
      execFileSync(
        process.execPath,
        [
          fileURLToPath(new URL("./publish-repository-exports.ts", import.meta.url)),
          "--write-target-repositories-output",
        ],
        {
          env: { ...process.env, GITHUB_OUTPUT: outputPath },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      expect(readFileSync(outputPath, "utf8")).toBe(
        "repositories=plugin,base-workers,sidebars,sidebars-example,base-actions,base\n",
      );
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
