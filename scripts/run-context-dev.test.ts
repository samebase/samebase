import { describe, expect, it } from "vite-plus/test";

import { buildContextDevArgs, classifyWorktree } from "./run-context-dev.ts";

describe("run-context-dev", () => {
  it("uses the primary dev runner when Git dir and common dir match", () => {
    expect(classifyWorktree("/repo/.git", "/repo/.git")).toBe("main");
    expect(buildContextDevArgs("main", [])).toEqual(["dev:primary"]);
  });

  it("uses the anonymous worktree runner when Git dir is per-worktree", () => {
    expect(classifyWorktree("/repo/.git/worktrees/feature", "/repo/.git")).toBe("linked");
    expect(buildContextDevArgs("linked", ["--once"])).toEqual(["dev:worktree", "--once"]);
  });
});
