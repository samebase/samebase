import { describe, expect, it } from "vite-plus/test";

import { selectConvexDeployPlan } from "./build-cloudflare.js";

describe("build-cloudflare", () => {
  it("rejects the generic Convex deploy key", () => {
    expect(() =>
      selectConvexDeployPlan({
        CONVEX_DEPLOY_KEY: "generic-key",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toThrow("Do not set CONVEX_DEPLOY_KEY");
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
        PROD_CONVEX_DEPLOY_KEY: "prod-key",
        PREVIEW_CONVEX_DEPLOY_KEY: "preview-key",
        VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_shared",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toThrow("Set PROD_POSTHOG_PROJECT_TOKEN");
  });

  it("selects the production key for the main branch", () => {
    expect(
      selectConvexDeployPlan({
        PROD_CONVEX_DEPLOY_KEY: "prod-key",
        PROD_POSTHOG_PROJECT_TOKEN: "phc_prod",
        PREVIEW_CONVEX_DEPLOY_KEY: "preview-key",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toEqual({
      kind: "deploy",
      deployKeyName: "PROD_CONVEX_DEPLOY_KEY",
      deployKey: "prod-key",
      postHogProjectToken: "phc_prod",
      routeEnvironment: "production",
      args: ["exec", "convex", "deploy", "--cmd", "pnpm run build:ci"],
    });
  });

  it("keeps PostHog disabled when the production token is not configured", () => {
    expect(
      selectConvexDeployPlan({
        PROD_CONVEX_DEPLOY_KEY: "prod-key",
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
        PROD_CONVEX_DEPLOY_KEY: "prod-key",
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
        "--preview-run",
        "devAuth:seedPasswordAccount",
        "--cmd",
        "pnpm run build:ci",
      ],
    });
  });

  it("requires the preview key for non-main branches", () => {
    expect(() =>
      selectConvexDeployPlan({
        PROD_CONVEX_DEPLOY_KEY: "prod-key",
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

  it("requires an explicit branch when split keys are present locally", () => {
    expect(() =>
      selectConvexDeployPlan({
        PROD_CONVEX_DEPLOY_KEY: "prod-key",
      }),
    ).toThrow("Set WORKERS_CI_BRANCH");
  });
});
