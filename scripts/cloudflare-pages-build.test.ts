import { describe, expect, it } from "vitest";

import {
  buildCloudflarePagesArgs,
  resolveCloudflarePagesBuildMode,
} from "./cloudflare-pages-build.ts";

describe("cloudflare-pages-build", () => {
  it("uses the production deploy path when Cloudflare does not provide a branch", () => {
    expect(resolveCloudflarePagesBuildMode({})).toEqual({
      branch: undefined,
      mode: "production",
    });

    expect(buildCloudflarePagesArgs({})).toEqual([
      "--dir",
      "apps/noter",
      "exec",
      "convex",
      "deploy",
      "--cmd",
      "pnpm run build:ci",
    ]);
  });

  it("treats the main branch as production", () => {
    expect(
      resolveCloudflarePagesBuildMode({
        CF_PAGES_BRANCH: "main",
      }),
    ).toEqual({
      branch: "main",
      mode: "production",
    });
  });

  it("creates a preview deploy for non-main branches", () => {
    expect(
      resolveCloudflarePagesBuildMode({
        CF_PAGES_BRANCH: "feature/fix-preview",
      }),
    ).toEqual({
      branch: "feature/fix-preview",
      mode: "preview",
    });

    expect(
      buildCloudflarePagesArgs({
        CF_PAGES_BRANCH: "feature/fix-preview",
      }),
    ).toEqual([
      "--dir",
      "apps/noter",
      "exec",
      "convex",
      "deploy",
      "--preview-create",
      "feature/fix-preview",
      "--preview-run",
      "devAuth:seedPasswordAccount",
      "--cmd",
      "pnpm run build:ci",
    ]);
  });
});
