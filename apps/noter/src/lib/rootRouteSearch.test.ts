import { describe, expect, it } from "vite-plus/test";
import {
  readRootRouteSearch,
  validateRootRouteSearch,
} from "./rootRouteSearch";

describe("rootRouteSearch", () => {
  it("accepts the routed root landing flags and auth provider", () => {
    expect(
      validateRootRouteSearch({
        auth: "google",
        base: "#ffffff",
        dev: "",
        devtools: "true",
        primary: "red-600",
        "prod-ui": "",
        secondary: "lime-100",
        signup: "google",
      }),
    ).toEqual({
      auth: "google",
      base: "#ffffff",
      dev: true,
      devtools: true,
      primary: "red-600",
      "prod-ui": true,
      secondary: "lime-100",
      signup: "google",
    });
  });

  it("drops malformed root landing search values instead of preserving junk", () => {
    expect(
      validateRootRouteSearch({
        auth: "github",
        base: "bad",
        dev: "1",
        devtools: "false",
        primary: "nope-500",
        "prod-ui": false,
        secondary: 3,
        signup: "github",
      }),
    ).toEqual({});
  });

  it("parses the root search contract from a search string", () => {
    expect(
      readRootRouteSearch(
        "?prod-ui&dev&auth=google&signup=google&primary=red-600",
      ),
    ).toEqual({
      auth: "google",
      dev: true,
      primary: "red-600",
      "prod-ui": true,
      signup: "google",
    });
  });
});
