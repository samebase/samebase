import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import { main, selectConvexDeployPlan } from "./build-cloudflare.js";

const cloudflareHeaders = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");

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

  it("keeps raw agent Markdown out of search results", () => {
    expect(cloudflareHeaders).toContain(
      ["/docs/*.md", "  X-Robots-Tag: noindex, follow"].join("\n"),
    );
    expect(cloudflareHeaders).toContain(
      ["/pricing.md", "  X-Robots-Tag: noindex, follow"].join("\n"),
    );
  });

  it("lists each canonical public decision page in the sitemap", () => {
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

    expect(urls).toEqual([
      "https://samebase.com/",
      "https://samebase.com/docs",
      "https://samebase.com/docs/cloudflare-setup",
      "https://samebase.com/docs/cloudflare-previews-migration",
      "https://samebase.com/docs/do-it-yourself",
      "https://samebase.com/docs/receipts",
      "https://samebase.com/docs/the-stack",
      "https://samebase.com/pricing",
      "https://samebase.com/privacy",
      "https://samebase.com/terms",
    ]);
  });

  it("does not read the legacy preview key", () => {
    expect(() =>
      selectConvexDeployPlan({
        PREVIEW_CONVEX_DEPLOY_KEY: "legacy-preview-key",
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
        VITE_PUBLIC_POSTHOG_HOST: "https://posthog.samebase.com",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toThrow("Do not set VITE_PUBLIC_POSTHOG_HOST");
  });

  it("deploys production for the main branch", () => {
    expect(
      selectConvexDeployPlan({
        CONVEX_DEPLOY_KEY: "prod-key",
        PROD_POSTHOG_PROJECT_TOKEN: "phc_prod",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toEqual({
      kind: "deploy",
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
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toMatchObject({
      kind: "deploy",
      postHogProjectToken: null,
    });
  });

  it("reuses a named Convex preview for non-main branches", () => {
    expect(
      selectConvexDeployPlan({
        CONVEX_DEPLOY_KEY: "preview-key",
        PROD_POSTHOG_PROJECT_TOKEN: "phc_prod",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "feature-branch",
      }),
    ).toEqual({
      kind: "previewDeploy",
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
      routeEnvironment: string | undefined;
      postHogToken: string | undefined;
      prerenderOrigin: string | undefined;
    }> = [];
    const runCommand = (args: readonly string[], env: NodeJS.ProcessEnv | undefined) => {
      invocations.push({
        operation: args[2] === "deploy" ? "deploy" : args[3],
        deployKey: env?.CONVEX_DEPLOY_KEY,
        routeEnvironment: env?.VITE_SAMEBASE_ROUTE_ENVIRONMENT,
        postHogToken: env?.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN,
        prerenderOrigin: env?.SAMEBASE_PRERENDER_ORIGIN,
      });
      return Promise.resolve();
    };
    const env = {
      CONVEX_DEPLOY_KEY: "preview-key",
      PROD_POSTHOG_PROJECT_TOKEN: "phc_prod",
      WORKERS_CI: "1",
      WORKERS_CI_BRANCH: "feature-branch",
      WORKERS_CI_COMMIT_SHA: "current-commit",
    };

    await main(env, runCommand);

    expect(invocations).toEqual([
      {
        operation: "deploy",
        deployKey: "preview-key",
        routeEnvironment: "preview",
        postHogToken: undefined,
        prerenderOrigin: undefined,
      },
      {
        operation: "devAuth:seedPasswordAccount",
        deployKey: "preview-key",
        routeEnvironment: "preview",
        postHogToken: undefined,
        prerenderOrigin: undefined,
      },
    ]);
  });

  it("does not seed when the named preview deploy fails", async () => {
    const invocations: Array<string | undefined> = [];
    const runCommand = (args: readonly string[]) => {
      invocations.push(args[2]);
      return Promise.reject(new Error("deploy failed"));
    };

    await expect(
      main(
        {
          CONVEX_DEPLOY_KEY: "preview-key",
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

  it("does not pass a deploy key to local codegen even with a branch set", async () => {
    const invocations: Array<{ args: readonly string[]; env: NodeJS.ProcessEnv | undefined }> = [];
    await main(
      {
        CONVEX_DEPLOY_KEY: "prod-key",
        WORKERS_CI_BRANCH: "main",
      },
      (args, env) => {
        invocations.push({ args, env });
        return Promise.resolve();
      },
    );
    expect(invocations).toEqual([
      {
        args: ["run", "build:app"],
        env: {
          CONVEX_DEPLOY_KEY: undefined,
          WORKERS_CI_BRANCH: "main",
          VITE_SAMEBASE_ROUTE_ENVIRONMENT: "local",
        },
      },
    ]);
  });

  it("exposes analytics and the canonical origin only to the production build", async () => {
    const invocations: Array<{ args: readonly string[]; env: NodeJS.ProcessEnv | undefined }> = [];
    await main(
      {
        CONVEX_DEPLOY_KEY: "prod-key",
        PROD_POSTHOG_PROJECT_TOKEN: "phc_prod",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      },
      (args, env) => {
        invocations.push({ args, env });
        return Promise.resolve();
      },
    );
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.env).toMatchObject({
      CONVEX_DEPLOY_KEY: "prod-key",
      VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_prod",
      VITE_PUBLIC_POSTHOG_HOST: "https://e.samebase.com",
      VITE_SAMEBASE_ROUTE_ENVIRONMENT: "production",
      SAMEBASE_PRERENDER_ORIGIN: "https://samebase.com",
    });
  });
});
