import { describe, expect, it } from "vite-plus/test";
import { isLandingDevModeEnabled } from "@/publicSite/landingDevMode";

describe("landingDevMode", () => {
  it("reads dev mode by key presence", () => {
    expect(isLandingDevModeEnabled({ dev: false })).toBe(true);
    expect(isLandingDevModeEnabled({ dev: "false" })).toBe(true);
    expect(isLandingDevModeEnabled({ dev: undefined })).toBe(false);
    expect(isLandingDevModeEnabled({ dev: null })).toBe(false);
    expect(isLandingDevModeEnabled({})).toBe(false);
  });
});
