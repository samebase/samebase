import { describe, expect, it } from "vite-plus/test";

import { resolvePrerenderOrigin, selectConvexDeployPlan } from "./build-cloudflare.js";

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

  it("selects the production key for the main branch", () => {
    expect(
      selectConvexDeployPlan({
        PROD_CONVEX_DEPLOY_KEY: "prod-key",
        PREVIEW_CONVEX_DEPLOY_KEY: "preview-key",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toEqual({
      kind: "deploy",
      deployKeyName: "PROD_CONVEX_DEPLOY_KEY",
      deployKey: "prod-key",
      routeSurface: "production",
      args: ["exec", "convex", "deploy", "--cmd", "pnpm run build:ci"],
    });
  });

  it("selects the preview key for non-main branches", () => {
    expect(
      selectConvexDeployPlan({
        PROD_CONVEX_DEPLOY_KEY: "prod-key",
        PREVIEW_CONVEX_DEPLOY_KEY: "preview-key",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "feature-branch",
      }),
    ).toEqual({
      kind: "previewDeploy",
      deployKeyName: "PREVIEW_CONVEX_DEPLOY_KEY",
      deployKey: "preview-key",
      routeSurface: "preview",
      args: [
        "exec",
        "convex",
        "deploy",
        "--preview-create",
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
    ).toThrow("Set PREVIEW_CONVEX_DEPLOY_KEY");
  });

  it("skips Convex deploys for local builds without deploy keys", () => {
    expect(selectConvexDeployPlan({})).toEqual({ kind: "frontendOnly", routeSurface: "local" });
  });

  it("requires an explicit branch when split keys are present locally", () => {
    expect(() =>
      selectConvexDeployPlan({
        PROD_CONVEX_DEPLOY_KEY: "prod-key",
      }),
    ).toThrow("Set WORKERS_CI_BRANCH");
  });

  it("uses the public origin for production prerendering", () => {
    expect(resolvePrerenderOrigin({}, "deploy")).toBe("https://noter.md");
  });

  it("keeps an explicit preview prerender origin", () => {
    expect(
      resolvePrerenderOrigin(
        {
          NOTER_PRERENDER_ORIGIN: "https://preview.example.com",
        },
        "previewDeploy",
      ),
    ).toBe("https://preview.example.com");
  });

  it("infers the Workers preview origin from the branch and Worker name", () => {
    expect(
      resolvePrerenderOrigin(
        {
          WORKERS_CI_BRANCH: "codex/fix-route-url-editor-indent",
          WRANGLER_CI_OVERRIDE_NAME: "noter-worker",
        },
        "previewDeploy",
      ),
    ).toBe("https://codex-fix-route-url-editor-indent-noter-worker.nicuchiciuc.workers.dev");
  });

  it("requires the Worker name when inferring a preview prerender origin", () => {
    expect(() =>
      resolvePrerenderOrigin({ WORKERS_CI_BRANCH: "codex/feature" }, "previewDeploy"),
    ).toThrow("Set WRANGLER_CI_OVERRIDE_NAME or CLOUDFLARE_WORKER_NAME");
  });
});
