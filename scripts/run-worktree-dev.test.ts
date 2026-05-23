import { describe, expect, it } from "vite-plus/test";

import { buildWorktreeDevCommandPlan, parseWorktreeDevArgs } from "./run-worktree-dev.ts";
import {
  LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
  LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
} from "../runtime/localWorktreePasswordAuth.ts";

describe("run-worktree-dev", () => {
  it("defaults to the long-running worktree dev flow on port 5174", () => {
    expect(parseWorktreeDevArgs([])).toMatchObject({
      once: false,
      enableBranch: true,
      vitePort: 5174,
      sourceEnv: null,
      sourceDeployKey: null,
      allowMissingSourceEnv: false,
    });
  });

  it("reads env fallbacks for the worktree bootstrap flow", () => {
    expect(
      parseWorktreeDevArgs([], {
        WORKTREE_DEV_ALLOW_MISSING_SOURCE_ENV: "1",
        WORKTREE_DEV_SOURCE_DEPLOY_KEY: "dev:key|token",
        WORKTREE_DEV_SOURCE_ENV: "apps/noter/.env.source.local",
        WORKTREE_DEV_VITE_PORT: "6210",
      }),
    ).toMatchObject({
      allowMissingSourceEnv: true,
      sourceDeployKey: "dev:key|token",
      sourceEnv: "apps/noter/.env.source.local",
      vitePort: 6210,
    });
  });

  it("lets explicit CLI flags override env defaults", () => {
    expect(
      parseWorktreeDevArgs(
        ["--once", "--no-branch", "--vite-port", "6001", "--source-env", "custom.env.local"],
        {
          WORKTREE_DEV_ALLOW_MISSING_SOURCE_ENV: "1",
          WORKTREE_DEV_VITE_PORT: "5174",
        },
      ),
    ).toMatchObject({
      once: true,
      enableBranch: false,
      vitePort: 6001,
      sourceEnv: "custom.env.local",
      allowMissingSourceEnv: true,
    });
  });

  it("omits the final dev process for dev:worktree:once", () => {
    const plan = buildWorktreeDevCommandPlan(
      {
        once: true,
        enableBranch: true,
        vitePort: 5174,
        sourceEnv: null,
        sourceDeployKey: null,
        allowMissingSourceEnv: false,
        showHelp: false,
      },
      "/repo",
      {},
    );

    expect(plan.at(-1)?.label).toBe("refresh anonymous auth keys");
    expect(plan.at(-1)?.args).toContain("--once");
  });

  it("adds the long-running primary dev step for worktree dev", () => {
    const plan = buildWorktreeDevCommandPlan(
      {
        once: false,
        enableBranch: false,
        vitePort: 6001,
        sourceEnv: "seed.env",
        sourceDeployKey: "dev:key|token",
        allowMissingSourceEnv: true,
        showHelp: false,
      },
      "/repo",
      {},
    );

    expect(plan.at(-1)).toMatchObject({
      label: "launch the long-running worktree dev server",
      cwd: "/repo",
      args: ["dev:primary"],
      env: {
        CONVEX_AGENT_MODE: "anonymous",
        VITE_LOCAL_WORKTREE_PASSWORD_EMAIL: LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
        VITE_LOCAL_WORKTREE_PASSWORD_VALUE: LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
        VITE_PORT: "6001",
      },
      longRunning: true,
    });
    expect(plan[0]).toMatchObject({
      args: ["/repo/scripts/killport.ts"],
    });
  });
});
