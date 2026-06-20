import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { SamebaseBuildConfig } from "@/lib/samebaseBuildConfig";

afterEach(() => {
  vi.doUnmock("@/lib/samebaseBuildConfig");
  vi.resetModules();
});

const testSamebaseBuildConfig: SamebaseBuildConfig = __SAMEBASE_BUILD_CONFIG__;

async function readAppBuildCommitFor(buildConfig: SamebaseBuildConfig) {
  vi.doMock("@/lib/samebaseBuildConfig", () => ({
    samebaseBuildConfig: buildConfig,
  }));

  const { readAppBuildCommit } = await import("@/lib/appBuildMetadata");
  return readAppBuildCommit();
}

describe("readAppBuildCommit", () => {
  it("returns the commit hash when it is present", async () => {
    const appBuildCommit = await readAppBuildCommitFor({
      ...testSamebaseBuildConfig,
      appCommit: "0123456789abcdef",
      appCommitNumber: 463,
    });

    expect(appBuildCommit).toBe("0123456789abcdef");
  });

  it("falls back to the build number when the commit marker is unknown", async () => {
    const appBuildCommit = await readAppBuildCommitFor({
      ...testSamebaseBuildConfig,
      appCommit: "unknown",
      appCommitNumber: 463,
    });

    expect(appBuildCommit).toBe("build-463");
  });

  it("falls back to dev when neither a commit nor build number is available", async () => {
    const appBuildCommit = await readAppBuildCommitFor({
      ...testSamebaseBuildConfig,
      appCommit: "   ",
      appCommitNumber: null,
    });

    expect(appBuildCommit).toBe("dev");
  });
});
