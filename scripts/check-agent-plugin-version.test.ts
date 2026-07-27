import { describe, expect, it } from "vite-plus/test";

import { isReleaseVersionGreater } from "./check-agent-plugin-version.ts";

describe("agent plugin release versions", () => {
  it("accepts a strictly greater numeric release version", () => {
    expect(isReleaseVersionGreater("0.2.1", "0.2.0")).toBe(true);
    expect(isReleaseVersionGreater("0.3.0", "0.2.9")).toBe(true);
    expect(isReleaseVersionGreater("1.0.0", "0.99.99")).toBe(true);
  });

  it("rejects equal, lower, and non-release versions", () => {
    expect(isReleaseVersionGreater("0.2.0", "0.2.0")).toBe(false);
    expect(isReleaseVersionGreater("0.1.9", "0.2.0")).toBe(false);
    expect(() => isReleaseVersionGreater("0.2.1-beta.1", "0.2.0")).toThrow(
      "numeric major.minor.patch",
    );
  });
});
