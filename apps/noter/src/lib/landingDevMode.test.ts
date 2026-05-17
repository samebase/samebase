import { describe, expect, it } from "vite-plus/test";
import {
  LANDING_DEV_MODE_DISABLE_LINK_LABEL,
  LANDING_DEV_MODE_LINK_LABEL,
  isLandingDevModeEnabled,
} from "#src/lib/landingDevMode.ts";

describe("landingDevMode", () => {
  it("uses search-param-only labels for the dev shortcuts", () => {
    expect(LANDING_DEV_MODE_LINK_LABEL).toBe("?dev");
    expect(LANDING_DEV_MODE_DISABLE_LINK_LABEL).toBe("?-dev");
  });

  it("reads dev mode by key presence", () => {
    expect(isLandingDevModeEnabled({ dev: false })).toBe(true);
    expect(isLandingDevModeEnabled({ dev: "false" })).toBe(true);
    expect(isLandingDevModeEnabled({ dev: undefined })).toBe(false);
    expect(isLandingDevModeEnabled({ dev: null })).toBe(false);
    expect(isLandingDevModeEnabled({})).toBe(false);
  });
});
