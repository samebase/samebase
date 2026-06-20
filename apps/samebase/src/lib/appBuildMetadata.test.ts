import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { AppBuildConfig } from "@/lib/appBuildConfig";

afterEach(() => {
  vi.doUnmock("@/lib/appBuildConfig");
  vi.resetModules();
});

const testAppBuildConfig: AppBuildConfig = __APP_BUILD_CONFIG__;

async function readAppBuildCommitFor(buildConfig: AppBuildConfig) {
  vi.doMock("@/lib/appBuildConfig", () => ({
    appBuildConfig: buildConfig,
  }));

  const { readAppBuildCommit } = await import("@/lib/appBuildMetadata");
  return readAppBuildCommit();
}

describe("readAppBuildCommit", () => {
  it("returns the commit hash when it is present", async () => {
    const appBuildCommit = await readAppBuildCommitFor({
      ...testAppBuildConfig,
      appCommit: "0123456789abcdef",
      appCommitNumber: 463,
    });

    expect(appBuildCommit).toBe("0123456789abcdef");
  });

  it("falls back to the build number when the commit marker is unknown", async () => {
    const appBuildCommit = await readAppBuildCommitFor({
      ...testAppBuildConfig,
      appCommit: "unknown",
      appCommitNumber: 463,
    });

    expect(appBuildCommit).toBe("build-463");
  });

  it("falls back to dev when neither a commit nor build number is available", async () => {
    const appBuildCommit = await readAppBuildCommitFor({
      ...testAppBuildConfig,
      appCommit: "   ",
      appCommitNumber: null,
    });

    expect(appBuildCommit).toBe("dev");
  });
});
