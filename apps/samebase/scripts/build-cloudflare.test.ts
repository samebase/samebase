import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import { main, selectCloudflareBuildPlan } from "./build-cloudflare.js";

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
      "https://samebase.com/docs/do-it-yourself",
      "https://samebase.com/docs/receipts",
      "https://samebase.com/docs/the-stack",
      "https://samebase.com/pricing",
      "https://samebase.com/privacy",
      "https://samebase.com/terms",
    ]);
  });

  it("runs only the application build outside Workers Builds", () => {
    expect(
      selectCloudflareBuildPlan({
        CONVEX_DEPLOY_KEY: "ignored-local-key",
        WORKERS_CI_BRANCH: "feature-branch",
      }),
    ).toEqual({
      kind: "app",
      buildArgs: ["run", "build:app"],
      routeEnvironment: "local",
    });
  });

  it("requires the Workers branch during Workers Builds", () => {
    expect(() =>
      selectCloudflareBuildPlan({
        CONVEX_DEPLOY_KEY: "production-key",
        WORKERS_CI: "1",
      }),
    ).toThrow("WORKERS_CI_BRANCH");
  });

  it("rejects Cloudflare Pages builds", () => {
    expect(() =>
      selectCloudflareBuildPlan({
        CF_PAGES: "1",
      }),
    ).toThrow("Cloudflare Pages builds are disabled");
  });

  it("rejects the app-facing PostHog token during Workers Builds", () => {
    expect(() =>
      selectCloudflareBuildPlan({
        CONVEX_DEPLOY_KEY: "prod-key",
        VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_shared",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toThrow("Set PROD_POSTHOG_PROJECT_TOKEN");
  });

  it("rejects the app-facing PostHog host during Workers Builds", () => {
    expect(() =>
      selectCloudflareBuildPlan({
        CONVEX_DEPLOY_KEY: "prod-key",
        VITE_PUBLIC_POSTHOG_HOST: "https://posthog.samebase.com",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toThrow("Do not set VITE_PUBLIC_POSTHOG_HOST");
  });

  it("selects the production build for the main branch", () => {
    expect(
      selectCloudflareBuildPlan({
        CONVEX_DEPLOY_KEY: "prod-key",
        PROD_POSTHOG_PROJECT_TOKEN: "phc_prod",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toEqual({
      kind: "production",
      deployArgs: [
        "exec",
        "convex",
        "deploy",
        "--cmd",
        "pnpm run build:ci && node ./scripts/verify-current-branch-head.ts",
      ],
      postHogProjectToken: "phc_prod",
      routeEnvironment: "production",
    });
  });

  it("keeps PostHog disabled when the production token is not configured", () => {
    expect(
      selectCloudflareBuildPlan({
        CONVEX_DEPLOY_KEY: "prod-key",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toMatchObject({
      kind: "production",
      postHogProjectToken: null,
    });
  });

  it("uses the branch name for the Convex Preview and seed", () => {
    expect(
      selectCloudflareBuildPlan({
        CONVEX_DEPLOY_KEY: "preview-key",
        PROD_POSTHOG_PROJECT_TOKEN: "phc_prod",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "feature-branch",
      }),
    ).toEqual({
      kind: "preview",
      deployArgs: [
        "exec",
        "convex",
        "deploy",
        "--preview-name",
        "feature-branch",
        "--cmd",
        "pnpm run build:ci && node ./scripts/verify-current-branch-head.ts",
      ],
      previewName: "feature-branch",
      routeEnvironment: "preview",
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

  it("seeds after a successful named Preview deploy", async () => {
    const invocations: Array<{
      operation: string | undefined;
      deployKey: string | undefined;
    }> = [];
    const runNodeCommand = (
      _entrypoint: string,
      args: readonly string[],
      env: NodeJS.ProcessEnv,
    ) => {
      invocations.push({
        operation: args[2] === "deploy" ? "deploy" : args[3],
        deployKey: env["CONVEX_DEPLOY_KEY"],
      });
      return Promise.resolve();
    };
    const env = {
      CONVEX_DEPLOY_KEY: "preview-key",
      WORKERS_CI: "1",
      WORKERS_CI_BRANCH: "feature-branch",
      WORKERS_CI_COMMIT_SHA: "current-commit",
    };

    await main(env, runNodeCommand);

    expect(invocations).toEqual([
      { operation: "deploy", deployKey: "preview-key" },
      { operation: "devAuth:seedPasswordAccount", deployKey: "preview-key" },
    ]);
  });

  it("does not seed when the named Preview deploy fails", async () => {
    const invocations: Array<string | undefined> = [];
    const runNodeCommand = (_entrypoint: string, args: readonly string[]) => {
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
        runNodeCommand,
      ),
    ).rejects.toThrow("deploy failed");

    expect(invocations).toEqual(["deploy"]);
  });

  it("does not accept the legacy key for a Preview build", () => {
    expect(() =>
      selectCloudflareBuildPlan({
        PREVIEW_CONVEX_DEPLOY_KEY: "legacy-key",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "feature-branch",
      }),
    ).toThrow("Use a Convex project Preview deploy key.");
  });

  it("requires the production key with the current least-privilege permission set", () => {
    expect(() =>
      selectCloudflareBuildPlan({
        PREVIEW_CONVEX_DEPLOY_KEY: "legacy-key",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toThrow(
      "Use a Convex production deploy key with exactly deployment:deploy, deployment:env:view, deployment:env:write, and deployment:data:view.",
    );
  });
});
