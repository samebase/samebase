import { describe, expect, it } from "vite-plus/test";
import {
  buildLandingDevModeSearch,
  buildLandingDevToggleSearch,
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

  it("toggles the dev flag using the root-route search contract", () => {
    expect(
      buildLandingDevToggleSearch({
        dev: true,
        devtools: true,
      }),
    ).toEqual({
      dev: undefined,
      devtools: true,
    });
  });
});
