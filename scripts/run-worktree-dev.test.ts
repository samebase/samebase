import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import process from "node:process";

import { describe, expect, it } from "vite-plus/test";

import {
  buildDevServerEnvironment,
  buildWorktreeDevCommandPlan,
  parseWorktreeDevArgs,
  resolveDevStage,
  selectWorktreeDevSteps,
} from "./run-worktree-dev.ts";
import {
  LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
  LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
} from "../runtime/localWorktreePasswordAuth.ts";

const reserveFreePort = async (): Promise<string> =>
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => {
          reject(new Error("Expected an ephemeral TCP port."));
        });
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(String(address.port));
      });
    });
  });

const options = {
  once: false,
  enableBranch: true,
  forceBootstrap: false,
  vitePort: 5174,
  showHelp: false,
};

describe("run-worktree-dev", () => {
  it("defaults to the long-running dev flow on the given frontend port", () => {
    expect(parseWorktreeDevArgs([], {})).toMatchObject({
      once: false,
      enableBranch: true,
      forceBootstrap: false,
      vitePort: 5174,
    });
    expect(parseWorktreeDevArgs([], {}, 5173)).toMatchObject({ vitePort: 5173 });
  });

  it("reads env fallbacks for the bootstrap flow", () => {
    expect(
      parseWorktreeDevArgs([], {
        WORKTREE_DEV_VITE_PORT: "6210",
      }),
    ).toMatchObject({
      forceBootstrap: false,
      vitePort: 6210,
    });
  });

  it("lets explicit CLI flags override env defaults", () => {
    expect(
      parseWorktreeDevArgs(["--once", "--no-branch", "--force-bootstrap", "--vite-port", "6001"], {
        WORKTREE_DEV_VITE_PORT: "5174",
      }),
    ).toMatchObject({
      once: true,
      enableBranch: false,
      forceBootstrap: true,
      vitePort: 6001,
    });
  });

  it("names the stage after the user in the main checkout and after the folder in a worktree", () => {
    expect(resolveDevStage("main", "/Users/nicu/dev/samebase", "Nicu")).toBe("dev-nicu");
    expect(resolveDevStage("linked", "/wt/RFC_134.laptops", "nicu")).toBe("dev-rfc-134-laptops");
  });

  it("orders the steps of one start", () => {
    const plan = buildWorktreeDevCommandPlan(options, "/repo", "dev-feature", {});

    expect(plan.map(({ label, phase }) => [label, phase])).toEqual([
      ["stop existing local backend listeners", "always"],
      ["bootstrap the current worktree", "always"],
      ["generate tracked file path types", "always"],
      ["set up and seed the local deployment", "once-bootstrap"],
      ["deploy the Alchemy stage dev-feature", "backend-ready"],
      ["launch the long-running worktree dev server", "long-running"],
    ]);
    expect(plan[0]).toMatchObject({
      args: [path.join("/repo", "scripts", "killport.ts")],
    });
  });

  it("with --once, ends after the seed, which needs no input", () => {
    const plan = buildWorktreeDevCommandPlan({ ...options, once: true }, "/repo", "dev-x", {});

    expect(plan.at(-1)).toMatchObject({
      label: "set up and seed the local deployment",
      phase: "once-bootstrap",
      stdio: ["ignore", "inherit", "inherit"],
    });
    expect(plan.filter(({ stdio }) => stdio !== undefined)).toHaveLength(1);
  });

  it("runs the stage in apps/samebase without a deploy key of the shell", () => {
    const plan = buildWorktreeDevCommandPlan(options, "/repo", "dev-feature", {
      CONVEX_DEPLOY_KEY: "dev:ambient|token",
    });
    const steps = selectWorktreeDevSteps(plan, true);

    expect(steps.backendReady).toEqual([
      expect.objectContaining({
        cwd: path.join("/repo", "apps", "samebase"),
        command: "pnpm",
        args: ["exec", "alchemy", "deploy", "--stage", "dev-feature", "--yes", "--no-input"],
      }),
    ]);
    expect(steps.backendReady[0]).not.toHaveProperty("env.CONVEX_DEPLOY_KEY");
  });

  it("skips only the seed when the bootstrap marker is current", () => {
    const plan = buildWorktreeDevCommandPlan(options, "/repo", "dev-feature", {});

    expect(selectWorktreeDevSteps(plan, true).blocking.map(({ label }) => label)).not.toContain(
      "set up and seed the local deployment",
    );
    const firstStart = selectWorktreeDevSteps(plan, false);
    expect(firstStart.blocking.at(-1)?.label).toBe("set up and seed the local deployment");
    expect(firstStart.backendReady).toHaveLength(1);
    expect(firstStart.longRunning?.phase).toBe("long-running");
  });

  it("launches the dev server through the Vite+ entrypoint with the password autofill", () => {
    const plan = buildWorktreeDevCommandPlan({ ...options, vitePort: 6001 }, "/repo", "dev-x", {
      CONVEX_DEPLOY_KEY: "dev:ambient|token",
    });
    const devServer = plan.at(-1);

    expect(devServer).toMatchObject({
      cwd: "/repo",
      command: process.execPath,
      env: {
        DEV_ENV_ORIGIN: "http://localhost:6001",
        VITE_LOCAL_WORKTREE_PASSWORD_EMAIL: LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
        VITE_LOCAL_WORKTREE_PASSWORD_VALUE: LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
        VITE_PORT: "6001",
      },
    });
    expect(devServer?.args.slice(1)).toEqual(["run", "--filter=samebase", "dev:raw"]);
    expect(devServer).not.toHaveProperty("env.CONVEX_DEPLOY_KEY");

    const result = spawnSync(process.execPath, [devServer?.args[0] ?? "", "--help"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Vite+");
  });

  it("pins VITE_PORT and DEV_ENV_ORIGIN together when the origin is missing", async () => {
    const freePort = await reserveFreePort();

    expect(buildDevServerEnvironment({ VITE_PORT: freePort })).toMatchObject({
      DEV_ENV_ORIGIN: `http://localhost:${freePort}`,
      VITE_PORT: freePort,
    });
  });

  it("backfills VITE_PORT from an explicit localhost origin and leaves other origins alone", () => {
    expect(buildDevServerEnvironment({ DEV_ENV_ORIGIN: "http://localhost:43121" })).toMatchObject({
      DEV_ENV_ORIGIN: "http://localhost:43121",
      VITE_PORT: "43121",
    });
    expect(buildDevServerEnvironment({ DEV_ENV_ORIGIN: "https://preview.samebase.md" })).toEqual({
      DEV_ENV_ORIGIN: "https://preview.samebase.md",
    });
  });
});
