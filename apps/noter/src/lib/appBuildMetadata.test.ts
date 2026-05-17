import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { readAppBuildCommit } from "#src/lib/appBuildMetadata.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readAppBuildCommit", () => {
  it("returns the commit hash when it is present", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);

    expect(readAppBuildCommit()).toBe("0123456789abcdef");
  });

  it("falls back to the build number when the commit marker is unknown", () => {
    vi.stubGlobal("__APP_COMMIT__", "unknown");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);

    expect(readAppBuildCommit()).toBe("build-463");
  });

  it("falls back to dev when neither a commit nor build number is available", () => {
    vi.stubGlobal("__APP_COMMIT__", "   ");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", null);

    expect(readAppBuildCommit()).toBe("dev");
  });
});
