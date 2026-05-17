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
        depth: "2",
        dark: "",
        dev: "",
        devtools: "true",
        primary: "red-600",
        "prod-ui": "",
        secondary: "lime-100",
        "sidebar-reset": "",
        signup: "google",
        top: "white-base",
      }),
    ).toEqual({
      auth: "google",
      background: "#ffffff",
      border: "stone-300",
      delete: "noter-md/noter",
      depth: 2,
      dark: true,
      dev: true,
      devtools: true,
      primary: "red-600",
      "prod-ui": true,
      secondary: "lime-100",
      "sidebar-reset": true,
      signup: "google",
      top: "white-base",
    });
  });

  it("drops malformed root landing search values instead of preserving junk", () => {
    expect(
      validateRootRouteSearch({
        auth: "github",
        background: "bad",
        border: "nope-500",
        delete: "missing-repo-separator",
        depth: "nope",
        primary: "nope-500",
        secondary: 3,
        "sidebar-reset": "false",
        signup: "github",
      }),
    ).toEqual({});
  });

  it("treats present root flags as enabled regardless of value", () => {
    expect(
      validateRootRouteSearch({
        dark: "false",
        dev: "1",
        devtools: "false",
        light: 0,
        "prod-ui": false,
      }),
    ).toEqual({
      dark: true,
      dev: true,
      devtools: true,
      light: true,
      "prod-ui": true,
    });
  });

  it("parses the root search contract from a search string", () => {
    expect(
      readRootRouteSearch(
        "?prod-ui&dev&sidebar-reset&auth=google&signup=google&primary=red-600&delete=noter-md%2Fnoter",
      ),
    ).toEqual({
      auth: "google",
      delete: "noter-md/noter",
      dev: true,
      primary: "red-600",
      "prod-ui": true,
      "sidebar-reset": true,
      signup: "google",
    });
  });

  it("normalizes root logo depth without capping deliberate values", () => {
    expect(readRootRouteSearch("?depth=99")).toEqual({
      depth: 99,
    });
  });

  it("ignores all other parsed root params while reset is present", () => {
    expect(readRootRouteSearch("?reset=true&primary=red-600&devtools")).toEqual(
      { reset: true },
    );
  });

  it("activates reset from any present value", () => {
    expect(
      validateRootRouteSearch({
        primary: "red-600",
        reset: false,
      }),
    ).toEqual({ reset: true });

    expect(validateRootRouteSearch({ reset: "true" })).toEqual({
      reset: true,
    });
    expect(validateRootRouteSearch({ reset: 0 })).toEqual({ reset: true });
    expect(validateRootRouteSearch({ reset: undefined })).toEqual({});
    expect(validateRootRouteSearch({ reset: null })).toEqual({});
  });

  it("preserves conflicting light and dark flags for root route canonicalization", () => {
    expect(readRootRouteSearch("?dev&light&dark")).toEqual({
      dark: true,
      dev: true,
      light: true,
    });
  });
});
