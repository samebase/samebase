import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { NoterBuildConfig } from "@/lib/noterBuildConfig";

afterEach(() => {
  vi.doUnmock("@/lib/noterBuildConfig");
  vi.resetModules();
});

const testNoterBuildConfig: NoterBuildConfig = __NOTER_BUILD_CONFIG__;

async function readAppBuildCommitFor(buildConfig: NoterBuildConfig) {
  vi.doMock("@/lib/noterBuildConfig", () => ({
    noterBuildConfig: buildConfig,
  }));

  const { readAppBuildCommit } = await import("@/lib/appBuildMetadata");
  return readAppBuildCommit();
}

describe("readAppBuildCommit", () => {
  it("returns the commit hash when it is present", async () => {
    const appBuildCommit = await readAppBuildCommitFor({
      ...testNoterBuildConfig,
      appCommit: "0123456789abcdef",
      appCommitNumber: 463,
    });

    expect(appBuildCommit).toBe("0123456789abcdef");
  });

  it("falls back to the build number when the commit marker is unknown", async () => {
    const appBuildCommit = await readAppBuildCommitFor({
      ...testNoterBuildConfig,
      appCommit: "unknown",
      appCommitNumber: 463,
    });

    expect(appBuildCommit).toBe("build-463");
  });

  it("falls back to dev when neither a commit nor build number is available", async () => {
    const appBuildCommit = await readAppBuildCommitFor({
      ...testNoterBuildConfig,
      appCommit: "   ",
      appCommitNumber: null,
    });

    expect(appBuildCommit).toBe("dev");
  });
});
