import { describe, expect, it } from "vitest";

import { formatAppBuildVersionLabel } from "./appBuild";

describe("formatAppBuildVersionLabel", () => {
  it("renders the one-based repo version label from a commit count", () => {
    expect(formatAppBuildVersionLabel(1)).toBe("v 1");
    expect(formatAppBuildVersionLabel(123)).toBe("v 123");
  });

  it("falls back to an unknown label when the commit count is unavailable", () => {
    expect(formatAppBuildVersionLabel(null)).toBe("v ?");
    expect(formatAppBuildVersionLabel(0)).toBe("v ?");
    expect(formatAppBuildVersionLabel(Number.NaN)).toBe("v ?");
  });
});
