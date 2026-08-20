import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import { main, selectConvexDeployPlan } from "./build-cloudflare.js";

const cloudflareHeaders = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");

describe("build-cloudflare", () => {
  it("applies one global browser security policy", () => {
    const globalRule = cloudflareHeaders.split("\n\n").find((rule) => rule.startsWith("/*\n"));

    expect(globalRule).toContain("Content-Security-Policy: frame-ancestors 'none'");
    expect(globalRule).toContain("X-Content-Type-Options: nosniff");
    expect(globalRule).toContain("X-Frame-Options: DENY");
    expect(cloudflareHeaders.match(/^  Content-Security-Policy:/gm) ?? []).toHaveLength(1);
    expect(cloudflareHeaders.match(/^  X-Content-Type-Options:/gm) ?? []).toHaveLength(1);
    expect(cloudflareHeaders.match(/^  X-Frame-Options:/gm) ?? []).toHaveLength(1);
  });

  it("requires the preview key for non-main branches with the production key present", () => {
    expect(() =>
      selectConvexDeployPlan({
        CONVEX_DEPLOY_KEY: "prod-key",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "feature-branch",
      }),
    ).toThrow("Use a Convex project Preview deploy key.");
  });

  it("requires the Workers branch during Workers builds", () => {
    expect(() =>
      selectConvexDeployPlan({
        WORKERS_CI: "1",
      }),
    ).toThrow("Set WORKERS_CI_BRANCH");
  });

  it("rejects Cloudflare Pages builds", () => {
    expect(() =>
      selectConvexDeployPlan({
        CF_PAGES: "1",
      }),
    ).toThrow("Cloudflare Pages builds are disabled");
  });

  it("rejects the app-facing PostHog token during Workers builds", () => {
    expect(() =>
      selectConvexDeployPlan({
        CONVEX_DEPLOY_KEY: "prod-key",
        PREVIEW_CONVEX_DEPLOY_KEY: "preview-key",
        VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_shared",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toThrow("Set PROD_POSTHOG_PROJECT_TOKEN");
  });

  it("rejects the app-facing PostHog host during Workers builds", () => {
    expect(() =>
      selectConvexDeployPlan({
        CONVEX_DEPLOY_KEY: "prod-key",
        PREVIEW_CONVEX_DEPLOY_KEY: "preview-key",
        VITE_PUBLIC_POSTHOG_HOST: "https://posthog.samebase.com",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toThrow("Do not set VITE_PUBLIC_POSTHOG_HOST");
  });

  it("selects the production key for the main branch", () => {
    expect(
      selectConvexDeployPlan({
        CONVEX_DEPLOY_KEY: "prod-key",
        PROD_POSTHOG_PROJECT_TOKEN: "phc_prod",
        PREVIEW_CONVEX_DEPLOY_KEY: "preview-key",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toEqual({
      kind: "deploy",
      deployKeyName: "CONVEX_DEPLOY_KEY",
      deployKey: "prod-key",
      postHogProjectToken: "phc_prod",
      routeEnvironment: "production",
      args: [
        "exec",
        "convex",
        "deploy",
        "--cmd",
        "pnpm run build:ci && node ./scripts/verify-current-branch-head.ts",
      ],
    });
  });

  it("keeps PostHog disabled when the production token is not configured", () => {
    expect(
      selectConvexDeployPlan({
        CONVEX_DEPLOY_KEY: "prod-key",
        PREVIEW_CONVEX_DEPLOY_KEY: "preview-key",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toMatchObject({
      kind: "deploy",
      postHogProjectToken: null,
    });
  });

  it("selects the preview key for non-main branches", () => {
    expect(
      selectConvexDeployPlan({
        CONVEX_DEPLOY_KEY: "prod-key",
        PROD_POSTHOG_PROJECT_TOKEN: "phc_prod",
        PREVIEW_CONVEX_DEPLOY_KEY: "preview-key",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "feature-branch",
      }),
    ).toEqual({
      kind: "previewDeploy",
      deployKeyName: "PREVIEW_CONVEX_DEPLOY_KEY",
      deployKey: "preview-key",
      routeEnvironment: "preview",
      args: [
        "exec",
        "convex",
        "deploy",
        "--preview-name",
        "feature-branch",
        "--cmd",
        "pnpm run build:ci && node ./scripts/verify-current-branch-head.ts",
      ],
      seedArgs: [
        "exec",
        "convex",
        "run",
        "devAuth:seedPasswordAccount",
        "--preview-name",
        "feature-branch",
      ],
    });
  });

  it("seeds after a successful named preview deploy", async () => {
    const invocations: Array<{
      operation: string | undefined;
      deployKey: string | undefined;
    }> = [];
    const runCommand = (
      _command: string,
      args: readonly string[],
      env: NodeJS.ProcessEnv | undefined,
    ) => {
      invocations.push({
        operation: args[2] === "deploy" ? "deploy" : args[3],
        deployKey: env?.CONVEX_DEPLOY_KEY,
      });
      return Promise.resolve();
    };
    const env = {
      PREVIEW_CONVEX_DEPLOY_KEY: "preview-key",
      WORKERS_CI: "1",
      WORKERS_CI_BRANCH: "feature-branch",
      WORKERS_CI_COMMIT_SHA: "current-commit",
    };

    await main(env, runCommand);

    expect(invocations).toEqual([
      { operation: "deploy", deployKey: "preview-key" },
      { operation: "devAuth:seedPasswordAccount", deployKey: "preview-key" },
    ]);
  });

  it("does not seed when the named preview deploy fails", async () => {
    const invocations: Array<string | undefined> = [];
    const runCommand = (_command: string, args: readonly string[]) => {
      invocations.push(args[2]);
      return Promise.reject(new Error("deploy failed"));
    };

    await expect(
      main(
        {
          PREVIEW_CONVEX_DEPLOY_KEY: "preview-key",
          WORKERS_CI: "1",
          WORKERS_CI_BRANCH: "feature-branch",
          WORKERS_CI_COMMIT_SHA: "current-commit",
        },
        runCommand,
      ),
    ).rejects.toThrow("deploy failed");

    expect(invocations).toEqual(["deploy"]);
  });

  it("requires the preview key for non-main branches", () => {
    expect(() =>
      selectConvexDeployPlan({
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "feature-branch",
      }),
    ).toThrow("Use a Convex project Preview deploy key.");
  });

  it("requires the production key with the current least-privilege permission set", () => {
    expect(() =>
      selectConvexDeployPlan({
        PREVIEW_CONVEX_DEPLOY_KEY: "preview-key",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toThrow(
      "Use a Convex production deploy key with exactly deployment:deploy, deployment:env:view, deployment:env:write, and deployment:data:view.",
    );
  });

  it("skips Convex deploys for local builds without deploy keys", () => {
    expect(selectConvexDeployPlan({})).toEqual({ kind: "frontendOnly", routeEnvironment: "local" });
  });

  it("requires an explicit branch when Convex deploy keys are present locally", () => {
    expect(() =>
      selectConvexDeployPlan({
        CONVEX_DEPLOY_KEY: "prod-key",
      }),
    ).toThrow("Set WORKERS_CI_BRANCH");
  });
});
