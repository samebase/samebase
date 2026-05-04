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
        border: "stone-300",
        delete: "noter-md/noter",
        dark: "",
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
      border: "stone-300",
      delete: "noter-md/noter",
      dark: true,
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
        border: "nope-500",
        delete: "missing-repo-separator",
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
        "?prod-ui&dev&auth=google&signup=google&primary=red-600&delete=noter-md%2Fnoter",
      ),
    ).toEqual({
      auth: "google",
      delete: "noter-md/noter",
      dev: true,
      primary: "red-600",
      "prod-ui": true,
      signup: "google",
    });
  });

  it("ignores all other parsed root params while reset is present", () => {
    expect(readRootRouteSearch("?reset=true&primary=red-600&devtools")).toEqual(
      { reset: true },
    );
  });

  it("does not activate reset from invalid typed values", () => {
    expect(
      validateRootRouteSearch({
        primary: "red-600",
        reset: false,
      }),
    ).toEqual({
      primary: "red-600",
    });

    expect(validateRootRouteSearch({ reset: "true" })).toEqual({});
    expect(validateRootRouteSearch({ reset: 0 })).toEqual({});
  });

  it("preserves conflicting light and dark flags for root route canonicalization", () => {
    expect(readRootRouteSearch("?dev&light&dark")).toEqual({
      dark: true,
      dev: true,
      light: true,
    });
  });
});
