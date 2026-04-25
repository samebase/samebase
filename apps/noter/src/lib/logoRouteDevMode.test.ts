import { describe, expect, it } from "vite-plus/test";
import { ensureLogoRouteDevModeSearch } from "@/lib/logoRouteDevMode";

describe("logoRouteDevMode", () => {
  it("accepts key-only dev flags without redirecting", () => {
    expect(() =>
      ensureLogoRouteDevModeSearch({
        hash: "",
        pathname: "/logo",
        search: {
          dev: "",
        },
      }),
    ).not.toThrow();
  });

  it("redirects direct loads that are missing the public dev flag", () => {
    expect(() =>
      ensureLogoRouteDevModeSearch({
        hash: "",
        pathname: "/logo",
        search: {
          leftColor: "red-600",
        },
      }),
    ).toThrow();
  });
});
