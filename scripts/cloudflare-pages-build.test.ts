import { describe, expect, it } from "vitest";

import {
  buildConvexDeployArgs,
  buildCloudflarePagesBuildEnvironment,
  buildInnerBuildCommand,
  inferConvexDeploymentName,
  resolveCloudflarePagesSiteUrl,
  shouldCreatePreviewDeployment,
} from "./cloudflare-pages-build.ts";

describe("cloudflare-pages-build", () => {
  it("prefers an explicit Convex site URL over the Cloudflare deployment URL", () => {
    expect(
      resolveCloudflarePagesSiteUrl({
        cloudflarePagesUrl: "https://preview.noter.pages.dev",
        convexSiteUrl: "https://noter.md",
      }),
    ).toBe("https://noter.md/");
  });

  it("falls back to the current Cloudflare deployment URL for previews", () => {
    expect(
      resolveCloudflarePagesSiteUrl({
        cloudflarePagesUrl: "https://feature-123.noter.pages.dev",
      }),
    ).toBe("https://feature-123.noter.pages.dev/");
  });

  it("derives the deployment name from the Convex deployment URL", () => {
    expect(
      inferConvexDeploymentName("https://quiet-robin-508.convex.cloud"),
    ).toBe("quiet-robin-508");
    expect(inferConvexDeploymentName("not-a-url")).toBeNull();
  });

  it("injects the build-time site URL without mutating the original environment", () => {
    const originalEnv = {
      VITE_CONVEX_URL: "https://quiet-robin-508.convex.cloud",
    };

    expect(
      buildCloudflarePagesBuildEnvironment(
        originalEnv,
        "VITE_CONVEX_SITE_URL",
        "https://preview.noter.pages.dev",
      ),
    ).toEqual({
      VITE_CONVEX_URL: "https://quiet-robin-508.convex.cloud",
      VITE_CONVEX_SITE_URL: "https://preview.noter.pages.dev",
    });
    expect(originalEnv).toEqual({
      VITE_CONVEX_URL: "https://quiet-robin-508.convex.cloud",
    });
  });

  it("builds the nested inner-build command with stable quoting", () => {
    expect(
      buildInnerBuildCommand(
        "/repo/scripts/cloudflare-pages-build.ts",
        "/usr/local/bin/node",
      ),
    ).toBe(
      '"/usr/local/bin/node" "/repo/scripts/cloudflare-pages-build.ts" --inner-build',
    );
  });

  it("treats non-main Pages branches as preview deployments", () => {
    expect(shouldCreatePreviewDeployment("feature/pr-preview")).toBe(true);
    expect(shouldCreatePreviewDeployment("main")).toBe(false);
    expect(shouldCreatePreviewDeployment("")).toBe(false);
  });

  it("wraps the app build with Convex deploy for production", () => {
    expect(
      buildConvexDeployArgs("/repo/scripts/cloudflare-pages-build.ts", "main"),
    ).toEqual([
      "convex",
      "deploy",
      "--cmd-url-env-var-name",
      "VITE_CONVEX_URL",
      "--cmd",
      `${JSON.stringify(process.execPath)} "/repo/scripts/cloudflare-pages-build.ts" --inner-build`,
    ]);
  });

  it("adds preview-create for Cloudflare preview branches", () => {
    expect(
      buildConvexDeployArgs(
        "/repo/scripts/cloudflare-pages-build.ts",
        "feature/pr-preview",
      ),
    ).toEqual([
      "convex",
      "deploy",
      "--preview-create",
      "feature/pr-preview",
      "--cmd-url-env-var-name",
      "VITE_CONVEX_URL",
      "--cmd",
      `${JSON.stringify(process.execPath)} "/repo/scripts/cloudflare-pages-build.ts" --inner-build`,
    ]);
  });
});
