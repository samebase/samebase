import { describe, expect, it } from "vite-plus/test";
import {
  LANDING_DEV_MODE_DISABLE_LINK_LABEL,
  LANDING_DEV_MODE_LINK_LABEL,
  buildLandingDevModeSearch,
} from "@/lib/landingDevMode";

describe("landingDevMode", () => {
  it("builds root-route search without dropping unrelated flags", () => {
    expect(
      buildLandingDevModeSearch(
        {
          auth: "google",
          devtools: true,
          "prod-ui": true,
        },
        true,
      ),
    ).toEqual({
      auth: "google",
      dev: true,
      devtools: true,
      "prod-ui": true,
    });
  });

  it("uses search-param-only labels for the dev shortcuts", () => {
    expect(LANDING_DEV_MODE_LINK_LABEL).toBe("?dev");
    expect(LANDING_DEV_MODE_DISABLE_LINK_LABEL).toBe("?-dev");
  });
});
