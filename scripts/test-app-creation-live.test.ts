import { describe, expect, it } from "vite-plus/test";

import {
  buildAppCreationPlaywrightArgs,
  deriveLiveTestWorktreeId,
} from "./test-app-creation-live.ts";

describe("test-app-creation-live", () => {
  it("uses the exact Codex worktree folder id in temporary resource names", () => {
    expect(
      deriveLiveTestWorktreeId({
        repoRoot: "/Users/nicu/.codex/worktrees/1378-review-fixes/samebase",
        gitDir: "/Users/nicu/dev/samebase/samebase/.git/worktrees/samebase2",
        gitCommonDir: "/Users/nicu/dev/samebase/samebase/.git",
      }),
    ).toBe("1378-review-fixes");
  });

  it("uses Git's worktree id for linked worktrees outside the Codex directory", () => {
    expect(
      deriveLiveTestWorktreeId({
        repoRoot: "/tmp/samebase-live-gate",
        gitDir: "/repo/.git/worktrees/livegate",
        gitCommonDir: "/repo/.git",
      }),
    ).toBe("livegate");
  });

  it("rejects the primary checkout because it does not have isolated test auth", () => {
    expect(() =>
      deriveLiveTestWorktreeId({
        repoRoot: "/repo",
        gitDir: "/repo/.git",
        gitCommonDir: "/repo/.git",
      }),
    ).toThrow("needs an isolated linked worktree");
  });

  it("runs only the desktop app-creation contract", () => {
    expect(buildAppCreationPlaywrightArgs()).toEqual([
      "exec",
      "playwright",
      "test",
      "-c",
      "playwright.live.config.ts",
      "e2e/vault-create-app.live.spec.ts",
      "--project=chromium-desktop",
      "--grep",
      "creates and fully provisions a temporary app, then removes its resources",
    ]);
  });
});
