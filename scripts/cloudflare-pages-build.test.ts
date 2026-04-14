import { describe, expect, it } from "vitest";

import {
  buildConvexDeployArgs,
  buildCloudflarePagesBuildEnvironment,
  buildInnerBuildCommand,
  inferConvexDeploymentName,
  resolveCloudflarePagesSiteUrl,
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

  it("wraps the app build with Convex deploy and preview seeding", () => {
    expect(
      buildConvexDeployArgs("/repo/scripts/cloudflare-pages-build.ts"),
    ).toEqual([
      "convex",
      "deploy",
      "--preview-run",
      "devAuth:seedPasswordAccount",
      "--cmd-url-env-var-name",
      "VITE_CONVEX_URL",
      "--cmd",
      `${JSON.stringify(process.execPath)} "/repo/scripts/cloudflare-pages-build.ts" --inner-build`,
    ]);
  });
});
