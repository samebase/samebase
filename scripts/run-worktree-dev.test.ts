import path from "node:path";
import process from "node:process";

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
      forceBootstrap: false,
      vitePort: 5174,
      sourceEnv: null,
      sourceDeployKey: null,
    });
  });

  it("reads env fallbacks for the worktree bootstrap flow", () => {
    expect(
      parseWorktreeDevArgs([], {
        WORKTREE_DEV_SOURCE_DEPLOY_KEY: "dev:key|token",
        WORKTREE_DEV_SOURCE_ENV: "apps/samebase/.env.source.local",
        WORKTREE_DEV_VITE_PORT: "6210",
      }),
    ).toMatchObject({
      forceBootstrap: false,
      sourceDeployKey: "dev:key|token",
      sourceEnv: "apps/samebase/.env.source.local",
      vitePort: 6210,
    });
  });

  it("lets explicit CLI flags override env defaults", () => {
    expect(
      parseWorktreeDevArgs(
        [
          "--once",
          "--no-branch",
          "--force-bootstrap",
          "--vite-port",
          "6001",
          "--source-env",
          "custom.env.local",
        ],
        {
          WORKTREE_DEV_VITE_PORT: "5174",
        },
      ),
    ).toMatchObject({
      once: true,
      enableBranch: false,
      forceBootstrap: true,
      vitePort: 6001,
      sourceEnv: "custom.env.local",
    });
  });

  it("omits the final dev process for dev:worktree:once", () => {
    const plan = buildWorktreeDevCommandPlan(
      {
        once: true,
        enableBranch: true,
        forceBootstrap: false,
        vitePort: 5174,
        sourceEnv: null,
        sourceDeployKey: null,
        showHelp: false,
      },
      "/repo",
      {},
    );

    expect(plan.at(-1)?.label).toBe("refresh anonymous auth keys");
    expect(plan.at(-1)?.phase).toBe("once-bootstrap");
    expect(plan.at(-1)?.args).toContain("--once");
  });

  it("adds the long-running primary dev step for worktree dev", () => {
    const plan = buildWorktreeDevCommandPlan(
      {
        once: false,
        enableBranch: false,
        forceBootstrap: false,
        vitePort: 6001,
        sourceEnv: "seed.env",
        sourceDeployKey: "dev:key|token",
        showHelp: false,
      },
      "/repo",
      { CONVEX_DEPLOY_KEY: "dev:ambient|token" },
    );

    expect(plan.at(-1)).toMatchObject({
      label: "launch the long-running worktree dev server",
      cwd: "/repo",
      command: process.execPath,
      env: {
        CONVEX_AGENT_MODE: "anonymous",
        DEV_ENV_ORIGIN: "http://localhost:6001",
        VITE_LOCAL_WORKTREE_PASSWORD_EMAIL: LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
        VITE_LOCAL_WORKTREE_PASSWORD_VALUE: LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
        VITE_PORT: "6001",
      },
      phase: "long-running",
    });
    expect(plan.at(-1)?.args.slice(1)).toEqual(["run", "--filter=samebase", "dev:raw"]);
    expect(plan[0]).toMatchObject({
      args: [path.join("/repo", "scripts", "killport.ts")],
      phase: "always",
    });
    const localBootstrap = plan.find(
      ({ label }) => label === "bootstrap and seed the anonymous local backend",
    );
    expect(localBootstrap).toMatchObject({
      env: {
        WORKTREE_DEV_SOURCE_DEPLOY_KEY: "dev:key|token",
      },
    });
    expect(localBootstrap).not.toHaveProperty("env.CONVEX_DEPLOY_KEY");
    expect(plan.at(-1)).not.toHaveProperty("env.CONVEX_DEPLOY_KEY");
    expect(plan.at(-1)).not.toHaveProperty("env.WORKTREE_DEV_SOURCE_DEPLOY_KEY");
  });

  it("marks one-time seed and auth work separately from always-on startup work", () => {
    const plan = buildWorktreeDevCommandPlan(
      {
        once: false,
        enableBranch: true,
        forceBootstrap: false,
        vitePort: 5174,
        sourceEnv: null,
        sourceDeployKey: null,
        showHelp: false,
      },
      "/repo",
      {},
    );

    expect(plan.map(({ label, phase }) => [label, phase])).toEqual([
      ["stop existing local backend listeners", "always"],
      ["validate anonymous seed env prerequisites", "once-bootstrap"],
      ["bootstrap the current worktree", "always"],
      ["generate tracked file path types", "always"],
      ["bootstrap and seed the anonymous local backend", "once-bootstrap"],
      ["refresh anonymous auth keys", "once-bootstrap"],
      ["launch the long-running worktree dev server", "long-running"],
    ]);
  });

  it("keeps only first-time anonymous backend setup noninteractive", () => {
    const plan = buildWorktreeDevCommandPlan(
      {
        once: true,
        enableBranch: true,
        forceBootstrap: false,
        vitePort: 5174,
        sourceEnv: null,
        sourceDeployKey: null,
        showHelp: false,
      },
      "/repo",
      {},
    );

    expect(plan.filter(({ stdio }) => stdio !== undefined)).toEqual([
      expect.objectContaining({
        label: "bootstrap and seed the anonymous local backend",
        stdio: ["ignore", "inherit", "inherit"],
      }),
    ]);
  });
});
