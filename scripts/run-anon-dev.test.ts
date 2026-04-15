import { describe, expect, it } from "vitest";

import { buildAnonCommandPlan, parseAnonArgs } from "./run-anon-dev.ts";

describe("run-anon-dev", () => {
  it("defaults to the long-running anonymous dev flow on port 5174", () => {
    expect(parseAnonArgs([])).toMatchObject({
      once: false,
      enableBranch: true,
      vitePort: 5174,
      sourceEnv: null,
      sourceDeployKey: null,
      allowMissingSourceEnv: false,
    });
  });

  it("reads env fallbacks for the anonymous bootstrap flow", () => {
    expect(
      parseAnonArgs([], {
        ANON_ALLOW_MISSING_SOURCE_ENV: "1",
        ANON_SOURCE_DEPLOY_KEY: "dev:key|token",
        ANON_SOURCE_ENV: "apps/noter/.env.source.local",
        ANON_VITE_PORT: "6210",
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
      parseAnonArgs(
        [
          "--once",
          "--no-branch",
          "--vite-port",
          "6001",
          "--source-env",
          "custom.env.local",
        ],
        {
          ANON_ALLOW_MISSING_SOURCE_ENV: "1",
          ANON_VITE_PORT: "5174",
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

  it("omits the final dev process for anon:once", () => {
    const plan = buildAnonCommandPlan(
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
  });

  it("adds the long-running root pnpm dev step for anon", () => {
    const plan = buildAnonCommandPlan(
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
      label: "launch the long-running anonymous dev server",
      cwd: "/repo",
      args: ["dev"],
      env: {
        CONVEX_AGENT_MODE: "anonymous",
        VITE_PORT: "6001",
      },
      longRunning: true,
    });
    expect(plan[0]).toMatchObject({
      args: ["/repo/scripts/killport.ts"],
    });
  });
});
